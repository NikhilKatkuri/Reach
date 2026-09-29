/**
 * Deterministic pseudo-random number generation.
 *
 * The prediction engine must be reproducible: the same history and the same
 * conditions must always produce the same `leaveBy`, or the app would give
 * contradictory advice between renders. It also means the engine's unit tests
 * assert exact numbers.
 *
 * `mulberry32` is used because it is 32-bit, fast, has a long enough period
 * for our purposes, and passes gjrandwell's basic tests for our use.
 */

/** A seeded generator function returning values in `[0, 1)`. */
export type RandomSource = () => number;

/**
 * Creates a deterministic generator from a 32-bit seed.
 *
 * @param seed Any integer. The same seed always yields the same sequence.
 */
export function createRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hashes a string into a 32-bit seed (FNV-1a).
 *
 * Used to seed the engine from a route signature so each route's simulation
 * is independent and stable.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Creates a generator seeded from a string. */
export function createSeededRandom(key: string): RandomSource {
  return createRandom(hashString(key));
}

/**
 * Samples from a normal distribution via the Box-Muller transform.
 *
 * @param mean Target mean.
 * @param standardDeviation Spread; values below 1e-9 collapse to `mean`.
 * @param random Source of uniform values.
 */
export function sampleNormal(
  mean: number,
  standardDeviation: number,
  random: RandomSource,
): number {
  if (standardDeviation <= 1e-9) return mean;
  const u1 = Math.max(1e-9, random());
  const u2 = random();
  return mean + standardDeviation * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Samples from a lognormal distribution.
 *
 * Commute durations are right-skewed — bad days are much worse than good days
 * are better — so lognormal is a much better fit than normal. A lognormal
 * with the given mean and coefficient of variation has
 *
 *     sigma^2 = ln(1 + cv^2)
 *     mu      = ln(mean) - sigma^2 / 2
 */
export function sampleLogNormal(
  mean: number,
  coefficientOfVariation: number,
  random: RandomSource,
): number {
  if (mean <= 0) return 0;
  const cv = Math.max(0, coefficientOfVariation);
  const sigmaSquared = Math.log(1 + cv * cv);
  if (sigmaSquared <= 1e-12) return mean;
  const mu = Math.log(mean) - sigmaSquared / 2;
  return Math.exp(mu + Math.sqrt(sigmaSquared) * sampleNormal(0, 1, random));
}

/** Picks a uniformly random element, or `undefined` for an empty array. */
export function pick<T>(items: readonly T[], random: RandomSource): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random() * items.length) % items.length];
}

/**
 * Picks an index from a weight vector.
 *
 * Used to sample a plausible crowd level for a leg given the historical
 * distribution of crowds on that leg.
 */
export function pickWeighted(weights: readonly number[], random: RandomSource): number {
  let total = 0;
  for (const weight of weights) total += Math.max(0, weight);
  if (total <= 0) return 0;

  let threshold = random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    threshold -= Math.max(0, weights[i]);
    if (threshold <= 0) return i;
  }
  return weights.length - 1;
}
