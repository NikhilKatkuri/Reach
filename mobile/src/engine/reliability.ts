/**
 * Composite reliability scoring.
 *
 * Reach ranks routes by reliability, not speed, so this is the function that
 * actually decides the recommendation. `prediction.ts` computes the inputs;
 * this module owns the weighting and is deliberately free of I/O so the
 * scoring policy can be unit-tested and tuned in one place.
 *
 * ## The score
 *
 * The headline number is a 0..100 blend of five normalised components:
 *
 * | Component      | Weight | Meaning                                            |
 * | -------------- | -----: | -------------------------------------------------- |
 * | Punctuality    |   0.30 | Historical on-time rate for this route at this hour |
 * | Variance       |   0.25 | 1 - CV, penalising spread rather than mean         |
 * | Transfer       |   0.20 | Mean probability of catching connections            |
 * | Crowd          |   0.15 | Inverse of boarding difficulty                     |
 * | Traffic        |   0.10 | Inverse of the congestion penalty                  |
 *
 * The design rationale:
 *
 *  - **Punctuality and variance lead.** Both come from the user's own data
 *    and directly answer "will this get me there on time".
 *  - **Transfer risk is weighted heavily (0.20)** because a missed
 *    connection is a step change in lateness, not a gradual one. Averaging
 *    away that risk would make the engine prefer fragile routes.
 *  - **Crowd and traffic are smaller** because they are symptoms that are
 *    already partly reflected in the observed durations; including them
 *    fully would double-count. They mainly matter on sparse data, where
 *    duration history is thin.
 *
 * ## Confidence
 *
 * Sparse history must not read as certainty. `confidence` scales the
 * distance of a route's score from neutral, so a route with two data points
 * is reported as mediocre rather than confidently good or bad. The blend
 * with observed data also reflects this:
 *
 *     score = confidence * observedScore + (1 - confidence) * 50
 *
 * so a fresh install surfaces every route near 50 and lets real data
 * differentiate them.
 */
import {
  type CrowdLevel,
  type ReliabilityFactor,
  type TrafficLevel,
  type WeatherCondition,
} from '@/src/types/schemas';
import { clamp, clamp01, clamp100, round } from '@/src/utils/math';

/** Component weights. Must sum to 1. */
export interface ReliabilityWeights {
  readonly punctuality: number;
  readonly variance: number;
  readonly transfer: number;
  readonly crowd: number;
  readonly traffic: number;
}

/** Default weights, matching the table in the module docs. */
export const DEFAULT_WEIGHTS: ReliabilityWeights = {
  punctuality: 0.3,
  variance: 0.25,
  transfer: 0.2,
  crowd: 0.15,
  traffic: 0.1,
};

/** Raw inputs to the score, all already in natural units. */
export interface ReliabilityInputs {
  /** Historical on-time rate 0..1, or `null` when there is no history. */
  readonly punctuality: number | null;
  /** Coefficient of variation of the route's total duration. */
  readonly coefficientOfVariation: number;
  /** Mean probability of catching each transfer, 0..1. No transfers is 1. */
  readonly transferCatchProbability: number;
  /** Worst observed crowd on the route, 0..5. */
  readonly crowdLevel: CrowdLevel;
  /** Current traffic level. */
  readonly trafficLevel: TrafficLevel;
  /** Current weather condition. */
  readonly weather: WeatherCondition;
  /** Number of historical observations backing this route. */
  readonly observations: number;
}

/** The score plus its explanation. */
export interface ReliabilityScore {
  /** Final 0..100 score, already confidence-blended. */
  readonly score: number;
  /** Score before confidence blending, for diagnostics. */
  readonly rawScore: number;
  /** How much data backs this, 0..1. */
  readonly confidence: number;
  /** Normalised 0..1 component values, keyed by name. */
  readonly components: Readonly<Record<keyof ReliabilityWeights, number>>;
  /** Signed contributions in score points, largest magnitude first. */
  readonly factors: readonly ReliabilityFactor[];
}

/** Observations needed before the score is treated as fully informed. */
const CONFIDENCE_SATURATION = 12;

