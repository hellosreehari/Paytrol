// When a trip happened, as opposed to when it was logged.
//
// A trip logged "today" has no tripDate: its createdAt is when it happened.
// A trip logged for an earlier day stores that day as "YYYY-MM-DD" (a calendar
// day in the user's own time zone, with no time), so it never shows a made-up
// time of day.

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface Dated {
  tripDate?: string;
  createdAt: string;
}

/** True for a day without a time, e.g. "2026-11-23". */
export function isDayOnly(value: string): boolean {
  return DAY_ONLY.test(value);
}

/** A local calendar day as "YYYY-MM-DD". */
export function toDayString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The local Date for a stored value: midday for a day without a time, so sorting puts it mid-day. */
export function parseTripDate(value: string): Date {
  if (isDayOnly(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }
  return new Date(value);
}

/** When the trip happened: its tripDate, or when it was logged. */
export function tripWhen(trip: Dated): string {
  return trip.tripDate || trip.createdAt;
}

/** Milliseconds for sorting trips by when they happened, newest first. */
export function tripTime(trip: Dated): number {
  const time = parseTripDate(tripWhen(trip)).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Trips ordered by when they happened, newest first. Ties keep the logged order. */
export function sortByTripDate<T extends Dated>(trips: T[]): T[] {
  return [...trips].sort((a, b) => tripTime(b) - tripTime(a));
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/**
 * A relative time that gets coarser with age: Just now, 40 min ago,
 * 3 hours ago, Yesterday, 3 days ago, 2 weeks ago, 2 months ago, Nov 2025.
 * A day without a time reads Today, Yesterday, 3 days ago and so on.
 */
export function formatTripWhen(value: string, now: Date = new Date()): string {
  const date = parseTripDate(value);
  if (!Number.isFinite(date.getTime())) return '';
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);

  if (!isDayOnly(value) && days <= 0) {
    const diff = Math.max(0, now.getTime() - date.getTime());
    if (diff < MINUTE) return 'Just now';
    if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
    return plural(Math.floor(diff / HOUR), 'hour');
  }
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return plural(Math.floor(days / 7), 'week');
  if (days < 365) return plural(Math.max(1, Math.floor(days / 30)), 'month');
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/** The exact date (and time, when known), e.g. "Mon, 23 Nov · 8:15 pm". The year shows when it isn't this year. */
export function formatTripWhenExact(value: string, now: Date = new Date()): string {
  const date = parseTripDate(value);
  if (!Number.isFinite(date.getTime())) return '';
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString('en-IN', options);
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  const day = `${part({ weekday: 'short' })}, ${date.getDate()} ${part({ month: 'short' })}${year}`;
  if (isDayOnly(value)) return day;
  return `${day} · ${date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * Check a trip date sent to the API: a "YYYY-MM-DD" day that is a real date,
 * not before 2000 and not after tomorrow (the phone's day can be ahead of
 * the server's). Returns '' when it is missing or not acceptable.
 */
export function cleanTripDate(value: unknown, now: Date = new Date()): string {
  if (typeof value !== 'string' || !isDayOnly(value)) return '';
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  if (y < 2000) return '';
  if (date.getTime() > now.getTime() + DAY) return '';
  return value;
}
