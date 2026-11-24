import { describe, expect, it } from 'vitest';
import type { Trip } from '@/types';
import { tripStats } from './trip-stats';

const trip = (over: Partial<Trip>): Trip =>
  ({
    id: 'x',
    creatorUid: 'me',
    creatorName: 'Me',
    distanceKm: 40,
    avgMileageKmpl: 16,
    fuelUsedLiters: 2.5,
    fuelPricePerLiter: 100,
    totalCost: 250,
    createdAt: '2026-11-10T10:00:00Z',
    participants: [
      { uid: 'me', displayName: 'Me', shareAmount: 125 },
      { uid: 'a', displayName: 'Anu', shareAmount: 125 },
    ],
    ...over,
  }) as unknown as Trip;

describe('tripStats', () => {
  it('adds up your trips, your share and this month', () => {
    const stats = tripStats(
      [
        trip({}),
        trip({ id: 'y', creatorUid: 'a', distanceKm: 60, fuelUsedLiters: 5, createdAt: '2026-10-02T10:00:00Z' }),
        trip({ id: 'z', creatorUid: 'b', participants: [] }),
      ],
      'me',
      new Date('2026-11-24T10:00:00Z')
    );
    expect(stats).toEqual({ trips: 2, distanceKm: 100, yourCost: 250, avgKmpl: 13.3, thisMonthTrips: 1, thisMonthCost: 125 });
  });

  it('handles no trips', () => {
    expect(tripStats([], 'me').avgKmpl).toBeNull();
  });
});
