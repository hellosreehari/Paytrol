'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, cn } from '@/lib/utils';
import type { Friendship } from '@/types';

interface VerifiedTripData {
  distanceKm: number;
  avgMileageKmpl: number;
  fuelPricePerLiter: number;
  fuelUsedLiters: number;
  totalCost: number;
}

export default function SplitPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [verifiedData, setVerifiedData] = useState<VerifiedTripData | null>(null);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [includeMe, setIncludeMe] = useState(true);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [customPercents, setCustomPercents] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('paytrol_verified');
    if (raw) {
      setVerifiedData(JSON.parse(raw));
    } else {
      // Default to the 6 km @ 5.8 km/l @ ₹105 sample if accessed directly
      const fallbackData: VerifiedTripData = {
        distanceKm: 6.0,
        avgMileageKmpl: 5.8,
        fuelPricePerLiter: 105.0,
        fuelUsedLiters: 1.034,
        totalCost: 108.62,
      };
      setVerifiedData(fallbackData);
      sessionStorage.setItem('paytrol_verified', JSON.stringify(fallbackData));
    }

    // Load friends from API
    async function loadFriends() {
      try {
        const res = await fetch('/api/friends');
        const data = await res.json();
        if (data.success && data.data) {
          const accepted = data.data.friends || [];
          setFriends(accepted);
          // If friends exist, auto-select the first one by default for immediate convenience
          if (accepted.length > 0) {
            const firstFriend = accepted[0];
            const uid = (user as any)?.uid || 'demo-user';
            const fUid = firstFriend.fromUid === uid ? firstFriend.toUid : firstFriend.fromUid;
            if (fUid) setSelectedFriends([fUid]);
          }
        }
      } catch (err) {
        console.error('Failed to load friends:', err);
      }
    }
    loadFriends();
  }, [user]);

  const currentUserId = (user as any)?.uid || 'demo-user';

  // Toggle friend selection
  const handleToggleFriend = (friendUid: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendUid) ? prev.filter((id) => id !== friendUid) : [...prev, friendUid]
    );
  };

  // Calculate participant count
  const allParticipantUids: string[] = [];
  if (includeMe) allParticipantUids.push(currentUserId);
  allParticipantUids.push(...selectedFriends);

  const participantCount = allParticipantUids.length;
  const totalCost = verifiedData?.totalCost || 0;

  // Compute shares based on mode
  const getParticipantShare = (uid: string): number => {
    if (participantCount <= 0 || totalCost <= 0) return 0;

    if (splitMode === 'equal') {
      return Math.round((totalCost / participantCount) * 100) / 100;
    } else {
      // Custom percentage mode
      const pct = customPercents[uid] ?? Math.round(100 / participantCount);
      return Math.round((totalCost * (pct / 100)) * 100) / 100;
    }
  };

  const handleCustomPercentChange = (uid: string, value: number) => {
    setCustomPercents((prev) => ({
      ...prev,
      [uid]: value,
    }));
  };

  const handleSaveTrip = async () => {
    if (!verifiedData) return;
    setSaving(true);
    setErrorMsg(null);

    const photoURL = sessionStorage.getItem('paytrol_photoURL') || '/sample-cluster.jpg';

    // Build participants array
    const participantsList: any[] = [];

    // Current user if included
    if (includeMe) {
      participantsList.push({
        uid: currentUserId,
        displayName: user?.name || 'You (Driver)',
        photoURL: user?.image || null,
        shareAmount: getParticipantShare(currentUserId),
        customPercentage: splitMode === 'custom' ? (customPercents[currentUserId] ?? 0) : null,
        settled: true, // creator is already settled
        settledAt: new Date().toISOString(),
      });
    }

    // Selected friends
    for (const fUid of selectedFriends) {
      const match = friends.find((f) => f.fromUid === fUid || f.toUid === fUid);
      const isFrom = match?.fromUid === fUid;
      const fName = isFrom ? match?.fromName : match?.toName;
      const fPhoto = isFrom ? match?.fromPhoto : match?.toPhoto;

      participantsList.push({
        uid: fUid,
        displayName: fName || 'Friend',
        photoURL: fPhoto || null,
        shareAmount: getParticipantShare(fUid),
        customPercentage: splitMode === 'custom' ? (customPercents[fUid] ?? 0) : null,
        settled: false,
        settledAt: null,
      });
    }

    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoURL,
          distanceKm: verifiedData.distanceKm,
          avgMileageKmpl: verifiedData.avgMileageKmpl,
          fuelPricePerLiter: verifiedData.fuelPricePerLiter,
          fuelUsedLiters: verifiedData.fuelUsedLiters,
          totalCost: verifiedData.totalCost,
          splitMode,
          participants: participantsList,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save trip');
      }

      sessionStorage.setItem('paytrol_tripResult', JSON.stringify(data.data));
      router.push('/result');
    } catch (err: any) {
      console.error('Trip save error:', err);
      setErrorMsg(err.message || 'Failed to create trip ledger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/verify')}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            ←
          </button>
          <h1 className="text-2xl font-black text-white">Trip Splitting</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Total: <strong className="text-indigo-400 font-bold">{formatCurrency(totalCost)}</strong> ({verifiedData?.fuelUsedLiters} L fuel @ ₹{verifiedData?.fuelPricePerLiter}/L)
        </p>
      </header>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Driver self-inclusion toggle */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user?.image ? (
            <img src={user.image} alt="" className="w-10 h-10 rounded-full border border-indigo-500/40" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold">
              {user?.name?.[0] || 'Y'}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-white">Include me in the split</p>
            <p className="text-xs text-slate-400">Driver share included in calculation</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIncludeMe(!includeMe)}
          className={cn(
            'w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out relative',
            includeMe ? 'bg-indigo-600' : 'bg-slate-700'
          )}
        >
          <div
            className={cn(
              'w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out',
              includeMe ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      {/* Split Mode Selector (Equal vs Custom) */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
          Split Mode
        </label>
        <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-1 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setSplitMode('equal')}
            className={cn(
              'py-2.5 rounded-xl text-xs font-bold transition-all',
              splitMode === 'equal'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Equal Split ({participantCount > 0 ? `1/${participantCount}` : '0'})
          </button>
          <button
            type="button"
            onClick={() => setSplitMode('custom')}
            className={cn(
              'py-2.5 rounded-xl text-xs font-bold transition-all',
              splitMode === 'custom'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Custom / Percentage %
          </button>
        </div>
      </div>

      {/* Friends checklist */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Select Riders / Friends
          </label>
          <button
            type="button"
            onClick={() => router.push('/friends')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            + Invite Friends
          </button>
        </div>

        {friends.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center space-y-2">
            <p className="text-xs text-slate-400">
              No friends connected yet. You can invite friends via email or save this as a solo trip.
            </p>
            <button
              type="button"
              onClick={() => router.push('/friends')}
              className="text-xs px-3.5 py-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-semibold"
            >
              Add Friend by Email →
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {friends.map((friend) => {
              const fUid =
                friend.fromUid === currentUserId ? friend.toUid : friend.fromUid;
              const fName =
                friend.fromUid === currentUserId ? friend.toName : friend.fromName;
              const fPhoto =
                friend.fromUid === currentUserId ? friend.toPhoto : friend.fromPhoto;
              const isSelected = fUid ? selectedFriends.includes(fUid) : false;

              if (!fUid) return null;

              return (
                <div
                  key={friend.id}
                  className={cn(
                    'p-3.5 rounded-2xl border transition-all duration-150',
                    isSelected
                      ? 'bg-indigo-950/30 border-indigo-500/60 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleFriend(fUid)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <div
                        className={cn(
                          'w-6 h-6 rounded-lg border flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-indigo-600 border-indigo-400 text-white'
                            : 'border-slate-700 bg-slate-800'
                        )}
                      >
                        {isSelected && (
                          <svg className="w-3.5 h-3.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>

                      {fPhoto ? (
                        <img src={fPhoto} alt="" className="w-8 h-8 rounded-full border border-slate-700" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                          {fName?.[0] || 'F'}
                        </div>
                      )}

                      <div>
                        <p className="text-sm font-semibold text-white">{fName}</p>
                        <p className="text-[11px] text-slate-500">{friend.toEmail}</p>
                      </div>
                    </button>

                    {isSelected && (
                      <div className="text-right">
                        <span className="text-sm font-bold text-indigo-400">
                          {formatCurrency(getParticipantShare(fUid))}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* If custom split mode and selected, show percentage slider */}
                  {isSelected && splitMode === 'custom' && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-3">
                      <span className="text-[11px] text-slate-400">Share %:</span>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="5"
                        value={customPercents[fUid] ?? Math.round(100 / participantCount)}
                        onChange={(e) => handleCustomPercentChange(fUid, Number(e.target.value))}
                        className="flex-1 accent-indigo-500"
                      />
                      <span className="text-xs font-mono font-bold text-white w-10 text-right">
                        {customPercents[fUid] ?? Math.round(100 / participantCount)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary card */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-indigo-950/30 border border-indigo-500/20 p-4 space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Active Participants:</span>
          <span className="text-white font-semibold">{participantCount} person(s)</span>
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>Total Fuel Bill:</span>
          <span className="text-white font-semibold">{formatCurrency(totalCost)}</span>
        </div>
        <div className="border-t border-slate-800 pt-2 flex justify-between items-baseline">
          <span className="text-xs font-semibold text-indigo-300">Each Person Pays:</span>
          <span className="text-xl font-black text-indigo-400">
            {participantCount > 0 ? formatCurrency(totalCost / participantCount) : formatCurrency(0)}
          </span>
        </div>
      </div>

      {/* Submit / Save Button */}
      <button
        type="button"
        onClick={handleSaveTrip}
        disabled={participantCount === 0 || saving}
        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-indigo-600/30 text-base flex items-center justify-center gap-2"
      >
        {saving ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Posting to ledger...
          </span>
        ) : (
          <span>{participantCount > 1 ? 'Split & Save Trip' : 'Save as Solo Trip'}</span>
        )}
      </button>
    </div>
  );
}
