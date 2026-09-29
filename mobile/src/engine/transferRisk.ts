/**
 * Transfer reliability model.
 *
 * Missing a connection is the most expensive failure mode in a multi-modal
 * commute: it typically costs 15 to 30 minutes, which is an order of
 * magnitude worse than being slightly late on a single bus. Reach therefore
 * treats transfer risk as a first-class input rather than folding it into an
 * average duration.
 *
 * The model is intentionally simple and auditable. For a connection with head
 * `h` minutes and transfer window `w` minutes, the probability of catching the
 * next vehicle after a random arrival is
 *
 *     P(catch) = 1  if  w >= h
 *              = w / h otherwise
 *
 * Walking the connection takes `t` minutes and is itself late-prone, so we
 * inflate `w` by the crowd penalty for the interchange and shrink it by the
 * observed lateness of the incoming leg.
 */
import { type CrowdLevel, type Segment, type TrafficLevel } from '@/src/types/schemas';
import { TRANSFER_DELAY_MINUTES, transferCrowdDispersion } from './crowdPenalty';
import { clamp, clamp01 } from '@/src/utils/math';

/** Default assumed headways by mode, in minutes. */
export const DEFAULT_HEADWAY_MINUTES = {
  bus: 15,
  metro: 6,
  train: 20,
  auto: 6,
  cab: 6,
  walk: 0,
  bike: 0,
} as const;

/** A single evaluated transfer. */
export interface TransferRisk {
  /** The connection being evaluated, `"inMode → outMode"`. */
  readonly label: string;
  /** Assumed headway of the connecting service, in minutes. */
  readonly headwayMin: number;
  /** Time available between alighting and the next departure. */
  readonly effectiveWindowMin: number;
  /** Probability of catching the next service, 0..1. */
  readonly catchProbability: number;
  /** Expected minutes lost if the connection is missed. */
  readonly expectedMissPenaltyMin: number;
  /** Probability-weighted expected loss, in minutes. */
  readonly expectedLossMin: number;
  /** Dispersion multiplier for the following leg. */
  readonly dispersionMultiplier: number;
  /** True when the connection is tight enough to flag in the UI. */
  readonly isTight: boolean;
}

/** Tunable transfer model parameters. */
export interface TransferModelOptions {
  /** Missed-connection penalty in minutes, by incoming mode. */
  readonly missPenaltyMin?: Readonly<Record<string, number>>;
  /** Effective window below which a connection is considered tight. */
  readonly tightWindowMin?: number;
}

const DEFAULT_MISS_PENALTY: Readonly<Record<string, number>> = {
  bus: 20,
  metro: 15,
  train: 30,
  auto: 12,
  cab: 12,
};

/**
 * Evaluates one transfer between an incoming and outgoing segment.
 *
 * @param incoming Leg the user has just finished.
 * @param outgoing Leg the user is trying to board.
 * @param crowdLevel Observed crowd at the interchange.
 * @param trafficLevel Current traffic, which lengthens the walk to platforms.
 * @param options Model overrides.
 */
