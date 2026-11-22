'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import type { Trip, Balance } from '@/types';

export default function HomePage() {
  const { user, profile } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <header className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Hey, {user?.name?.split(' ')[0] || 'Driver'}</span>
            <span className="text-lg">👋</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {profile?.defaultFuelType?.toUpperCase() || 'PETROL'} • ₹{profile?.lastFuelPrice || 105}/L
          </p>
        </div>

        <Link href="/profile" className="relative group">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || 'Profile'}
              className="w-10 h-10 rounded-full border border-indigo-500/50 group-hover:border-indigo-400 transition-colors"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 flex items-center justify-center font-bold text-sm">
              {user?.name?.[0] || 'U'}
            </div>
          )}
        </Link>
      </header>

      {/* Prominent Scan Dashboard Hero CTA */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-6 text-white shadow-2xl shadow-indigo-600/25 border border-indigo-400/30">
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-indigo-100 border border-white/20">
            <span>✨</span>
            <span>Vision AI Extraction</span>
          </div>

          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Scan Dashboard
            </h2>
            <p className="text-xs text-indigo-100/90 max-w-[220px] mt-1 leading-relaxed">
              Snap your cluster. We extract trip distance & avg fuel economy automatically.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/capture"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-indigo-950 font-bold text-sm shadow-md hover:bg-indigo-50 active:scale-95 transition-all"
            >
              <svg className="w-4 h-4 text-indigo-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              <span>Start Trip Scan</span>
            </Link>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-6 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Quick Summary Balances Card */}
      <Link
        href="/balances"
        className="block rounded-2xl bg-slate-900/80 border border-slate-800/90 p-4 hover:border-slate-700 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Pending Settlements</p>
              <p className="text-base font-bold text-white">
                {totalOwedToYou > 0 ? (
                  <span className="text-emerald-400">+{formatCurrency(totalOwedToYou)} owed to you</span>
                ) : (
                  <span>All settled up</span>
                )}
              </p>
            </div>
          </div>
          <span className="text-xs text-indigo-400 font-semibold flex items-center gap-1">
            <span>Balances</span>
            <span>→</span>
          </span>
        </div>
      </Link>

      {/* Recent Trips Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Recent Trips
          </h2>
          {trips.length > 0 && (
            <Link href="/history" className="text-xs text-indigo-400 hover:text-indigo-300">
              See All ({trips.length})
            </Link>
          )}
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 bg-slate-900/60 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center space-y-2">
            <span className="text-2xl">🚗</span>
            <p className="text-sm font-medium text-slate-300">No trips recorded yet</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Snap your first cluster to calculate fuel usage and split costs.
            </p>
            <div className="pt-2">
              <Link
                href="/capture"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
              >
                Scan Now →
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {trips.slice(0, 3).map((trip) => (
              <div
                key={trip.id}
                className="rounded-2xl bg-slate-900/70 border border-slate-800 p-3.5 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {trip.photoURL ? (
                    <img
                      src={trip.photoURL}
                      alt="Trip proof"
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-800"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                      ⛽
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {trip.distanceKm} km • {trip.avgMileageKmpl} km/L
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatRelativeTime(trip.createdAt)} • {trip.fuelUsedLiters.toFixed(2)}L
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-indigo-400">
                    {formatCurrency(trip.totalCost)}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {trip.participants?.length > 1
                      ? `${trip.participants.length} split`
                      : 'Solo trip'}
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
