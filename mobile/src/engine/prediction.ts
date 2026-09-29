/**
 * The Reach prediction engine.
 *
 * This is the core of the app: it turns a template's route graph plus the
 * user's own commute history into a single actionable answer — leave by this
 * time, take this route, arrive at this time, with this much confidence.
 *
 * ## Pipeline
 *
 * 1. **Enumerate candidates** (`graph.ts`) — every simple path from origin to
 *    destination, plus named routes the user has taken before.
 * 2. **Build per-leg duration distributions** — real history where there is
 *    enough of it, shrunk toward the template's expectation where there is not.
 * 3. **Apply conditions** — weather and traffic shift the mean; traffic and
 *    crowd also widen the spread, which is what makes rail win in the rain.
 * 4. **Layer in transfer risk** — expected minutes lost to missed connections,
 *    plus dispersion for the leg after each interchange.
 * 5. **Score reliability** (`reliability.ts`) — a weighted composite, blended
 *    toward neutral by how much data exists.
 * 6. **Select and explain** — highest reliability wins, with a tiebreak on
 *    P90 so an equally-reliable slower route is not preferred.
 *
 * ## Why Monte Carlo
 *
 * Total duration is a sum of dependent legs, and the dependencies matter. If
 * rain slows traffic it slows *every* road leg in the trip, so simply summing
 * per-leg P90s badly overstates the total. Simulating the joint distribution
 * and reading percentiles off the totals is both more correct and easier to
 * explain: the P90 we report is an actual simulated arrival time, not a
 * worst-case sum.
 *
 * No LLM is involved anywhere in this file. The output is arithmetic.
 */
import {
  type CommuteTemplate,
  type CrowdLevel,
  type Prediction,
  type ReliabilityFactor,
  type RouteCandidate,
  type Segment,
  type TemplateGraph,
  type TrafficLevel,
  type TransportMode,
  type WeatherCondition,
  ALGORITHM_VERSION,
} from '@/src/types/schemas';
import { type RoutePath, buildGraph, describeRoute, enumerateRoutes } from './graph';
import {
  computeReliability,
  confidenceFromObservations,
  suggestedBufferMinutes,
} from './reliability';
import { type RandomSource, createSeededRandom, sampleLogNormal } from './random';
import { buildDurationSample, fractionAtOrBelow, summarizeDurations } from './statistics';
import { summarizeTransferRisk, evaluateRouteTransfers } from './transferRisk';
import { crowdPenalty } from './crowdPenalty';
import { trafficPenalty } from './trafficPenalty';
import { weatherPenalty } from './weatherPenalty';
import { clamp, clamp01, round, stddev } from '@/src/utils/math';

/** Monte Carlo iterations. 2000 gives ~1.4% resolution on a probability. */
const DEFAULT_ITERATIONS = 2000;

/** Historical observations needed to trust a route's raw distribution. */
const MIN_TRUSTWORTHY_SAMPLES = 5;

/** Pseudo-observation weight of the template's expected duration. */
const PRIOR_WEIGHT = 4;

/** Everything the engine needs from history. Assembled by the query layer. */
export interface HistoryInput {
  /** Per-segment duration observations, keyed by segment id. */
  readonly segmentDurations: Readonly<Record<string, readonly number[]>>;
  /** Per-route total duration observations, keyed by route signature. */
  readonly routeDurations: Readonly<Record<string, readonly number[]>>;
  /** Per-route on-time counts, keyed by route signature. */
  readonly routeOnTime: Readonly<Record<string, { onTime: number; total: number }>>;
  /** Per-route missed-transfer counts, keyed by route signature. */
  readonly routeMissedTransfers: Readonly<Record<string, number>>;
  /** Per-segment worst observed crowd, keyed by segment id. */
  readonly segmentWorstCrowd: Readonly<Record<string, CrowdLevel>>;
}

/** Conditions in force for the prediction. */
export interface ConditionInput {
  readonly weather: WeatherCondition;
  readonly traffic: TrafficLevel;
  /** Optional worst crowd observed on recent trips. */
  readonly crowdLevel: CrowdLevel;
}

