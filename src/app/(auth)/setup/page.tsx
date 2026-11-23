'use client';

import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const fuelTypes = [
  { value: 'petrol', label: 'Petrol', icon: '⛽' },
  { value: 'diesel', label: 'Diesel', icon: '🛢️' },
  { value: 'cng', label: 'CNG', icon: '💨' },
] as const;

export default function SetupPage() {
  const { user, profile, updateProfile } = useAuth();
  const router = useRouter();
  const fuelPriceId = useId();

  const [fuelType, setFuelType] = useState<'petrol' | 'diesel' | 'cng'>(
    profile?.defaultFuelType || 'petrol'
  );
  const [currency] = useState('INR');
  const [fuelPrice, setFuelPrice] = useState(
    profile?.lastFuelPrice ? String(profile.lastFuelPrice) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(fuelPrice);
    if (!priceNum || priceNum <= 0) {
      setError('Please provide a valid fuel rate per liter');
      return;
    }

    setSaving(true);
    setError(null);

    const success = await updateProfile({
      defaultFuelType: fuelType,
      currency,
      lastFuelPrice: priceNum,
      displayName: user?.name || 'Driver',
      photoURL: user?.image || null,
    });

    setSaving(false);
    if (success) {
      router.push('/home');
    } else {
      setError('Failed to save profile. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between px-6 py-10 max-w-md mx-auto">
      <div className="space-y-6 pt-4">
        {/* User Avatar & Title */}
        <div className="text-center space-y-2">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || 'User'}
              className="w-16 h-16 rounded-full mx-auto border-2 border-indigo-500 shadow-md"
            />
          ) : (
            <div             className="w-16 h-16 rounded-2xl bg-[#e3ece6] text-[#315e52] border border-[#bfd0c4] flex items-center justify-center text-xl font-bold mx-auto">
              {user?.name?.[0] || 'P'}
            </div>
          )}
          <h1 className="text-2xl font-bold text-[#1b231f]">
            Welcome, {user?.name?.split(' ')[0] || 'Driver'}!
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Set your vehicle & fuel defaults once so every trip calculation is automated.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs p-3 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Fuel Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2.5">
              Default Fuel Type
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {fuelTypes.map((ft) => (
                <button
                  type="button"
                  key={ft.value}
                  onClick={() => setFuelType(ft.value)}
                  className={cn(
                    'flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center',
                    fuelType === ft.value
                      ? 'bg-[#e3ece6] border-[#315e52] text-[#315e52]'
                      : 'bg-white border-[#dde4dd] text-slate-500 hover:border-[#bcc9bf]'
                  )}
                >
                  <span className="text-2xl mb-1">{ft.icon}</span>
                  <span className="text-xs font-semibold">{ft.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Currency (Locked / Default to INR) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Default Currency
            </label>
            <div className="bg-white border border-[#dde4dd] rounded-2xl p-3.5 flex items-center justify-between text-sm">
              <span className="text-[#1b231f] font-medium">Indian Rupee (INR ₹)</span>
              <span className="text-xs bg-[#edf1ec] text-slate-500 px-2.5 py-1 rounded-md">
                Active
              </span>
            </div>
          </div>

          {/* Last-paid fuel price */}
          <div>
            <label
              htmlFor={fuelPriceId}
              className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 cursor-pointer"
            >
              Last-Paid Fuel Price (per liter)
            </label>
            <div className="bg-white border border-[#dde4dd] rounded-2xl p-4 flex items-center gap-3 focus-within:border-[#315e52] transition-colors">
              <span className="text-xl font-bold text-slate-500">₹</span>
              <input
                id={fuelPriceId}
                type="number"
                step="0.1"
                min="1"
                required
                value={fuelPrice}
                onChange={(e) => setFuelPrice(e.target.value)}
                placeholder="Enter fuel price"
                className="w-full bg-transparent text-2xl font-bold text-[#1b231f] outline-none placeholder-slate-400"
              />
              <span className="text-xs text-slate-400 font-medium">/ Liter</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 px-1">
              Pre-fills on each scan so you don&apos;t have to re-type it. Can still be edited anytime.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 bg-[#315e52] hover:bg-[#244a40] active:scale-[0.99] text-white font-semibold rounded-2xl transition-all text-base flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving defaults...
              </span>
            ) : (
              <span>Save & Continue to Paytrol</span>
            )}
          </button>
        </form>
      </div>

      <div className="text-center text-[11px] text-slate-600 pt-6">
        You can update these preferences anytime under Profile Settings.
      </div>
    </div>
  );
}
