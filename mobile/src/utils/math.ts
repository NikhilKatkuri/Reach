/** Generic numeric helpers used across the engine and UI layers. */

/** Restricts `value` to the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Clamps to the 0..1 interval. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Clamps to the 0..100 interval. */
export function clamp100(value: number): number {
  return clamp(value, 0, 100);
}

/** Linear interpolation between `a` and `b` by `t`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Rounds to `digits` decimal places without float drift. */
export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Returns `value` rounded to the nearest multiple of `step`. */
export function snap(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** Sums an array of numbers. */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/** Arithmetic mean, or `null` for an empty array. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}

/**
 * Population standard deviation.
 *
 * Population (not sample) standard deviation is deliberate: we are
 * describing the observed distribution of a user's own commutes, not
 * estimating the variance of a wider population.
 */
export function stddev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mu = sum(values) / values.length;
  let acc = 0;
  for (const value of values) acc += (value - mu) ** 2;
  return Math.sqrt(acc / values.length);
}

/** Drops non-finite values so downstream math never sees `NaN`. */
export function finite(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

/** Sorts a copy of `values` ascending, leaving the input untouched. */
export function sortedAscending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Linear-interpolated percentile (the "R-7" / Excel `PERCENTILE.INC`
 * definition) over an unsorted array.
 *
 * @param p Percentile in 0..1, e.g. `0.9` for P90.
 * @returns The interpolated percentile, or `null` for an empty array.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = sortedAscending(values);
  if (sorted.length === 1) return sorted[0];

  const rank = clamp(p, 0, 1) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];

  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  return lerp(lower, upper, rank - lowerIndex);
}

/** Median of a sample. Shortcut for `percentile(values, 0.5)`. */
export function median(values: readonly number[]): number | null {
  return percentile(values, 0.5);
}

/**
 * Median absolute deviation — a robust spread measure that, unlike standard
 * deviation, is not dragged around by a single 40-minute bus breakdown.
 */
export function mad(values: readonly number[]): number {
  const center = median(values);
  if (center === null) return 0;
  return median(values.map((value) => Math.abs(value - center))) ?? 0;
}

/** Interquartile range. */
export function iqr(values: readonly number[]): number {
  const q1 = percentile(values, 0.25);
  const q3 = percentile(values, 0.75);
  if (q1 === null || q3 === null) return 0;
  return q3 - q1;
}

/** Formats a 0..1 ratio as a whole-number percentage string. */
export function formatPercent(ratio: number, digits = 0): string {
  return `${round(ratio * 100, digits)}%`;
}