/** A single leg after conditions have been applied. */
interface PreparedLeg {
  readonly segment: Segment;
  /** Duration observations, adjusted for current conditions. */
  readonly samples: readonly number[];
  readonly meanMinutes: number;
  readonly coefficientOfVariation: number;
  /** Times this leg's spread should be widened, for transfers. */
  readonly dispersionMultiplier: number;
  readonly crowdLevel: CrowdLevel;
}

/** Full engine result. */
export interface PredictionResult {
  readonly prediction: Prediction;
  readonly candidates: readonly RouteCandidate[];
  readonly factors: readonly ReliabilityFactor[];
  /** True when no route had enough history and all scores sit near 50. */
  readonly isLowConfidence: boolean;
}

/** Everything needed to produce a prediction. */
export interface PredictOptions {
  /** Wall-clock reference for "now", epoch ms. */
  readonly now: number;
  /** When the user must arrive, epoch ms. */
  readonly targetArrivalAt: number;
  readonly history: HistoryInput;
  readonly conditions: ConditionInput;
  /** Override the simulation count. Tests use a small value. */
  readonly iterations?: number;
  /** Override the random source for deterministic tests. */
  readonly random?: RandomSource;
}

/** An empty history set, used when a template has no trips yet. */
export const EMPTY_HISTORY: HistoryInput = {
  segmentDurations: {},
  routeDurations: {},
  routeOnTime: {},
  routeMissedTransfers: {},
  segmentWorstCrowd: {},
};

/**
 * Produces a recommendation for a template.
 *
 * @param graphData The template plus its stops and segments.
 * @param options Conditions, target time and history.
 */
export function predict(graphData: TemplateGraph, options: PredictOptions): PredictionResult {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const graph = buildGraph(graphData);
  const routes = enumerateRoutes(graph);

  if (routes.length === 0) {
    return fallbackPrediction(graphData.template, options, 'No route is defined yet.');
  }

  const { weather, traffic, crowdLevel } = options.conditions;
  const availableMinutes = Math.max(0, (options.targetArrivalAt - options.now) / 60_000);

  const scored = routes.map((path) =>
    scoreRoute(graphData, graph, path, {
      ...options,
      iterations,
      weather,
      traffic,
      crowdLevel,
    }),
  );

  // Rank by reliability, then by P90. A route that is equally reliable but
  // faster is strictly better, so this tiebreak is free of trade-offs.
  const ranked = [...scored].sort((a, b) => {
    if (Math.abs(b.reliability - a.reliability) > 0.5) {
      return b.reliability - a.reliability;
    }
    return a.p90 - b.p90;
  });

  const best = ranked[0];
  if (best === undefined) {
    return fallbackPrediction(graphData.template, options, 'No usable route.');
  }

  // Round first, then derive the times from the rounded values. Otherwise the
  // leave-by shown to the user would not equal "target minus the P90 shown to
  // the user" — a small but very visible inconsistency in the one number the
  // app exists to get right.
  const p50Min = round(best.p50, 1);
  const p75Min = round(best.p75, 1);
  const p90Min = round(best.p90, 1);
  const p95Min = round(best.p95, 1);
  const meanMin = round(best.mean, 1);
  const stddevMin = round(best.stddev, 1);

  const leaveByMs = options.targetArrivalAt - p90Min * 60_000;
  const etaMs = options.now + p50Min * 60_000;
  const bufferMin = suggestedBufferMinutes({
    p90Minutes: p90Min,
    standardDeviation: stddevMin,
    transferCount: best.transferCount,
    tightTransferCount: best.tightTransferCount,
  });

  const totalObservations = routes.reduce(
    (total, path) => total + (options.history.routeDurations[path.signature]?.length ?? 0),
    0,
  );

  const fastest = Math.min(...scored.map((route) => route.p50));

  const prediction: Prediction = {
    templateId: graphData.template.id,
    generatedAt: options.now,
    targetArrivalAt: options.targetArrivalAt,
    leaveBy: Math.round(leaveByMs),
    eta: Math.round(etaMs),
    fastestDurationMin: round(fastest, 1),
    travelTimeP50Min: p50Min,
    travelTimeP75Min: p75Min,
    travelTimeP90Min: p90Min,
    travelTimeP95Min: p95Min,
    meanDurationMin: meanMin,
    stddevMinutes: stddevMin,
    onTimeProbability: round(best.onTimeProbability, 4),
    reliabilityScore: best.reliability,
    confidence: best.confidence,
    suggestedBufferMin: bufferMin,
    recommendedSignature: best.path.signature,
    recommendedStopIds: [...best.path.stopIds],
    algorithmVersion: ALGORITHM_VERSION,
  };

  const candidates: RouteCandidate[] = ranked.map((route) => ({
    signature: route.path.signature,
    segmentIds: [...route.path.segmentIds],
    stopIds: [...route.path.stopIds],
    label: route.label,
    modeSummary: summarizeModes(route.path),
    travelTimeP50Min: round(route.p50, 1),
    travelTimeP90Min: round(route.p90, 1),
    onTimeProbability: round(route.onTimeProbability, 4),
    reliabilityScore: route.reliability,
    // The engine's own count, from the transfer-risk model, which accounts for
    // headway and crowd — not the plain boardable-mode heuristic in
    // `countTransfers`. They agree on the count itself; the engine's is the one
    // the recommendation was actually scored on.
    transferCount: route.transferCount,
    // Surfaced so the interface can distinguish "we measured this 12 times"
    // from "this is modelled from the durations you entered". Both matter, and
    // conflating them is how a cold-start estimate ends up looking like a
    // hard-won personal statistic.
    observedTrips: route.observedTrips,
    isRecommended: route.path.signature === best.path.signature,
  }));

  void availableMinutes;

  return {
    prediction,
    candidates,
    factors: best.factors,
    isLowConfidence: confidenceFromObservations(totalObservations) < 0.5,
  };
}

