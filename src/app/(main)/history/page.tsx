'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import type { Trip } from '@/types';

export default function HistoryPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrips() {
      try {
        const res = await fetch('/api/trips');
        const data = await res.json();
        if (data.success && data.data) {
          setTrips(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load trips history:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTrips();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-white">Trip History</h1>
        <p className="text-xs text-slate-400 mt-1">
          Every trip logged with attached dashboard photo, math breakdown, and participant shares.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-slate-900/60 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800 p-12 text-center space-y-2">
          <span className="text-3xl">🛣️</span>
          <p className="text-sm font-semibold text-white">No trips recorded yet</p>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Scan your car dashboard cluster to log your first trip!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl"
            >
              {trip.photoURL && (
                <div className="relative aspect-[21/9] bg-black">
                  <img
                    src={trip.photoURL}
                    alt="Dashboard proof"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md text-[10px] text-slate-300">
                    {formatRelativeTime(trip.createdAt)}
                  </div>
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {trip.distanceKm} km Trip
                    </h3>
                    <p className="text-xs text-slate-400">
                      Logged by {trip.creatorName}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-indigo-400">
                      {formatCurrency(trip.totalCost)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {trip.fuelUsedLiters.toFixed(2)} L fuel
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-800/40 p-2.5 rounded-xl border border-slate-800/80 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Mileage</span>
                    <span className="font-semibold text-white">{trip.avgMileageKmpl} km/L</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Fuel Rate</span>
                    <span className="font-semibold text-white">₹{trip.fuelPricePerLiter}/L</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Split Mode</span>
                    <span className="font-semibold text-white capitalize">{trip.splitMode}</span>
                  </div>
                </div>

                {trip.participants && trip.participants.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Riders ({trip.participants.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {trip.participants.map((p, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/60 px-2 py-1 rounded-lg text-xs"
                        >
                          <span className="text-white font-medium">{p.displayName}</span>
                          <span className="text-indigo-400 font-bold">
                            {formatCurrency(p.shareAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
