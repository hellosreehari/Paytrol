'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { useTripStore } from '@/stores/tripStore';
import type { Trip } from '@/types';
import { tripDisplayName } from '@/lib/trip-labels';
import { CheckIcon, ShareIcon } from '@/components/icons';

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
    const shareLines = trip.participants.map((participant) => {
      const status = participant.uid === trip.creatorUid ? ' (paid for fuel)' : '';
      return `• ${participant.displayName}: ${formatCurrency(participant.shareAmount)}${status}`;
    });
    const shareText = [
      tripDisplayName(trip) ? `Paytrol trip: ${tripDisplayName(trip)}` : 'Paytrol trip breakdown',
      `Distance: ${trip.distanceKm} km`,
      `Avg Mileage: ${trip.avgMileageKmpl} km/L`,
      `Fuel Used: ${trip.fuelUsedLiters.toFixed(3)} L`,
      `Total Cost: ${formatCurrency(trip.totalCost)}`,
      `Split between ${trip.participants.length} ${trip.participants.length === 1 ? 'person' : 'people'}:`,
      ...shareLines,
    ].join('\n');

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
        <p className="text-muted text-sm">No recent trip data found.</p>
        <button
          onClick={() => router.push('/home')}
          className="text-xs text-primary font-semibold"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pt-2">
        <div className="w-14 h-14 rounded-2xl bg-surface-soft border border-line text-primary flex items-center justify-center mx-auto">
          <CheckIcon size={28} strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-black text-ink">Trip Logged &amp; Split!</h1>
        <p className="text-xs text-muted">
          Trip card generated with photo proof &amp; automatic ledger balances.
        </p>
      </div>

      <div className="rounded-3xl bg-surface border border-line overflow-hidden shadow-2xl">
        {trip.photoURL && (
          <div className="relative aspect-[16/9] bg-black">
            <img
              src={trip.photoURL}
              alt="Cluster proof"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-surface backdrop-blur-md border border-line text-[10px] font-semibold text-ink-soft flex items-center gap-1.5">
              <span>●</span>
              <span>Cluster Photo Proof Attached</span>
            </div>
          </div>
        )}

        <div className="p-5 space-y-4">
          {tripDisplayName(trip) && (
            <h2 className="text-lg font-bold text-ink break-words">{tripDisplayName(trip)}</h2>
          )}
          <div className="flex items-baseline justify-between border-b border-line pb-3">
            <div>
              <span className="text-xs text-muted block">Total Fuel Cost</span>
              <span className="text-2xl font-black text-primary">
                {formatCurrency(trip.totalCost)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted block">Fuel Consumed</span>
              <span className="text-sm font-bold text-ink">
                {trip.fuelUsedLiters.toFixed(3)} L
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-surface-soft p-3 rounded-2xl border border-line text-center text-xs">
            <div>
              <span className="text-[10px] text-muted block">Distance</span>
              <span className="font-bold text-ink">{trip.distanceKm} km</span>
            </div>
            <div>
              <span className="text-[10px] text-muted block">Mileage</span>
              <span className="font-bold text-ink">{trip.avgMileageKmpl} km/L</span>
            </div>
            <div>
              <span className="text-[10px] text-muted block">Rate</span>
              <span className="font-bold text-ink">₹{trip.fuelPricePerLiter}/L</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted">
              <span className="font-semibold uppercase tracking-wider">
                Split Ledger ({trip.participants.length} riders)
              </span>
              <span>{trip.splitMode === 'equal' ? 'Equal Split' : 'Custom'}</span>
            </div>

            <div className="space-y-2">
              {trip.participants.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-soft border border-line"
                >
                  <div className="flex items-center gap-2.5">
                    {p.photoURL ? (
                      <img src={p.photoURL} alt="" className="w-7 h-7 rounded-full border border-line" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-surface-sunken text-xs font-bold flex items-center justify-center text-ink-soft">
                        {p.displayName?.[0] || 'U'}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-ink">{p.displayName}</p>
                      <p className="text-[10px] text-muted">
                        {p.isGuest ? 'Guest · tracked by name' : p.settled ? 'Paid (Driver)' : 'Owes driver'}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-primary">
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
          className="w-full py-3.5 bg-surface-soft hover:bg-surface-sunken text-ink font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 border border-line"
        >
          <ShareIcon size={16} className="text-primary" />
          {copied && <CheckIcon size={16} strokeWidth={2.2} />}
            <span>{copied ? 'Copied breakdown' : 'Share Trip Breakdown'}</span>
        </button>

        <button
          onClick={handleDone}
          className="w-full py-4 bg-primary hover:bg-primary-hover active:scale-[0.99] text-on-primary font-semibold rounded-2xl transition-all text-sm"
        >
          Done (Go to Dashboard)
        </button>
      </div>
    </div>
  );
}
