'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import HomeScanner from '@/components/HomeScanner';
import TripSheet, { type TripDraft } from '@/components/TripSheet';
import type { Trip } from '@/types';
import { tripDisplayName } from '@/lib/trip-labels';
import { RESOURCES, useCachedData } from '@/lib/data-cache';
import { ChevronRightIcon, FuelPumpIcon, PencilIcon } from '@/components/icons';

export default function HomePage() {
  const { user, profile } = useAuth();
  const { data: tripsData, loading } = useCachedData<Trip[]>(RESOURCES.trips);
  const trips = tripsData ?? [];
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const [scanRequest, setScanRequest] = useState(0);

  // Closing the sheet without saving: free the photo, and if it came from the camera, scan again (retake).
  const closeDraft = useCallback(() => {
    if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    if (draft?.reading || draft?.previewUrl) setScanRequest((n) => n + 1);
    setDraft(null);
  }, [draft]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-ink">Hey, {user?.name?.split(' ')[0] || 'Driver'}</h1>
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

      <section className="space-y-2.5" aria-label="Add a trip">
        <HomeScanner onResult={setDraft} hold={draft !== null} scanRequest={scanRequest} />
        <button
          type="button"
          onClick={() => setDraft({ reading: null, previewUrl: null })}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-soft active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <PencilIcon size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Type it in</span>
            <span className="block text-xs text-muted">Enter the distance and average yourself</span>
          </span>
          <ChevronRightIcon size={18} className="shrink-0 text-muted" />
        </button>
      </section>

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
              Point the camera above at your trip meter to add your first trip.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setDraft({ reading: null, previewUrl: null })}
                className="text-xs font-semibold text-primary hover:text-primary-hover"
              >
                Or type one in
              </button>
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
                    <img src={trip.photoURL} alt="Trip proof" loading="lazy" decoding="async" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-line" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-surface-soft flex items-center justify-center text-primary shrink-0"><FuelPumpIcon size={22} /></div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {tripDisplayName(trip) || `${trip.distanceKm} km • ${trip.avgMileageKmpl} km/L`}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {tripDisplayName(trip) ? `${trip.distanceKm} km • ` : ''}
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

      {draft && <TripSheet draft={draft} onClose={closeDraft} />}
    </div>
  );
}