/**
 * A fully evaluated candidate route.
 *
 * Note the two distinct sample counts: `samples` is the size of whatever
 * distribution the P50/P90 were read from (which may be a Monte Carlo run),
 * while `observedTrips` is how many *real* logged trips back the route.
 * Confidence is computed from `observedTrips` only — a simulation cannot
 * manufacture confidence in the model.
 */
interface ScoredRoute {
  readonly path: RoutePath;
  readonly label: string;
  /** Count of real historical trips for this exact route signature. */
  readonly observedTrips: number;
  /** Multiplier applied to historical durations for today's conditions. */
  readonly conditionShift: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
  readonly p95: number;
  readonly mean: number;
  readonly stddev: number;
  readonly onTimeProbability: number;
  readonly reliability: number;
  readonly confidence: number;
  readonly factors: readonly ReliabilityFactor[];
  readonly transferCount: number;
  readonly tightTransferCount: number;
}

/**
 * Evaluates one candidate route end to end.
 *
 * Exported for testing: this is where the Monte Carlo and scoring live.
 */
function scoreRoute(
  graphData: TemplateGraph,
  graph: ReturnType<typeof buildGraph>,
  path: RoutePath,
  context: PredictOptions & {
    weather: WeatherCondition;
    traffic: TrafficLevel;
    crowdLevel: CrowdLevel;
  },
): ScoredRoute {
  const segments = path.segmentIds
    .map((id) => graph.segmentsById.get(id))
    .filter((segment): segment is Segment => segment !== undefined);

  // One seeded stream per route, shared by the leg synthesis and the
  // simulation, so the whole evaluation is reproducible from the route id.
  const random =
    context.random ??
    createSeededRandom(`${graphData.template.id}:${path.signature}:${ALGORITHM_VERSION}`);

  const legs = prepareLegs(segments, { ...context, random });

  const transfers = evaluateRouteTransfers(segments, context.crowdLevel, context.traffic);
  const transferSummary = summarizeTransferRisk(transfers);

  // Route-level history, when it exists, is the most direct evidence we have
  // and captures second-order effects the per-leg model cannot. Prefer it
  // over the simulation — but only after shifting it for today's conditions,
  // otherwise deep history would make the prediction ignore the weather.
  const routeHistory = context.history.routeDurations[path.signature] ?? [];
  const conditionShift = conditionShiftFactor(legs, path);
  const adjustedRouteHistory = routeHistory.map((value) => value * conditionShift);
  const totals = simulateTotals(legs, context.iterations ?? DEFAULT_ITERATIONS, random);

  // Apply transfer risk on top of either source.
  const transferLossMin = transferSummary.expectedLossMin;
  const adjustedTotals = totals.map((total) => total + transferLossMin);

  const effectiveTotals =
    adjustedRouteHistory.length >= MIN_TRUSTWORTHY_SAMPLES ? adjustedRouteHistory : adjustedTotals;

  const summary = summarizeDurations(effectiveTotals);
  // Confidence comes from real trips, never from the simulation.
  const observedTrips = routeHistory.length;
  const availableMinutes = Math.max(0, (context.targetArrivalAt - context.now) / 60_000);

  // If the user allows less time than even the P50 needs, nothing is
  // achievable and the honest answer is 0.
  const achievable = availableMinutes > 0;
  const onTimeProbability = achievable
    ? clamp01(fractionAtOrBelow(effectiveTotals, availableMinutes))
    : 0;

  const onTimeCounts = context.history.routeOnTime[path.signature];
  const missedTransfers = context.history.routeMissedTransfers[path.signature] ?? 0;

  // Historical punctuality is the strongest signal when available; otherwise
  // fall back to the modelled probability so the component is never unknown.
  const historicalPunctuality =
    onTimeCounts !== undefined && onTimeCounts.total > 0
      ? onTimeCounts.onTime / onTimeCounts.total
      : null;

  const worstCrowd = legs.reduce<CrowdLevel>(
    (worst, leg) => (leg.crowdLevel > worst ? leg.crowdLevel : worst),
    0,
  );

  // Fold missed-transfer history into the effective catch probability: a
  // route where you have actually missed connections before is less reliable
  // than the geometric model alone suggests.
  const observedMissRate =
    observedTrips > 0 && missedTransfers > 0 ? clamp01(missedTransfers / observedTrips) : 0;
  const effectiveCatchProbability =
    transferSummary.transferCount === 0
      ? 1
      : clamp01(transferSummary.meanCatchProbability * (1 - observedMissRate * 0.5));

  const reliability = computeReliability({
    punctuality: historicalPunctuality ?? onTimeProbability,
    coefficientOfVariation: summary.mean > 0 ? summary.stddev / summary.mean : 0,
    transferCatchProbability: effectiveCatchProbability,
    crowdLevel: worstCrowd,
    trafficLevel: context.traffic,
    weather: context.weather,
    observations: observedTrips,
  });

  return {
    path,
    observedTrips,
    conditionShift,
    label: describeRoute(graph, path, (segment) => segment.serviceLabel),
    p50: summary.p50,
    p75: summary.p75,
    p90: summary.p90,
    p95: summary.p95,
    mean: summary.mean,
    stddev: summary.stddev,
    onTimeProbability,
    reliability: reliability.score,
    confidence: reliability.confidence,
    factors: reliability.factors,
    transferCount: transferSummary.transferCount,
    tightTransferCount: transferSummary.tightCount,
  };
}

