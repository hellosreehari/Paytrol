'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import type { Trip } from '@/types';

interface HomeBalance {
  amount: number;
}

export default function HomePage() {
  const { user, profile } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [balances, setBalances] = useState<HomeBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [tripsRes, balancesRes] = await Promise.all([
          fetch('/api/trips'),
          fetch('/api/balances'),
        ]);
        const tripsData = await tripsRes.json();
        const balancesData = await balancesRes.json();

        if (tripsData.success) setTrips(tripsData.data || []);
        if (balancesData.success) setBalances(balancesData.data || []);
      } catch (err) {
        console.error('Home load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalOwedToYou = balances
    .filter((b) => b.amount > 0)
    .reduce((acc, curr) => acc + curr.amount, 0);
  const totalYouOwe = balances
    .filter((b) => b.amount < 0)
    .reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <span>Hey, {user?.name?.split(' ')[0] || 'Driver'}</span>
            <span className="text-lg">👋</span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {profile?.defaultFuelType?.toUpperCase() || 'PETROL'} • {profile?.lastFuelPrice ? `₹${profile.lastFuelPrice}/L` : 'Fuel price not set'}
          </p>
        </div>

        <Link href="/profile" className="relative group">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || 'Profile'}
              className="w-10 h-10 rounded-full border border-primary-line group-hover:border-primary transition-colors"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-soft text-primary border border-primary-line flex items-center justify-center font-bold text-sm">
              {user?.name?.[0] || 'U'}
            </div>
          )}
        </Link>
      </header>

      <div className="relative overflow-hidden rounded-3xl bg-surface-soft p-5 text-ink border border-line">
        <div className="relative z-10 space-y-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Dashboard scan
          </span>
          <div>
            <h2 className="text-xl font-black tracking-tight text-ink">Add your next trip</h2>
            <p className="text-xs text-muted max-w-[260px] mt-1 leading-relaxed">
              Scan the cluster or enter distance and mileage manually.
            </p>
          </div>
          <div className="pt-1">
            <Link
              href="/capture"
              className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3 text-on-primary font-semibold text-sm hover:bg-primary-hover active:scale-[0.99] transition-all"
            >
              <span>Start trip</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>

      <Link
        href="/balances"
        className="block rounded-2xl bg-surface border border-line p-4 hover:border-line transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-soft border border-line flex items-center justify-center text-ink-soft">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-muted font-medium">Pending Settlements</p>
              <p className="text-sm font-bold text-ink">
                {totalOwedToYou > 0 && totalYouOwe > 0 ? (
                  <span>{formatCurrency(totalOwedToYou)} to receive · {formatCurrency(totalYouOwe)} to pay</span>
                ) : totalOwedToYou > 0 ? (
                  <span className="text-ink-soft">{formatCurrency(totalOwedToYou)} owed to you</span>
                ) : totalYouOwe > 0 ? (
                  <span className="text-ink-soft">{formatCurrency(totalYouOwe)} to pay</span>
                ) : (
                  <span>All settled up</span>
                )}
              </p>
            </div>
          </div>
          <span className="text-xs text-primary font-semibold flex items-center gap-1">
            <span>Balances</span>
            <span>→</span>
          </span>
        </div>
      </Link>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider">Recent Trips</h2>
          {trips.length > 0 && (
            <Link href="/history" className="text-xs text-primary hover:text-primary">
              See All ({trips.length})
            </Link>
          )}
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 bg-surface rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center space-y-2">
            <p className="text-sm font-medium text-ink-soft">No trips recorded yet</p>
            <p className="text-xs text-muted max-w-xs mx-auto">
              Snap your first cluster to calculate fuel usage and split costs.
            </p>
            <div className="pt-2">
              <Link href="/capture" className="text-xs font-semibold text-primary hover:text-primary">
                Scan Now →
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {trips.slice(0, 3).map((trip) => (
              <div
                key={trip.id}
                className="rounded-2xl bg-surface border border-line p-3.5 flex items-center justify-between gap-3 hover:border-line transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {trip.photoURL ? (
                    <img src={trip.photoURL} alt="Trip proof" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-line" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-surface-soft flex items-center justify-center text-muted shrink-0">⛽</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {trip.distanceKm} km • {trip.avgMileageKmpl} km/L
                    </p>
                    <p className="text-xs text-muted">
                      {formatRelativeTime(trip.createdAt)} • {trip.fuelUsedLiters.toFixed(2)}L
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary">{formatCurrency(trip.totalCost)}</p>
                  <p className="text-[10px] text-muted">
                    {trip.participants?.length > 1 ? `${trip.participants.length} split` : 'Solo trip'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
