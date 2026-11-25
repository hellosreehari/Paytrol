import { describe, expect, it } from 'vitest';
import { cleanTripDate, formatTripWhen, formatTripWhenExact, sortByTripDate, tripWhen } from '@/lib/trip-date';

// Wed 25 Nov 2026, 10:30 pm local time.
const now = new Date(2026, 10, 25, 22, 30);
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('formatTripWhen', () => {
  it('counts minutes and hours on the same day', () => {
    expect(formatTripWhen(ago(20_000), now)).toBe('Just now');
    expect(formatTripWhen(ago(40 * MIN), now)).toBe('40 min ago');
    expect(formatTripWhen(ago(HOUR), now)).toBe('1 hour ago');
    expect(formatTripWhen(ago(3 * HOUR), now)).toBe('3 hours ago');
  });

  it('uses calendar days after that', () => {
    // 11 pm yesterday is less than a day ago, but it was yesterday.
    expect(formatTripWhen(new Date(2026, 10, 24, 23, 0).toISOString(), now)).toBe('Yesterday');
    expect(formatTripWhen(new Date(2026, 10, 22, 9, 0).toISOString(), now)).toBe('3 days ago');
    expect(formatTripWhen('2026-11-19', now)).toBe('6 days ago');
  });

  it('moves to weeks, months, then month and year', () => {
    expect(formatTripWhen('2026-11-18', now)).toBe('1 week ago');
    expect(formatTripWhen('2026-11-04', now)).toBe('3 weeks ago');
    expect(formatTripWhen('2026-09-20', now)).toBe('2 months ago');
    expect(formatTripWhen('2025-10-02', now)).toMatch(/Oct 2025/);
  });

  it('reads a day without a time as Today or Yesterday', () => {
    expect(formatTripWhen('2026-11-25', now)).toBe('Today');
    expect(formatTripWhen('2026-11-24', now)).toBe('Yesterday');
  });
});

describe('formatTripWhenExact', () => {
  it('adds the time only when it is known', () => {
    expect(formatTripWhenExact('2026-11-23', now)).toBe('Mon, 23 Nov');
    expect(formatTripWhenExact(new Date(2026, 10, 23, 20, 15).toISOString(), now)).toMatch(/^Mon, 23 Nov · 8:15 pm$/i);
    expect(formatTripWhenExact('2025-10-02', now)).toBe('Thu, 2 Oct 2025');
  });
});

describe('tripWhen and sortByTripDate', () => {
  it('uses the trip date when there is one, and sorts by it', () => {
    const logged = { id: 'a', createdAt: new Date(2026, 10, 25, 9).toISOString() };
    const backdated = { id: 'b', createdAt: new Date(2026, 10, 25, 21).toISOString(), tripDate: '2026-11-20' };
    const older = { id: 'c', createdAt: new Date(2026, 10, 22, 9).toISOString() };
    expect(tripWhen(backdated)).toBe('2026-11-20');
    expect(sortByTripDate([backdated, older, logged]).map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('cleanTripDate', () => {
  it('accepts a real day up to tomorrow', () => {
    expect(cleanTripDate('2026-11-20', now)).toBe('2026-11-20');
    expect(cleanTripDate('2026-11-26', now)).toBe('2026-11-26');
  });

  it('rejects other input', () => {
    expect(cleanTripDate('2026-12-25', now)).toBe('');
    expect(cleanTripDate('2026-02-30', now)).toBe('');
    expect(cleanTripDate('1999-12-31', now)).toBe('');
    expect(cleanTripDate('2026-11-20T10:00:00Z', now)).toBe('');
    expect(cleanTripDate(20261120, now)).toBe('');
  });
});