/**
 * Builds condition-adjusted duration samples for each leg.
 *
 * Three effects compose here, and the order matters:
 * weather and traffic shift the mean; crowd adds a fixed boarding delay;
 * all three can widen the spread. Widening is done by scaling the leg's
 * coefficient of variation before sampling, so the distribution stays
 * lognormal and right-skewed rather than becoming a flat box.
 */
function prepareLegs(
  segments: readonly Segment[],
  context: PredictOptions & {
    weather: WeatherCondition;
    traffic: TrafficLevel;
    crowdLevel: CrowdLevel;
    random: RandomSource;
  },
): PreparedLeg[] {
  const transfers = evaluateRouteTransfers(segments, context.crowdLevel, context.traffic);
  const tightAfterIndex = new Set<number>();
  transfers.forEach((risk, i) => {
    if (risk.isTight) {
      // Transfers correspond to walk legs at index 1..n-2; the leg that
      // follows the interchange is what actually gets delayed.
      const legIndex = i + 2;
      if (legIndex < segments.length) tightAfterIndex.add(legIndex);
    }
  });

  return segments.map((segment, index) => {
    const observations = context.history.segmentDurations[segment.id] ?? [];
    const observed = summarizeDurations(observations);

    const baseDuration =
      observed.count >= MIN_TRUSTWORTHY_SAMPLES
        ? observed.mean
        : shrinkMean(observed, segment.expectedDurationMin + segment.bufferMinutes);

    const baseCv =
      observed.count >= MIN_TRUSTWORTHY_SAMPLES
        ? observed.coefficientOfVariation
        : assumedCv(observed.count);

    // Weather shifts the mean.
    const weather = weatherPenalty(context.weather, segment.mode, baseDuration);

    // Traffic shifts the mean and widens the spread.
    const traffic = trafficPenalty(
      context.traffic,
      segment.mode,
      weather.adjustedDurationMin,
      baseCv,
    );

    // Crowd adds a fixed boarding delay; the first boarding of a trip is
    // exempt because the walk to the stop already absorbed the time.
    const legCrowd = context.history.segmentWorstCrowd[segment.id] ?? context.crowdLevel;
    const isFirstBoarding = index === 0 || segments[index - 1]?.mode === 'walk';
    const crowd = crowdPenalty(
      legCrowd,
      segment.mode,
      traffic.adjustedDurationMin,
      isFirstBoarding,
    );

    let dispersion = crowd.dispersionMultiplier;
    if (tightAfterIndex.has(index)) {
      dispersion *= 1.15;
    }

    // Reconstruct samples by rescaling the empirical distribution to the new
    // mean and spread. Scaling preserves the observed *shape* (the real
    // pattern of this user's bad days), which a fresh sample would lose.
    const adjustedSamples = rescaleSamples(observations, {
      targetMean: crowd.adjustedDurationMin,
      targetCv: clamp(traffic.coefficientOfVariation * dispersion, 0.02, 1.2),
      fallbackExpected: segment.expectedDurationMin + segment.bufferMinutes,
      random: context.random,
    });

    return {
      segment,
      samples: adjustedSamples,
      meanMinutes: crowd.adjustedDurationMin,
      coefficientOfVariation: clamp(traffic.coefficientOfVariation * dispersion, 0.02, 1.2),
      dispersionMultiplier: dispersion,
      crowdLevel: legCrowd,
    };
  });
}

