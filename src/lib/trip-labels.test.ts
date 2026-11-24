import { describe, expect, it } from 'vitest';
import {
  cleanTripName,
  cleanTripTags,
  collectTripTags,
  TRIP_NAME_MAX_LENGTH,
  TRIP_TAGS_MAX,
  tripHasTag,
} from '@/lib/trip-labels';

describe('cleanTripName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanTripName('  Goa   weekend ')).toBe('Goa weekend');
  });

  it('returns an empty string for missing or non-string input', () => {
    expect(cleanTripName(undefined)).toBe('');
    expect(cleanTripName(42)).toBe('');
    expect(cleanTripName('   ')).toBe('');
  });

  it('limits the length', () => {
    expect(cleanTripName('a'.repeat(200))).toHaveLength(TRIP_NAME_MAX_LENGTH);
  });
});

describe('cleanTripTags', () => {
  it('accepts a comma-separated string', () => {
    expect(cleanTripTags('office, #commute ,  ')).toEqual(['office', 'commute']);
  });

  it('removes duplicates case-insensitively and keeps the first spelling', () => {
    expect(cleanTripTags(['Office', 'office', 'OFFICE', 'Goa'])).toEqual(['Office', 'Goa']);
  });

  it('drops non-string entries and caps the count', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(cleanTripTags([1, null, ...many])).toHaveLength(TRIP_TAGS_MAX);
  });

  it('returns an empty list for anything else', () => {
    expect(cleanTripTags(undefined)).toEqual([]);
    expect(cleanTripTags({ tag: 'x' })).toEqual([]);
  });
});

describe('collectTripTags', () => {
  it('orders tags by how often they are used', () => {
    const trips = [{ tags: ['goa', 'Office'] }, { tags: ['office'] }, {}];
    expect(collectTripTags(trips)).toEqual(['Office', 'goa']);
  });
});

describe('tripHasTag', () => {
  it('matches case-insensitively', () => {
    expect(tripHasTag({ tags: ['Office'] }, 'office')).toBe(true);
    expect(tripHasTag({}, 'office')).toBe(false);
  });
});