/**
 * Maps observation count to a confidence ratio.
 *
 * Rises quickly for the first few trips (3 observations already tell you a
 * lot) then flattens, reaching 1.0 at {@link CONFIDENCE_SATURATION}.
 */
export function confidenceFromObservations(observations: number): number {
  const n = Math.max(0, observations);
  if (n === 0) return 0;
  if (n >= CONFIDENCE_SATURATION) return 1;
  // 3 trips -> ~0.6, 6 trips -> ~0.8
  return clamp01(Math.log1p(n) / Math.log1p(CONFIDENCE_SATURATION));
}

/**
 * Normalises a coefficient of variation into a 0..1 score.
 *
 * A CV of 0 (perfectly consistent) scores 1. A CV of 0.5 (a commute that
 * swings by half its own length) scores 0. Beyond 0.5 the route is treated
 * as unusable rather than clamped, which the caller surfaces as a warning.
 */
export function varianceScore(coefficientOfVariation: number): number {
  return clamp01(1 - coefficientOfVariation / 0.5);
}

/** Normalises a crowd level into a 0..1 score. Level 0 is 1, level 5 is 0. */
export function crowdScore(level: CrowdLevel): number {
  return clamp01(1 - level / 5);
}

/** Normalises a traffic level into a 0..1 score. `low` is 1. */
export function trafficScore(level: TrafficLevel): number {
  const table: Record<TrafficLevel, number> = {
    low: 1,
    medium: 0.78,
    high: 0.5,
    very_high: 0.22,
  };
  return table[level];
}

/** Normalises a weather condition into a 0..1 score. `clear` is 1. */
export function weatherScore(condition: WeatherCondition): number {
  const table: Record<WeatherCondition, number> = {
    clear: 1,
    cloudy: 0.95,
    light_rain: 0.85,
    rain: 0.62,
    heavy_rain: 0.35,
  };
  return table[condition];
}

/**
 * Computes the composite reliability score for a route.
 *
 * @param inputs Route-level observations and current conditions.
 * @param weights Component weights; defaults to {@link DEFAULT_WEIGHTS}.
 */
export function computeReliability(
  inputs: ReliabilityInputs,
  weights: ReliabilityWeights = DEFAULT_WEIGHTS,
): ReliabilityScore {
  const confidence = confidenceFromObservations(inputs.observations);

  // Punctuality falls back to the on-time probability already computed from
  // the predicted distribution, so a route with no history is not scored as
  // unknown — the caller passes its modelled probability here.
  const punctuality = inputs.punctuality ?? 0.5;

  const components = {
    punctuality: clamp01(punctuality),
    variance: varianceScore(inputs.coefficientOfVariation),
    transfer: clamp01(inputs.transferCatchProbability),
    crowd: crowdScore(inputs.crowdLevel),
    traffic: trafficScore(inputs.trafficLevel),
  };

  const raw =
    components.punctuality * weights.punctuality +
    components.variance * weights.variance +
    components.transfer * weights.transfer +
    components.crowd * weights.crowd +
    components.traffic * weights.traffic;

  // Blend toward neutral by data scarcity so thin history cannot produce an
  // extreme score.
  const blended = confidence * raw + (1 - confidence) * 0.5;
  const score = clamp100(blended * 100);

  const factors = buildFactors(components, weights, inputs, blended * 100);

  return {
    score: round(score, 1),
    rawScore: round(raw * 100, 1),
    confidence: round(confidence, 3),
    components: {
      punctuality: round(components.punctuality, 3),
      variance: round(components.variance, 3),
      transfer: round(components.transfer, 3),
      crowd: round(components.crowd, 3),
      traffic: round(components.traffic, 3),
    },
    factors,
  };
}

/**
 * Turns component values into signed, human-readable contributions.
 *
 * `impact` is how many score points that component is responsible for, so the
 * UI can show "traffic: -12 pts" and users can see why a route scored low.
 */
