/**
 * Presentation helpers for describing a route.
 *
 * These live outside the components on purpose. Transfer counts, duration
 * labels and route descriptions are shown in the editor preview, the Today
 * hero, the route comparison sheet and the history list, and they must all
 * agree. Deriving them per-screen is how a route ends up reading as "1
 * transfer" in one place and "2 transfers" in another.
 */
import { type RouteCandidate } from '@/src/types/schemas';
import { MODE_LABELS } from '@/src/constants/modes';
import { type RoutePath } from './graph';

/** "1 transfer" / "2 transfers" / "Direct", from a real count. */
export function routeTransferLabel(transferCount: number): string {
  if (transferCount <= 0) return 'Direct';
  return `${transferCount} transfer${transferCount === 1 ? '' : 's'}`;
}

/**
 * The transfer count to display for a path.
 *
 * Prefers the engine's count on the matching candidate, and falls back to the
 * path's own `transferCount`. Never collapses to a boolean: that was the bug
 * this replaces, where any route with at least one transfer claimed to have
 * exactly one.
 */
export function transferCountFor(
  path: RoutePath,
  candidate: RouteCandidate | null | undefined,
): number {
  if (candidate !== null && candidate !== undefined && candidate.signature === path.signature) {
    if (candidate.transferCount !== undefined) return candidate.transferCount;
  }
  return path.transferCount;
}

/** "42 min" / "1h 10m" for a duration in minutes. */
export function formatDurationLabel(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;

  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

/**
 * A compact route summary, e.g. "Walk → Metro → Walk · 42 min".
 *
 * `→` rather than `·` because these are places in sequence; the middot form
 * reads as a set of independent options, which is the opposite of what a
 * route is.
 */
export function describeRouteInline(modes: readonly string[], durationMinutes?: number): string {
  const labels = modes.map((mode) => MODE_LABELS[mode as keyof typeof MODE_LABELS] ?? mode);
  const chain = labels.length > 0 ? labels.join(' → ') : 'No route yet';
  return durationMinutes === undefined
    ? chain
    : `${chain} · ${formatDurationLabel(durationMinutes)}`;
}
