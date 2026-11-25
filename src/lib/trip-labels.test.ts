import { describe, expect, it } from 'vitest';
import {
  cleanTripName,
  rankTripNames,
  sameTripName,
  suggestTripNames,
  TRIP_NAME_MAX_LENGTH,
  tripDisplayName,
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

describe('tripDisplayName', () => {
  it('uses the name when there is one', () => {
    expect(tripDisplayName({ name: 'Goa', tags: ['weekend'] })).toBe('Goa');
  });

  it('shows the old tags of a trip without a name', () => {
    expect(tripDisplayName({ tags: ['weekend', 'goa'] })).toBe('weekend · goa');
  });

  it('is empty for a trip with neither', () => {
    expect(tripDisplayName({})).toBe('');
    expect(tripDisplayName({ tags: [] })).toBe('');
  });
});

describe('rankTripNames', () => {
  it('orders names by how often they are used, ignoring case', () => {
    const trips = [{ name: 'Gym' }, { name: 'Office run' }, { name: 'office run' }, {}, { name: 'Airport' }];
    expect(rankTripNames(trips)).toEqual(['Office run', 'Gym', 'Airport']);
  });

  it('breaks ties by the most recent use and keeps its spelling', () => {
    // Newest first, as the API returns trips.
    const trips = [{ name: 'office Run' }, { name: 'Gym' }, { name: 'Office run' }, { name: 'gym' }];
    expect(rankTripNames(trips)).toEqual(['office Run', 'Gym']);
  });

  it('ignores old tags', () => {
    expect(rankTripNames([{ tags: ['goa'] }])).toEqual([]);
  });
});

describe('suggestTripNames', () => {
  const ranked = ['Office run', 'Gym', 'Airport drop', 'Goa weekend', 'Mall', 'Office party'];

  it('shows the most used names when nothing is typed', () => {
    expect(suggestTripNames(ranked, '  ')).toEqual(ranked.slice(0, 5));
  });

  it('narrows to names with a word starting with the text', () => {
    expect(suggestTripNames(ranked, 'of')).toEqual(['Office run', 'Office party']);
    expect(suggestTripNames(ranked, 'DROP')).toEqual(['Airport drop']);
    expect(suggestTripNames(ranked, 'run ')).toEqual(['Office run']);
  });

  it('leaves out a name that is already typed in full', () => {
    expect(suggestTripNames(ranked, 'gym')).toEqual([]);
  });
});

describe('sameTripName', () => {
  it('ignores case and spacing', () => {
    expect(sameTripName(' Office  run', 'office run')).toBe(true);
    expect(sameTripName('Office', 'Office run')).toBe(false);
  });
});