/**
 * How much today's conditions stretch a route relative to its baseline.
 *
 * Route-level history is a record of how the route behaved on *previous*
 * days. To use it for today it has to be rescaled by the same condition
 * penalties the per-leg model applies, otherwise a route with 50 logged trips
 * would report identical numbers in clear weather and a downpour — which would
 * defeat the entire purpose of the app.
 *
 * The rescale is a single scalar rather than a per-leg transform because the
 * history is a single total per trip. Scaling the total preserves the observed
 * *shape* of this user's bad days, which is the valuable part of the record;
 * the mean and P90 both shift, and the tail does not get flattened.
 */
function conditionShiftFactor(legs: readonly PreparedLeg[], path: RoutePath): number {
  const baseTotal = path.expectedDurationMin;
  if (baseTotal <= 0) return 1;

  // `meanMinutes` already has the condition penalties applied; the baseline is
  // the template's expected duration plus the configured buffers.
  const adjustedTotal = legs.reduce((total, leg) => total + leg.meanMinutes, 0);
  if (adjustedTotal <= 0) return 1;

  // Bounded so a pathological template cannot produce a 0x or 4x duration.
  return Math.min(4, Math.max(0.4, adjustedTotal / baseTotal));
}

/**
 * Rescales an empirical sample to a target mean and coefficient of variation.
 *
 * With enough history this preserves the user's real distribution shape. With
 * too little history it falls back to a synthetic lognormal at the assumed
 * spread, which is the honest thing to do when the empirical P90 is just
 * "the worst day you happened to have".
 */
