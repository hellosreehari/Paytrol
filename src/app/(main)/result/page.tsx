'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { useTripStore } from '@/stores/tripStore';
import type { Trip } from '@/types';

export default function ResultPage() {
  const router = useRouter();
  const reset = useTripStore((s) => s.reset);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('paytrol_tripResult');
    if (raw) {
      setTrip(JSON.parse(raw));
    }
  }, []);

  const handleShare = async () => {
    if (!trip) return;
    const shareText = `🚗 Paytrol Trip Breakdown:\nDistance: ${trip.distanceKm} km\nAvg Mileage: ${trip.avgMileageKmpl} km/L\nFuel Used: ${trip.fuelUsedLiters.toFixed(3)} L\nTotal Cost: ${formatCurrency(trip.totalCost)}\nSplit: ${trip.participants.length} people (${formatCurrency(trip.participants[0]?.shareAmount || 0)} each).`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Paytrol Trip Bill',
          text: shareText,
        });
      } catch {
        // Share cancelled
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDone = () => {
    sessionStorage.removeItem('paytrol_verified');
    sessionStorage.removeItem('paytrol_verified_v2');
    sessionStorage.removeItem('paytrol_photoURL');
    sessionStorage.removeItem('paytrol_tripResult');
    sessionStorage.removeItem('paytrol_manualEntry');
    reset();
    router.push('/home');
  };

  if (!trip) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-slate-400 text-sm">No recent trip data found.</p>
        <button
          onClick={() => router.push('/home')}
          className="text-xs text-indigo-400 font-semibold"
        >
          Return to Dashboard →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pt-2">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center text-2xl mx-auto">
          ✓
        </div>
        <h1 className="text-2xl font-black text-white">Trip Logged &amp; Split!</h1>
        <p className="text-xs text-slate-400">
          Trip card generated with photo proof &amp; automatic ledger balances.
        </p>
      </div>

      <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
        {trip.photoURL && (
          <div className="relative aspect-[16/9] bg-black">
            <img
              src={trip.photoURL}
              alt="Cluster proof"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md border border-slate-200 text-[10px] font-semibold text-slate-700 flex items-center gap-1.5">
              <span>●</span>
              <span>Cluster Photo Proof Attached</span>
            </div>
          </div>
        )}

        <div className="p-5 space-y-4">
          <div className="flex items-baseline justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="text-xs text-slate-400 block">Total Fuel Cost</span>
              <span className="text-2xl font-black text-indigo-400">
                {formatCurrency(trip.totalCost)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Fuel Consumed</span>
              <span className="text-sm font-bold text-white">
                {trip.fuelUsedLiters.toFixed(3)} L
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-slate-800/40 p-3 rounded-2xl border border-slate-800 text-center text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block">Distance</span>
              <span className="font-bold text-white">{trip.distanceKm} km</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Mileage</span>
              <span className="font-bold text-white">{trip.avgMileageKmpl} km/L</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Rate</span>
              <span className="font-bold text-white">₹{trip.fuelPricePerLiter}/L</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">
                Split Ledger ({trip.participants.length} riders)
              </span>
              <span>{trip.splitMode === 'equal' ? 'Equal Split' : 'Custom'}</span>
            </div>

            <div className="space-y-2">
              {trip.participants.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/30 border border-slate-800/80"
                >
                  <div className="flex items-center gap-2.5">
                    {p.photoURL ? (
                      <img src={p.photoURL} alt="" className="w-7 h-7 rounded-full border border-slate-700" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-700 text-xs font-bold flex items-center justify-center text-slate-300">
                        {p.displayName?.[0] || 'U'}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-white">{p.displayName}</p>
                      <p className="text-[10px] text-slate-400">
                        {p.isGuest ? 'Guest · tracked by name' : p.settled ? 'Paid (Driver)' : 'Owes driver'}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-indigo-400">
                    {formatCurrency(p.shareAmount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={handleShare}
          className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 border border-slate-700"
        >
          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span>{copied ? '✓ Copied breakdown!' : 'Share Trip Breakdown'}</span>
        </button>

        <button
          onClick={handleDone}
          className="w-full py-4 bg-[#315e52] hover:bg-[#244a40] active:scale-[0.99] text-white font-semibold rounded-2xl transition-all text-sm"
        >
          Done (Go to Dashboard)
        </button>
      </div>
    </div>
  );
}
