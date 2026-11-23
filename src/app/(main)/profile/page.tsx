'use client';

import { useState, useId } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const fuelTypes = [
  { value: 'petrol', label: 'Petrol', icon: '⛽' },
  { value: 'diesel', label: 'Diesel', icon: '🛢️' },
  { value: 'cng', label: 'CNG', icon: '💨' },
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
    setSaving(true);
    setSavedSuccess(false);

    const lastFuelPrice = Number(fuelPrice);
    if (!Number.isFinite(lastFuelPrice) || lastFuelPrice <= 0) {
      setSaveError('Enter a valid fuel price per liter.');
      return;
    }

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
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-white">Profile &amp; Settings</h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage your defaults, vehicle fuel preferences, and account.
        </p>
      </header>

      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 flex items-center gap-4">
        {user?.image ? (
          <img
            src={user.image}
            alt=""
            className="w-14 h-14 rounded-2xl border-2 border-indigo-500 shadow-md"
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 text-indigo-400 font-bold text-xl flex items-center justify-center">
            {user?.name?.[0] || 'U'}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-base font-bold text-white truncate">{user?.name || 'Driver'}</p>
          <p className="text-xs text-slate-400 truncate">{user?.email || 'driver@paytrol.app'}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            Google Connected
          </span>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <span>✓</span>
          <span>Profile &amp; vehicle preferences saved successfully!</span>
        </div>
      )}
      {saveError && (
        <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5 rounded-3xl bg-slate-900/60 border border-slate-800 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
          Vehicle &amp; Fuel Defaults
        </h2>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
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
                  ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm shadow-indigo-500/30'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
                )}
              >
              <span className="text-xl mb-0.5">{ft.icon}</span>
              <span className="text-xs font-semibold">{ft.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor={fuelPriceId}
            className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 cursor-pointer"
          >
            Last-Paid Fuel Price (₹/L)
          </label>
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-3.5 flex items-center gap-2">
            <span className="text-lg font-bold text-slate-400">₹</span>
            <input
              id={fuelPriceId}
              type="number"
              step="0.1"
              min="1"
              required
              value={fuelPrice}
              onChange={(e) => setFuelPrice(e.target.value)}
              className="w-full bg-transparent text-xl font-bold text-white outline-none"
            />
            <span className="text-xs text-slate-400">/L</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Currency
          </label>
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-3 flex justify-between text-xs text-slate-300">
            <span>INR (₹)</span>
            <span className="text-slate-500">Auto</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-[#315e52] hover:bg-[#244a40] text-white font-bold rounded-2xl text-xs transition-colors"
        >
          {saving ? 'Updating...' : 'Save Preferences'}
        </button>
      </form>

      <button
        onClick={signOut}
        className="w-full py-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold transition-colors"
      >
        Sign Out of Paytrol
      </button>
    </div>
  );
}