export function evaluateTransfer(
  incoming: Pick<Segment, 'mode' | 'transferWindowMin' | 'bufferMinutes'>,
  outgoing: Pick<Segment, 'mode' | 'transferWindowMin'>,
  crowdLevel: CrowdLevel = 0,
  trafficLevel: TrafficLevel = 'low',
  options: TransferModelOptions = {},
): TransferRisk {
  const missPenalties = options.missPenaltyMin ?? DEFAULT_MISS_PENALTY;
  const tightWindowMin = options.tightWindowMin ?? 4;

  // Time available: the declared transfer window, or a sane default derived
  // from the headway when the user did not specify one.
  const headwayMin =
    outgoing.transferWindowMin ??
    DEFAULT_HEADWAY_MINUTES[outgoing.mode as keyof typeof DEFAULT_HEADWAY_MINUTES] ??
    10;

  const declaredWindow = incoming.transferWindowMin ?? Math.max(2, Math.min(headwayMin, 8));

  // Walking a crowded interchange takes longer.
  const walkPenalty = TRANSFER_DELAY_MINUTES[crowdLevel];
  // Traffic slows the walk to the platform, mildly.
  const trafficPenaltyMin =
    trafficLevel === 'very_high'
      ? 1.5
      : trafficLevel === 'high'
        ? 0.8
        : trafficLevel === 'medium'
          ? 0.3
          : 0;

  const effectiveWindowMin = Math.max(
    0,
    declaredWindow + incoming.bufferMinutes - walkPenalty - trafficPenaltyMin,
  );

  // If the window covers a whole headway, the next vehicle is always
  // available and the only cost is the walk itself.
  const catchProbability =
    effectiveWindowMin >= headwayMin ? 1 : clamp01(effectiveWindowMin / Math.max(1, headwayMin));

  const missPenaltyMin = missPenalties[incoming.mode] ?? 15;
  const missProbability = 1 - catchProbability;
  const expectedMissPenaltyMin = missProbability * missPenaltyMin;
  const dispersionMultiplier = transferCrowdDispersion(crowdLevel);

  return {
    label: `${incoming.mode} → ${outgoing.mode}`,
    headwayMin,
    effectiveWindowMin: round1(effectiveWindowMin),
    catchProbability,
    expectedMissPenaltyMin: round1(expectedMissPenaltyMin),
    expectedLossMin: round1(missProbability * (missPenaltyMin + walkPenalty)),
    dispersionMultiplier,
    // Tight means either the connection is unlikely on a random arrival, or it
    // is comfortable in probability but leaves so few minutes on the clock
    // that a single delay breaks it. Both are worth warning the user about.
    isTight: catchProbability < 0.8 || effectiveWindowMin < tightWindowMin,
  };
}

function round1(value: number): number {
  return Math.round(clamp(value, 0, 10_000) * 10) / 10;
}

/**
 * Evaluates every transfer along a route.
 *
 * A transfer exists wherever a boardable leg is followed by a walk and then
 * another boardable leg — that middle walk is the interchange.
 */
export function evaluateRouteTransfers(
  segments: readonly Segment[],
  crowdLevel: CrowdLevel = 0,
  trafficLevel: TrafficLevel = 'low',
  options: TransferModelOptions = {},
): TransferRisk[] {
  const boardable = (mode: string) =>
    mode === 'bus' || mode === 'metro' || mode === 'train' || mode === 'auto' || mode === 'cab';

  const risks: TransferRisk[] = [];

  for (let i = 1; i < segments.length - 1; i += 1) {
    const previous = segments[i - 1];
    const current = segments[i];
    const next = segments[i + 1];
    if (previous === undefined || current === undefined || next === undefined) continue;
    if (!boardable(previous.mode)) continue;
    if (current.mode !== 'walk') continue;
    if (!boardable(next.mode)) continue;

    risks.push(evaluateTransfer(previous, next, crowdLevel, trafficLevel, options));
  }

  return risks;
}

/**
 * The worst transfer on a route, for the Insights screen's
 * "worst transfer" card.
 */
export function worstTransfer(risks: readonly TransferRisk[]): TransferRisk | null {
  if (risks.length === 0) return null;
  return risks.reduce((worst, risk) =>
    risk.catchProbability < worst.catchProbability ? risk : worst,
  );
}

/** Aggregate transfer risk for a route. */
export function summarizeTransferRisk(risks: readonly TransferRisk[]): {
  readonly transferCount: number;
  readonly tightCount: number;
  readonly meanCatchProbability: number;
  readonly expectedLossMin: number;
} {
  if (risks.length === 0) {
    return { transferCount: 0, tightCount: 0, meanCatchProbability: 1, expectedLossMin: 0 };
  }

  let tight = 0;
  let catchSum = 0;
  let lossSum = 0;

  for (const risk of risks) {
    if (risk.isTight) tight += 1;
    catchSum += risk.catchProbability;
    lossSum += risk.expectedLossMin;
  }

  return {
    transferCount: risks.length,
    tightCount: tight,
    meanCatchProbability: catchSum / risks.length,
    expectedLossMin: lossSum,
  };
}