function rescaleSamples(
  observations: readonly number[],
  target: {
    readonly targetMean: number;
    readonly targetCv: number;
    readonly fallbackExpected: number;
    readonly random: RandomSource;
  },
): number[] {
  const clean = observations.filter((value) => Number.isFinite(value) && value > 0);

  if (clean.length >= MIN_TRUSTWORTHY_SAMPLES) {
    const current = summarizeDurations(clean);
    const cvScale =
      current.coefficientOfVariation > 1e-6 ? target.targetCv / current.coefficientOfVariation : 1;
    const currentStddev = current.stddev;

    return clean.map((value) => {
      const centered = currentStddev > 1e-6 ? (value - current.mean) * cvScale : 0;
      return Math.max(0.5, target.targetMean + centered);
    });
  }

  const blendedMean = shrinkMean(summarizeDurations(clean), target.fallbackExpected);
  const synthesized = buildDurationSample({
    observations: clean,
    expectedDurationMin: blendedMean,
    minTrustworthySamples: MIN_TRUSTWORTHY_SAMPLES,
    random: target.random,
  });

  return scaleToMean(synthesized, target.targetMean);
}

/** Scales a set of positive values so their mean matches `targetMean`. */
function scaleToMean(values: readonly number[], targetMean: number): number[] {
  const current = summarizeDurations(values).mean;
  if (current <= 0) return values.map(() => targetMean);
  const factor = targetMean / current;
  return values.map((value) => value * factor);
}

/** Blends observed mean with the template's expectation. */
function shrinkMean(observed: { count: number; mean: number }, priorMean: number): number {
  if (observed.count === 0) return priorMean;
  return (
    (observed.count * observed.mean + PRIOR_WEIGHT * priorMean) / (observed.count + PRIOR_WEIGHT)
  );
}

/** Coefficient of variation to assume for a leg with few observations. */
function assumedCv(observations: number): number {
  if (observations >= 20) return 0.12;
  if (observations >= 10) return 0.16;
  if (observations >= 5) return 0.2;
  if (observations >= 2) return 0.25;
  return 0.3;
}

/**
 * Monte Carlo over the joint distribution of leg durations.
 *
 * Each iteration samples every leg independently *within* the iteration and
 * sums them. Sampling is seeded, so the result is stable across renders.
 */
function simulateTotals(
  legs: readonly PreparedLeg[],
  iterations: number,
  random: RandomSource,
): number[] {
  if (legs.length === 0) return [];
  if (iterations <= 0) return [];

  const totals = new Array<number>(iterations).fill(0);

  for (let i = 0; i < iterations; i += 1) {
    let total = 0;
    for (const leg of legs) {
      const fromSample =
        leg.samples.length > 0
          ? leg.samples[Math.floor(random() * leg.samples.length)]
          : leg.meanMinutes;
      const noise = sampleLogNormal(1, leg.coefficientOfVariation * 0.35, random);
      total += fromSample * noise;
    }
    totals[i] = total;
  }

  return totals;
}

/** Builds a short human label for a route's mode mix. */
function summarizeModes(path: RoutePath): string {
  const names: Record<TransportMode, string> = {
    walk: 'Walk',
    bus: 'Bus',
    metro: 'Metro',
    train: 'Train',
    auto: 'Auto',
    bike: 'Bike',
    cab: 'Cab',
  };
  return path.modes.map((mode) => names[mode]).join(' + ');
}

/** Last-resort result when a template has no usable routes. */
function fallbackPrediction(
  template: CommuteTemplate,
  options: PredictOptions,
  reason: string,
): PredictionResult {
  const now = options.now;
  return {
    prediction: {
      templateId: template.id,
      generatedAt: now,
      targetArrivalAt: options.targetArrivalAt,
      leaveBy: now,
      eta: now,
      fastestDurationMin: 0,
      travelTimeP50Min: 0,
      travelTimeP75Min: 0,
      travelTimeP90Min: 0,
      travelTimeP95Min: 0,
      meanDurationMin: 0,
      stddevMinutes: 0,
      onTimeProbability: 0,
      reliabilityScore: 0,
      confidence: 0,
      suggestedBufferMin: 0,
      recommendedSignature: '',
      recommendedStopIds: [],
      algorithmVersion: ALGORITHM_VERSION,
    },
    candidates: [],
    factors: [
      {
        key: 'punctuality',
        impact: 0,
        detail: reason,
      },
    ],
    isLowConfidence: true,
  };
}

/** Standard deviation helper re-exported for consumers of the result. */
export { stddev };
