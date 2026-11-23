'use client';

import { useState, useId } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { CheckIcon, FUEL_TYPE_ICONS } from '@/components/icons';

const fuelTypes = [
  { value: 'petrol', label: 'Petrol', icon: FUEL_TYPE_ICONS.petrol },
  { value: 'diesel', label: 'Diesel', icon: FUEL_TYPE_ICONS.diesel },
  { value: 'cng', label: 'CNG', icon: FUEL_TYPE_ICONS.cng },
] as const;

export default function ProfilePage() {
  const { user, profile, updateProfile, signOut } = useAuth();
  const fuelPriceId = useId();

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
      setSaveError('Could not save your preferences. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-ink">Profile &amp; Settings</h1>
        <p className="text-xs text-muted mt-1">
          Manage your defaults, vehicle fuel preferences, and account.
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
            Google Connected
          </span>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-2xl bg-primary-soft border border-primary-line text-primary text-xs flex items-center gap-2">
          <CheckIcon size={16} />
          <span>Profile &amp; vehicle preferences saved successfully!</span>
        </div>
      )}
      {saveError && (
        <div className="p-3.5 rounded-2xl bg-danger-soft border border-danger-line text-danger text-xs">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5 rounded-3xl bg-surface border border-line p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
          Vehicle &amp; Fuel Defaults
        </h2>

        <div>
          <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
            Fuel Type
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
            className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2 cursor-pointer"
          >
            Last-Paid Fuel Price (₹/L)
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
          <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
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
          className="w-full py-3 bg-primary hover:bg-primary-hover text-on-primary font-bold rounded-2xl text-xs transition-colors"
        >
          {saving ? 'Updating...' : 'Save Preferences'}
        </button>
      </form>

      <button
        onClick={signOut}
        className="w-full py-3.5 rounded-2xl bg-danger-soft hover:bg-danger-soft border border-danger-line text-danger text-xs font-bold transition-colors"
      >
        Sign Out of Paytrol
      </button>
    </div>
  );
}
