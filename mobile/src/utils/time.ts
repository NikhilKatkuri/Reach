/** Time helpers built on dayjs. */
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

dayjs.extend(duration);
dayjs.extend(isSameOrBefore);
dayjs.extend(relativeTime);
dayjs.extend(utc);

/** Formats a time as `8:04 AM`. */
export function formatTime(timestamp: number): string {
  return dayjs(timestamp).format('h:mm A');
}

/** Formats a time as `08:04`, for dense timeline rows. */
export function formatTime24(timestamp: number): string {
  return dayjs(timestamp).format('HH:mm');
}

/** Formats a date as `Mon, 14 Sep`. */
export function formatDate(timestamp: number): string {
  return dayjs(timestamp).format('ddd, D MMM');
}

/** Formats a date as `14 Sep 2026`. */
export function formatDateFull(timestamp: number): string {
  return dayjs(timestamp).format('D MMM YYYY');
}

/** Formats a timestamp as `Mon, 14 Sep · 8:04 AM`. */
export function formatDateTime(timestamp: number): string {
  return `${formatDate(timestamp)} · ${formatTime(timestamp)}`;
}

/** Formats a duration in minutes as `48 min` or `1 h 12 m`. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} m`;
}

/** Formats a signed delay as `+6 min` or `−3 min`. */
export function formatDelay(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return 'on time';
  return rounded > 0 ? `+${rounded} min` : `−${Math.abs(rounded)} min`;
}

/** Formats a 0..1 probability as a whole-number percentage. */
export function formatProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

/** Formats a 0..100 score as a whole number. */
export function formatScore(score: number): string {
  return `${Math.round(score)}`;
}

/** Start of the local day containing `timestamp`. */
export function startOfDay(timestamp: number): number {
  return dayjs(timestamp).startOf('day').valueOf();
}

/** Start of the day `days` before `timestamp`. */
export function startOfDayOffset(timestamp: number, days: number): number {
  return dayjs(timestamp).startOf('day').subtract(days, 'day').valueOf();
}

/** Local midnight on a given date, as a timestamp. */
export function atLocalTime(dayTimestamp: number, hours: number, minutes: number): number {
  return dayjs(dayTimestamp).hour(hours).minute(minutes).second(0).millisecond(0).valueOf();
}

/** Human relative time, e.g. `3 days ago`. */
export function formatRelative(timestamp: number): string {
  return dayjs(timestamp).fromNow();
}

/** True when the timestamp falls on a weekend. */
export function isWeekend(timestamp: number): boolean {
  const day = dayjs(timestamp).day();
  return day === 0 || day === 6;
}

/** `0` for Sunday through `6` for Saturday. */
export function dayOfWeek(timestamp: number): number {
  return dayjs(timestamp).day();
}

/** Combines a calendar day with a time of day into a timestamp. */
export function combine(date: string, time: string): number {
  return dayjs(`${date} ${time}`, 'YYYY-MM-DD HH:mm').valueOf();
}

/** The raw dayjs instance, for the rare case a caller needs an extension. */
export { dayjs };
