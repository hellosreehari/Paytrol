import type { Trip } from '@/types';

export interface TripStats {
  trips: number;
  distanceKm: number;
  /** What your own share of the fuel came to. */
  yourCost: number;
  /** Distance over fuel across all trips, or null with no fuel logged. */
  avgKmpl: number | null;
  thisMonthTrips: number;
  thisMonthCost: number;
}

/** Totals for the trips you drove or rode in, for the Profile page. */
export function tripStats(trips: Trip[], uid: string, now = new Date()): TripStats {
  const mine = trips.filter((t) => t.creatorUid === uid || t.participants?.some((p) => p.uid === uid));
  let distanceKm = 0;
  let litres = 0;
  let yourCost = 0;
  let thisMonthTrips = 0;
  let thisMonthCost = 0;
  for (const trip of mine) {
    const share = trip.participants?.find((p) => p.uid === uid)?.shareAmount ?? 0;
    distanceKm += trip.distanceKm || 0;
    litres += trip.fuelUsedLiters || 0;
    yourCost += share;
    const created = new Date(trip.createdAt);
    if (created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()) {
      thisMonthTrips += 1;
      thisMonthCost += share;
    }
  }
  return {
    trips: mine.length,
    distanceKm: Math.round(distanceKm * 10) / 10,
    yourCost: Math.round(yourCost * 100) / 100,
    avgKmpl: litres > 0 ? Math.round((distanceKm / litres) * 10) / 10 : null,
    thisMonthTrips,
    thisMonthCost: Math.round(thisMonthCost * 100) / 100,
  };
}
