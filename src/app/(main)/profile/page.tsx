'use client';

import { useState, useId } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { BTN, BTN_SIZE } from '@/lib/ui';
import Link from 'next/link';
import { ChevronRightIcon, CheckIcon, FUEL_TYPE_ICONS, UsersIcon } from '@/components/icons';
import { formatCurrency } from '@/lib/utils';
import { RESOURCES, useCachedData } from '@/lib/data-cache';
import { tripStats } from '@/lib/trip-stats';
import type { Friendship, GuestContact, Trip } from '@/types';

const fuelTypes = [
  { value: 'petrol', label: 'Petrol', icon: FUEL_TYPE_ICONS.petrol },
  { value: 'diesel', label: 'Diesel', icon: FUEL_TYPE_ICONS.diesel },
  { value: 'cng', label: 'CNG', icon: FUEL_TYPE_ICONS.cng },
] as const;

export default function ProfilePage() {
  const { user, profile, updateProfile, signOut } = useAuth();
  const fuelPriceId = useId();
  const tripsData = useCachedData<Trip[]>(RESOURCES.trips).data;
  const friendsData = useCachedData<{ friends: Friendship[] }>(RESOURCES.friends).data;
  const guestsData = useCachedData<GuestContact[]>(RESOURCES.guests).data;
  const stats = tripStats(tripsData ?? [], user?.uid || '');
  const friendCount = friendsData?.friends?.length ?? 0;
  const guestCount = guestsData?.length ?? 0;

  const [fuelType, setFuelType] = useState<'petrol' | 'diesel' | 'cng'>(
    profile?.defaultFuelType || 'petrol'
  );
  const [fuelPrice, setFuelPrice] = useState(
    profile?.lastFuelPrice ? String(profile.lastFuelPrice) : ''
  );
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(false);

    const lastFuelPrice = Number(fuelPrice);
    if (!Number.isFinite(lastFuelPrice) || lastFuelPrice <= 0) {
      setSaveError('Enter a valid fuel price per liter.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    const success = await updateProfile({
      defaultFuelType: fuelType,
      currency: 'INR',
      lastFuelPrice,
    });

    setSaving(false);
    if (success) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } else {
      setSaveError('Couldn’t save. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-ink">Profile</h1>
        <p className="text-xs text-muted mt-1">
          Your trips, people and fuel defaults.
        </p>
      </header>

      <div className="rounded-3xl bg-surface border border-line p-5 flex items-center gap-4">
        {user?.image ? (
          <img
            src={user.image}
            alt=""
            className="w-14 h-14 rounded-2xl border-2 border-primary shadow-md"
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary font-bold text-xl flex items-center justify-center">
            {user?.name?.[0] || 'U'}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-base font-bold text-ink truncate">{user?.name || 'Driver'}</p>
          <p className="text-xs text-muted truncate">{user?.email || 'driver@paytrol.app'}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold text-primary bg-primary-soft px-2 py-0.5 rounded-full border border-primary-line">
            Signed in with Google
          </span>
        </div>
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="stats-title">
        <div className="flex items-baseline justify-between">
          <h2 id="stats-title" className="text-xs font-bold uppercase tracking-wider text-primary">
            Your trips
          </h2>
          {stats.thisMonthTrips > 0 && (
            <span className="text-xs text-muted">
              This month: {stats.thisMonthTrips} {stats.thisMonthTrips === 1 ? 'trip' : 'trips'} · {formatCurrency(stats.thisMonthCost)}
            </span>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {[
            { label: 'Trips', value: String(stats.trips) },
            { label: 'Distance', value: `${stats.distanceKm.toLocaleString('en-IN')} km` },
            { label: 'Your fuel cost', value: formatCurrency(stats.yourCost) },
            { label: 'Average', value: stats.avgKmpl ? `${stats.avgKmpl} km/L` : '–' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-surface-soft px-3.5 py-3">
              <dt className="text-[11px] font-medium text-muted">{item.label}</dt>
              <dd className="mt-0.5 text-lg font-black text-ink tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Link
        href="/friends"
        className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 hover:bg-surface-soft"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <UsersIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">People</span>
          <span className="block text-xs text-muted">
            {friendCount} {friendCount === 1 ? 'friend' : 'friends'} · {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
          </span>
        </span>
        <ChevronRightIcon size={18} className="text-muted" />
      </Link>

      {savedSuccess && (
        <div className="p-3.5 rounded-2xl bg-primary-soft border border-primary-line text-primary text-xs flex items-center gap-2">
          <CheckIcon size={16} />
          <span>Saved.</span>
        </div>
      )}
      {saveError && (
        <div className="p-3.5 rounded-2xl bg-danger-soft border border-danger-line text-danger text-xs">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5 rounded-3xl bg-surface border border-line p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
          Fuel defaults
        </h2>

        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-2">
            Fuel type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {fuelTypes.map((ft) => (
              <button
                type="button"
                key={ft.value}
                onClick={() => setFuelType(ft.value)}
                className={cn(
                'flex flex-col items-center justify-center p-3 rounded-2xl border transition-all',
                  fuelType === ft.value
                  ? 'bg-primary-soft border-primary text-ink shadow-sm'
                  : 'bg-surface-soft border-line text-muted hover:border-line-strong'
                )}
              >
              <ft.icon size={24} className="mb-1.5" />
              <span className="text-xs font-semibold">{ft.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor={fuelPriceId}
            className="block text-xs font-semibold text-ink-soft mb-2 cursor-pointer"
          >
            Fuel price you last paid
          </label>
          <div className="bg-surface-soft border border-line rounded-2xl p-3.5 flex items-center gap-2">
            <span className="text-lg font-bold text-muted">₹</span>
            <input
              id={fuelPriceId}
              type="number"
              step="0.1"
              min="1"
              required
              value={fuelPrice}
              onChange={(e) => setFuelPrice(e.target.value)}
              className="w-full bg-transparent text-xl font-bold text-ink outline-none"
            />
            <span className="text-xs text-muted">/L</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-2">
            Currency
          </label>
          <div className="bg-surface-soft border border-line rounded-2xl p-3 flex justify-between text-xs text-ink-soft">
            <span>INR (₹)</span>
            <span className="text-muted">Auto</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className={cn(BTN.primary, BTN_SIZE.md, 'w-full')}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <button
        type="button"
        onClick={signOut}
        className={cn(BTN.dangerOutline, BTN_SIZE.md, 'w-full')}
      >
        Sign out
      </button>
    </div>
  );
}
