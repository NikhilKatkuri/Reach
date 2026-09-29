/**
 * Traffic penalty model.
 *
 * The central claim of Reach is "reliable beats fast", and traffic is where
 * that claim is won or lost. A road leg's duration is not just longer in
 * traffic — its *variance* explodes. A metro line runs on a fixed headway and
 * its arrival time barely moves, so its P90 is close to its P50. A bus in
 * peak-hour Hyderabad traffic can swing by 20 minutes.
 *
 * So this module returns two things, not one:
 *
 *  - `fraction` — the mean slowdown, which everyone models.
 *  - `dispersionMultiplier` — how much the leg's spread should grow. This is
 *    what the engine uses to widen a road leg's P90, and it is the single
 *    biggest reason rail wins on reliability even when it is slower.
 */
import { type TransportMode, type TrafficLevel } from '@/src/types/schemas';
import { clamp } from '@/src/utils/math';

/** Mean slowdown and spread inflation, by mode and traffic level. */
export interface TrafficPenaltyTable {
  /** Fractional mean slowdown, keyed by level then mode. */
  readonly fraction: Readonly<Record<TrafficLevel, Readonly<Record<TransportMode, number>>>>;
  /**
   * Multiplier on the leg's coefficient of variation. `1` leaves the spread
   * alone; `2.4` quadruples the variance.
   */
  readonly dispersion: Readonly<Record<TrafficLevel, Readonly<Record<TransportMode, number>>>>;
}

/** Default table. Road modes are hit hard; metro barely notices. */
export const DEFAULT_TRAFFIC_PENALTY: TrafficPenaltyTable = {
  fraction: {
    low: { walk: 0, bus: 0.04, metro: 0, train: 0, auto: 0.05, bike: 0, cab: 0.03 },
    medium: { walk: 0, bus: 0.12, metro: 0.01, train: 0, auto: 0.14, bike: 0, cab: 0.08 },
    high: { walk: 0, bus: 0.28, metro: 0.02, train: 0.01, auto: 0.3, bike: 0, cab: 0.18 },
    very_high: { walk: 0, bus: 0.5, metro: 0.04, train: 0.02, auto: 0.52, bike: 0, cab: 0.3 },
  },
  dispersion: {
    low: { walk: 1, bus: 1.05, metro: 1, train: 1, auto: 1.05, bike: 1, cab: 1.05 },
    medium: { walk: 1, bus: 1.35, metro: 1.02, train: 1, auto: 1.35, bike: 1, cab: 1.2 },
    high: { walk: 1, bus: 1.9, metro: 1.05, train: 1.02, auto: 1.9, bike: 1, cab: 1.5 },
    very_high: { walk: 1, bus: 2.6, metro: 1.1, train: 1.05, auto: 2.6, bike: 1, cab: 1.9 },
  },
};

/** The result of applying traffic to one leg. */
export interface TrafficPenalty {
  readonly level: TrafficLevel;
  readonly fraction: number;
  readonly dispersionMultiplier: number;
  readonly addedMinutes: number;
  readonly adjustedDurationMin: number;
  /** Adjusted coefficient of variation for the leg. */
  readonly coefficientOfVariation: number;
}

/**
 * Applies traffic to a single leg.
 *
 * @param level Observed traffic level.
 * @param mode The leg's transport mode.
 * @param expectedDurationMin Duration before penalties.
 * @param coefficientOfVariation The leg's base CV from history.
 * @param table Overridable penalty table.
 */
export function trafficPenalty(
  level: TrafficLevel,
  mode: TransportMode,
  expectedDurationMin: number,
  coefficientOfVariation: number,
  table: TrafficPenaltyTable = DEFAULT_TRAFFIC_PENALTY,
): TrafficPenalty {
  const fraction = clamp(table.fraction[level][mode], 0, 3);
  const dispersionMultiplier = clamp(table.dispersion[level][mode], 0.5, 4);
  const addedMinutes = expectedDurationMin * fraction;

  return {
    level,
    fraction,
    dispersionMultiplier,
    addedMinutes,
    adjustedDurationMin: expectedDurationMin + addedMinutes,
    coefficientOfVariation: Math.min(1.5, coefficientOfVariation * dispersionMultiplier),
  };
}

/** Aggregate traffic impact across a route. */
export function routeTrafficPenalty(
  level: TrafficLevel,
  legs: readonly {
    readonly mode: TransportMode;
    readonly durationMin: number;
    readonly coefficientOfVariation: number;
  }[],
  table: TrafficPenaltyTable = DEFAULT_TRAFFIC_PENALTY,
): {
  readonly totalAddedMinutes: number;
  readonly adjustedTotalMin: number;
  /** Spread inflation averaged over legs, weighted by duration. */
  readonly weightedDispersion: number;
  readonly byMode: Readonly<Partial<Record<TransportMode, number>>>;
} {
  const byMode: Partial<Record<TransportMode, number>> = {};
  let baseTotal = 0;
  let totalAdded = 0;
  let weightedDispersion = 0;

  for (const leg of legs) {
    const penalty = trafficPenalty(
      level,
      leg.mode,
      leg.durationMin,
      leg.coefficientOfVariation,
      table,
    );
    baseTotal += leg.durationMin;
    totalAdded += penalty.addedMinutes;
    weightedDispersion += penalty.dispersionMultiplier * leg.durationMin;
    byMode[leg.mode] = (byMode[leg.mode] ?? 0) + penalty.addedMinutes;
  }

  return {
    totalAddedMinutes: totalAdded,
    adjustedTotalMin: baseTotal + totalAdded,
    weightedDispersion: baseTotal > 0 ? weightedDispersion / baseTotal : 1,
    byMode,
  };
}

/** Human label for a traffic level. */
export function trafficLabel(level: TrafficLevel): string {
  switch (level) {
    case 'low':
      return 'Light traffic';
    case 'medium':
      return 'Moderate';
    case 'high':
      return 'Heavy';
    case 'very_high':
      return 'Very heavy';
  }
}

/** Short label for compact chips. */
export function trafficShortLabel(level: TrafficLevel): string {
  switch (level) {
    case 'low':
      return 'Low';
    case 'medium':
      return 'Medium';
    case 'high':
      return 'High';
    case 'very_high':
      return 'Very high';
  }
}

/** Traffic levels ordered from best to worst. */
export const TRAFFIC_SEVERITY: readonly TrafficLevel[] = ['low', 'medium', 'high', 'very_high'];

/** Numeric severity, 0 for low through 3 for very high. */
export function trafficSeverity(level: TrafficLevel): number {
  return TRAFFIC_SEVERITY.indexOf(level);
}
