/**
 * Weather penalty model.
 *
 * Rain hurts commutes in two very different ways:
 *
 *  1. **Walking gets physically slower.** Wet footpaths, puddles and umbrellas
 *     add time roughly proportional to distance, and the effect compounds
 *     because you also arrive wet and slower on the way back.
 *  2. **Road traffic gets worse.** Water on the carriageway reduces speed
 *     and bunches vehicles, which lengthens bus and auto legs.
 *
 * Metro and train are unaffected — that asymmetry is exactly why the engine
 * prefers rail when it rains, and it is the main reason Reach exists.
 *
 * All values below are *configurable multipliers of expected duration* and
 * are expressed as fractional slowdowns, so a penalty of `0.25` on a
 * 20-minute bus adds 5 minutes.
 */
import { type TransportMode, type WeatherCondition } from '@/src/types/schemas';
import { clamp } from '@/src/utils/math';

/** Fractional slowdown applied to a leg, by mode and condition. */
export type WeatherPenaltyTable = Readonly<
  Record<WeatherCondition, Readonly<Record<TransportMode, number>>>
>;

/**
 * Default penalties. Tuned so that:
 *
 *  - `light_rain` is a nuisance, not a planning problem.
 *  - `rain` adds ~25% to road legs and ~30% to walking, which matches how a
 *    Hyderabad monsoon commute actually feels.
 *  - `heavy_rain` roughly doubles road legs, which is when people switch to
 *    metro and accept a longer walk.
 */
export const DEFAULT_WEATHER_PENALTY: WeatherPenaltyTable = {
  // Clear weather is the baseline: no mode is slowed. Keeping every value at
  // zero is what makes the table monotonic in severity, which the engine
  // relies on when it escalates a condition.
  clear: {
    walk: 0,
    bus: 0,
    metro: 0,
    train: 0,
    auto: 0,
    bike: 0,
    cab: 0,
  },
  cloudy: {
    walk: 0.01,
    bus: 0.01,
    metro: 0,
    train: 0,
    auto: 0.01,
    bike: 0.01,
    cab: 0.01,
  },
  light_rain: {
    walk: 0.1,
    bus: 0.07,
    metro: 0,
    train: 0,
    auto: 0.1,
    bike: 0.18,
    cab: 0.08,
  },
  rain: {
    walk: 0.3,
    bus: 0.25,
    metro: 0.02,
    train: 0.01,
    auto: 0.28,
    bike: 0.45,
    cab: 0.22,
  },
  heavy_rain: {
    walk: 0.55,
    bus: 0.6,
    metro: 0.05,
    train: 0.03,
    auto: 0.65,
    bike: 0.9,
    cab: 0.5,
  },
};

/** Penalty lookup for one leg. */
export interface WeatherPenalty {
  /** Fraction of the leg's expected duration added by the conditions. */
  readonly fraction: number;
  /** Expected duration after the penalty, in minutes. */
  readonly adjustedDurationMin: number;
  /** Minutes added, for display. */
  readonly addedMinutes: number;
}

/**
 * Applies the weather penalty for a leg.
 *
 * @param condition Observed or forecast weather.
 * @param mode The leg's transport mode.
 * @param expectedDurationMin The leg's expected duration before penalties.
 * @param table Overridable penalty table; defaults to {@link DEFAULT_WEATHER_PENALTY}.
 */
export function weatherPenalty(
  condition: WeatherCondition,
  mode: TransportMode,
  expectedDurationMin: number,
  table: WeatherPenaltyTable = DEFAULT_WEATHER_PENALTY,
): WeatherPenalty {
  const fraction = clamp(table[condition][mode], 0, 3);
  const addedMinutes = expectedDurationMin * fraction;

  return {
    fraction,
    addedMinutes,
    adjustedDurationMin: expectedDurationMin + addedMinutes,
  };
}

/**
 * Applies the penalty across a whole route.
 *
 * @returns The adjusted total and the per-mode breakdown for the "why" sheet.
 */
export function routeWeatherPenalty(
  condition: WeatherCondition,
  legs: readonly { readonly mode: TransportMode; readonly durationMin: number }[],
  table: WeatherPenaltyTable = DEFAULT_WEATHER_PENALTY,
): {
  readonly totalAddedMinutes: number;
  readonly adjustedTotalMin: number;
  readonly byMode: Readonly<Partial<Record<TransportMode, number>>>;
} {
  const byMode: Partial<Record<TransportMode, number>> = {};
  let baseTotalMinutes = 0;
  let totalAddedMinutes = 0;

  for (const leg of legs) {
    const penalty = weatherPenalty(condition, leg.mode, leg.durationMin, table);
    baseTotalMinutes += leg.durationMin;
    totalAddedMinutes += penalty.addedMinutes;
    byMode[leg.mode] = (byMode[leg.mode] ?? 0) + penalty.addedMinutes;
  }

  return {
    totalAddedMinutes,
    adjustedTotalMin: baseTotalMinutes + totalAddedMinutes,
    byMode,
  };
}

/** Human label for a condition, used in chips and the explain sheet. */
export function weatherLabel(condition: WeatherCondition): string {
  switch (condition) {
    case 'clear':
      return 'Clear';
    case 'cloudy':
      return 'Cloudy';
    case 'light_rain':
      return 'Light rain';
    case 'rain':
      return 'Rain';
    case 'heavy_rain':
      return 'Heavy rain';
  }
}

/** Conditions ordered from best to worst for planning purposes. */
export const WEATHER_SEVERITY: readonly WeatherCondition[] = [
  'clear',
  'cloudy',
  'light_rain',
  'rain',
  'heavy_rain',
];

/** How severe a condition is, 0 for clear through 4 for heavy rain. */
export function weatherSeverity(condition: WeatherCondition): number {
  return WEATHER_SEVERITY.indexOf(condition);
}

/** True when the user should be told to leave earlier than usual. */
export function weatherAffectsCommute(condition: WeatherCondition): boolean {
  return weatherSeverity(condition) >= weatherSeverity('rain');
}
