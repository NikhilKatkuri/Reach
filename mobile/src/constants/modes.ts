/** Display metadata for each transport mode. */
import { type TransportMode } from '@/src/types/schemas';

/** Short label used in chips and pills. */
export const MODE_LABELS: Readonly<Record<TransportMode, string>> = {
  walk: 'Walk',
  bus: 'Bus',
  metro: 'Metro',
  train: 'Train',
  auto: 'Auto',
  bike: 'Bike',
  cab: 'Cab',
};

/**
 * Modes that are road-based and therefore sensitive to traffic.
 *
 * Metro and train run on fixed infrastructure; walk and bike are off-road.
 * The engine's traffic model keys off exactly this set.
 */
export const ROAD_MODES: ReadonlySet<TransportMode> = new Set<TransportMode>([
  'bus',
  'auto',
  'cab',
]);

/** Modes that require waiting at a stop and can be missed. */
export const BOARDABLE_MODES: ReadonlySet<TransportMode> = new Set<TransportMode>([
  'bus',
  'metro',
  'train',
  'auto',
  'cab',
]);

/** Modes that involve boarding, so crowd level matters. */
export const CROWD_SENSITIVE_MODES: ReadonlySet<TransportMode> = new Set<TransportMode>([
  'bus',
  'metro',
  'train',
  'auto',
  'cab',
]);

/** True when the mode runs on roads and is affected by congestion. */
export function isRoadMode(mode: TransportMode): boolean {
  return ROAD_MODES.has(mode);
}

/** True when the mode must be boarded at a stop. */
export function isBoardable(mode: TransportMode): boolean {
  return BOARDABLE_MODES.has(mode);
}

/** Human label for a mode. */
export function modeLabel(mode: TransportMode): string {
  return MODE_LABELS[mode] ?? mode;
}