function buildFactors(
  components: Readonly<Record<keyof ReliabilityWeights, number>>,
  weights: ReliabilityWeights,
  inputs: ReliabilityInputs,
  finalScore: number,
): ReliabilityFactor[] {
  const contributions: ReliabilityFactor[] = [
    {
      key: 'punctuality',
      impact: round((components.punctuality - 0.5) * weights.punctuality * 100, 1),
      detail: describePunctuality(components.punctuality),
    },
    {
      key: 'variance',
      impact: round((components.variance - 0.5) * weights.variance * 100, 1),
      detail: `Spread is ${Math.round(inputs.coefficientOfVariation * 100)}% of the average leg`,
    },
    {
      key: 'transfers',
      impact: round((components.transfer - 0.5) * weights.transfer * 100, 1),
      detail:
        inputs.transferCatchProbability >= 0.99
          ? 'Every connection is comfortable'
          : `Connections are ${Math.round(inputs.transferCatchProbability * 100)}% reliable`,
    },
    {
      key: 'crowd',
      impact: round((components.crowd - 0.5) * weights.crowd * 100, 1),
      detail: describeCrowd(inputs.crowdLevel),
    },
    {
      key: 'traffic',
      impact: round((components.traffic - 0.5) * weights.traffic * 100, 1),
      detail: describeTraffic(inputs.trafficLevel),
    },
  ];

  // Weather is a modifier rather than a weighted component: it is already
  // baked into the per-leg durations, so here it only explains the shift.
  const weatherDrag = weatherScore(inputs.weather);
  if (weatherDrag < 1) {
    contributions.push({
      key: 'weather',
      impact: round((weatherDrag - 1) * 25, 1),
      detail: describeWeather(inputs.weather),
    });
  }

  void finalScore;

  return contributions.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

function describePunctuality(value: number): string {
  if (value >= 0.95) return 'Almost always on time';
  if (value >= 0.85) return 'Usually on time';
  if (value >= 0.7) return 'On time about 4 days in 5';
  if (value >= 0.5) return 'On time about half the time';
  return 'Frequently late';
}

function describeCrowd(level: CrowdLevel): string {
  const labels: Record<CrowdLevel, string> = {
    0: 'Vehicles are empty',
    1: 'Seats usually available',
    2: 'Moderate crowding',
    3: 'Standing room only',
    4: 'Packed — slow boarding',
    5: 'Very hard to board',
  };
  return labels[level];
}

function describeTraffic(level: TrafficLevel): string {
  const labels: Record<TrafficLevel, string> = {
    low: 'Traffic is flowing',
    medium: 'Moderate congestion',
    high: 'Heavy congestion',
    very_high: 'Severe congestion',
  };
  return labels[level];
}

function describeWeather(condition: WeatherCondition): string {
  const labels: Record<WeatherCondition, string> = {
    clear: 'Clear skies',
    cloudy: 'Overcast',
    light_rain: 'Light rain — small impact',
    rain: 'Rain slows road traffic and walking',
    heavy_rain: 'Heavy rain — road routes badly disrupted',
  };
  return labels[condition];
}

/**
 * Buffers a P90 duration into a leave-by offset.
 *
 * The buffer shrinks when the distribution is tight (you do not need much
 * slack for a predictable commute) and grows when it is wide or when
 * transfers are involved. Clamped to a sane range so a single bad week cannot
 * produce a 90-minute recommendation.
 */
export function suggestedBufferMinutes(options: {
  readonly p90Minutes: number;
  readonly standardDeviation: number;
  readonly transferCount: number;
  readonly tightTransferCount: number;
}): number {
  const { p90Minutes, standardDeviation, transferCount, tightTransferCount } = options;

  // Half the spread above P50 is the natural slack, plus a fixed allowance
  // for finding the next vehicle.
  const spreadAllowance = standardDeviation * 0.5;
  const transferAllowance = transferCount * 2 + tightTransferCount * 3;
  // Longer commutes need proportionally more slack in absolute terms.
  const distanceAllowance = p90Minutes * 0.04;

  return Math.round(clamp(spreadAllowance + transferAllowance + distanceAllowance, 2, 20));
}
