/**
 * Statistical primitives for the prediction engine.
 *
 * Every function here is pure and side-effect free, which makes the engine
 * deterministic and directly unit-testable.
 */
import {
  finite,
  iqr,
  mad,
  mean,
  median,
  percentile,
  round,
  sortedAscending,
  stddev,
  sum,
} from '@/src/utils/math';

/** Full descriptive summary of a duration sample, in minutes. */
export interface DistributionSummary {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
  readonly p95: number;
  readonly stddev: number;
  readonly mad: number;
  readonly iqr: number;
  /** Coefficient of variation, stddev / mean. Undefined when mean is 0. */
  readonly coefficientOfVariation: number;
}

/**
 * Computes the descriptive statistics the engine needs.
 *
 * Empty samples are *not* an error: the caller decides how to fall back to
 * the template's `expectedDurationMin`. We return a neutral summary so
 * downstream arithmetic never has to null-check every field.
 */
export function summarizeDurations(values: readonly number[]): DistributionSummary {
  const clean = finite(values);

  if (clean.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      stddev: 0,
      mad: 0,
      iqr: 0,
      coefficientOfVariation: 0,
    };
  }

  const mu = mean(clean) ?? 0;
  const deviation = stddev(clean);
  const sorted = sortedAscending(clean);

  return {
    count: clean.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: round(mu, 2),
    median: round(median(clean) ?? 0, 2),
    p50: round(percentile(clean, 0.5) ?? 0, 2),
    p75: round(percentile(clean, 0.75) ?? 0, 2),
    p90: round(percentile(clean, 0.9) ?? 0, 2),
    p95: round(percentile(clean, 0.95) ?? 0, 2),
    stddev: round(deviation, 2),
    mad: round(mad(clean), 2),
    iqr: round(iqr(clean), 2),
    coefficientOfVariation: mu > 0 ? round(deviation / mu, 4) : 0,
  };
}

/**
 * Shrinks an observed sample toward a prior expectation.
 *
 * The engine only trusts history once there is enough of it. With `n`
 * observations and prior weight `k`, the blended mean is
 *
 *     (n * observedMean + k * priorMean) / (n + k)
 *
 * so a brand-new route sits at its expected duration and converges on the
 * user's real experience as data accumulates. `k` is expressed in
 * "pseudo-observations".
 */
export function shrinkToPrior(
  observedMean: number,
  observations: number,
  priorMean: number,
  priorWeight: number,
): number {
  const n = Math.max(0, observations);
  const k = Math.max(0, priorWeight);
  if (n + k === 0) return priorMean;
  return (n * observedMean + k * priorMean) / (n + k);
}

/**
 * Blends an observed percentile toward a prior, with the same
 * pseudo-observation weighting as {@link shrinkToPrior}.
 */
export function shrinkPercentileToPrior(
  observedPercentile: number,
  observations: number,
  priorPercentile: number,
  priorWeight: number,
): number {
  return shrinkToPrior(observedPercentile, observations, priorPercentile, priorWeight);
}

/**
 * Assumes a dispersion for a route with little history.
 *
 * Relative spread (as a fraction of the mean) shrinks as samples accumulate:
 * we are guessing 30% for an unobserved leg and 12% once we have 20 trips.
 * Real commute legs are right-skewed, so the coefficient of variation is
 * deliberately higher than for a symmetric distribution.
 */
export function assumedCoefficientOfVariation(observations: number): number {
  const n = Math.max(0, observations);
  if (n >= 20) return 0.12;
  if (n >= 10) return 0.16;
  if (n >= 5) return 0.2;
  if (n >= 2) return 0.25;
  return 0.3;
}

/**
 * Pads a small sample into a synthetic distribution.
 *
 * With a handful of observations the empirical P90 is just the worst day you
 * had, which is not a useful basis for planning. We instead generate a
 * right-skewed (lognormal-ish) sample around the shrunk mean at the assumed
 * coefficient of variation, so P90 reflects the *shape* of travel-time
 * variability rather than the specific sample.
 *
 * The default `random` is derived from `centerMean` and `size` rather than
 * `Math.random`, so a call with the same arguments always produces the same
 * sample. Reproducibility is a hard requirement: the app must not contradict
 * its own leave-by time between renders. Callers that need a distinct stream
 * pass their own seeded generator.
 */
export function synthesizeDistribution(
  centerMean: number,
  coefficientOfVariation: number,
  size = 200,
  random: () => number = seededFallbackRandom(centerMean, size),
): number[] {
  if (size <= 0) return [];

  const cv = Math.max(0.01, coefficientOfVariation);
  // Lognormal parameters chosen so the mean and CV match the request.
  const sigmaSquared = Math.log(1 + cv * cv);
  const mu = Math.log(Math.max(0.5, centerMean)) - sigmaSquared / 2;

  const out: number[] = [];
  for (let i = 0; i < size; i += 1) {
    // Box-Muller, guarded against log(0).
    const u1 = Math.max(1e-9, random());
    const u2 = random();
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    out.push(Math.exp(mu + Math.sqrt(sigmaSquared) * normal));
  }
  return out;
}

/**
 * Builds the duration sample the engine simulates against.
 *
 * With enough history we use the real observations. Below the threshold we
 * blend toward the template's expectation and synthesize a realistic spread,
 * so every route has a usable distribution from day one.
 */
export function buildDurationSample(options: {
  readonly observations: readonly number[];
  readonly expectedDurationMin: number;
  readonly priorWeight?: number;
  readonly minTrustworthySamples?: number;
  /** Seeded source used when synthesising a distribution. */
  readonly random?: () => number;
}): number[] {
  const {
    observations,
    expectedDurationMin,
    priorWeight = 4,
    minTrustworthySamples = 5,
    random,
  } = options;

  const clean = finite(observations);

  if (clean.length >= minTrustworthySamples) {
    return clean;
  }

  const observedMean = mean(clean);
  const blendedMean =
    observedMean === null
      ? expectedDurationMin
      : shrinkToPrior(observedMean, clean.length, expectedDurationMin, priorWeight);

  const cv = assumedCoefficientOfVariation(clean.length);
  return synthesizeDistribution(blendedMean, cv, 200, random);
}

/**
 * Deterministic default generator for {@link synthesizeDistribution}.
 *
 * Seeded from the arguments rather than the clock, so two calls with the same
 * inputs produce the same distribution.
 */
function seededFallbackRandom(seedValue: number, size: number): () => number {
  let state = (Math.imul(Math.round(seedValue * 1000), 2654435761) ^ Math.imul(size, 40503)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The share of `values` that are at or below `threshold`. */
export function fractionAtOrBelow(values: readonly number[], threshold: number): number {
  const clean = finite(values);
  if (clean.length === 0) return 0;
  let count = 0;
  for (const value of clean) {
    if (value <= threshold) count += 1;
  }
  return count / clean.length;
}

/** Totals for a batch of per-leg duration arrays. */
export function totalDurations(legs: readonly (readonly number[])[]): number[] {
  if (legs.length === 0) return [];
  const length = Math.max(...legs.map((leg) => leg.length));
  const out = new Array<number>(length).fill(0);
  for (const leg of legs) {
    for (let i = 0; i < length; i += 1) out[i] += leg[i % leg.length];
  }
  return out;
}

export { finite, iqr, mad, mean, median, percentile, round, sortedAscending, stddev, sum };
