/** Axis scale helpers. */

import { round } from '@/src/utils/math';

/**
 * Computes "nice" axis ticks.
 *
 * Rounds the maximum up to a readable number and splits it into
 * `count` steps, so gridline labels are always round figures rather than
 * `7.4283`.
 */
export function niceTicks(maxValue: number, count = 4): number[] {
  if (maxValue <= 0) return [0, 1];

  const roughStep = maxValue / count;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  const stepMultiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = stepMultiplier * magnitude;
  const top = Math.ceil(maxValue / step) * step;

  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return ticks;
}

/** Maps a value into a 0..1 fraction given the axis bounds. */
export function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return (value - min) / (max - min);
}

/** Maps a 0..1 fraction back into a value. */
export function denormalize(fraction: number, min: number, max: number): number {
  return min + fraction * (max - min);
}

/** Builds an SVG path `M x,y L x,y ...` from points. */
export function linePath(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x, 2)} ${round(point.y, 2)}`)
    .join(' ');
}

/** Interpolates a smooth curve through points using mid-point quadratics. */
export function smoothPath(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const only = points[0];
    return only === undefined ? '' : `M ${round(only.x, 2)} ${round(only.y, 2)}`;
  }

  const first = points[0];
  if (first === undefined) return '';

  let path = `M ${round(first.x, 2)} ${round(first.y, 2)}`;

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (previous === undefined || current === undefined) continue;
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    path += ` Q ${round(previous.x, 2)} ${round(previous.y, 2)} ${round(midX, 2)} ${round(midY, 2)}`;
  }

  const last = points[points.length - 1];
  if (last !== undefined) {
    path += ` L ${round(last.x, 2)} ${round(last.y, 2)}`;
  }
  return path;
}
