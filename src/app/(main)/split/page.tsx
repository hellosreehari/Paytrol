'use client';

import { useState, useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, cn } from '@/lib/utils';
import type { Friendship, GuestContact, TripParticipant } from '@/types';

interface VerifiedTripData {
  distanceKm: number;
  avgMileageKmpl: number;
  fuelPricePerLiter: number;
  fuelUsedLiters: number;
  totalCost: number;
}

function isVerifiedTripData(value: unknown): value is VerifiedTripData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return ['distanceKm', 'avgMileageKmpl', 'fuelPricePerLiter', 'fuelUsedLiters', 'totalCost'].every(
    (key) => typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] > 0
  );
}

export default function SplitPage() {
  const router = useRouter();
  const { user } = useAuth();
  const guestNameInputId = useId();

  const [verifiedData, setVerifiedData] = useState<VerifiedTripData | null>(null);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [guestContacts, setGuestContacts] = useState<GuestContact[]>([]);
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [guestName, setGuestName] = useState('');
  const [includeMe, setIncludeMe] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('paytrol_verified_v2');
    sessionStorage.removeItem('paytrol_verified');
    if (!raw) {
      router.replace('/capture');
      return;
    }
    try {
      const data: unknown = JSON.parse(raw);
      if (!isVerifiedTripData(data)) throw new Error('Invalid verified trip data');
      setVerifiedData(data);
    } catch {
      sessionStorage.removeItem('paytrol_verified_v2');
      router.replace('/capture');
      return;
    }

    // Load friends from API
    async function loadFriends() {
      try {
        const [friendsRes, guestsRes] = await Promise.all([
          fetch('/api/friends'),
          fetch('/api/guests'),
        ]);
        const [friendsData, guestsData] = await Promise.all([
          friendsRes.json(),
          guestsRes.json(),
        ]);
        if (friendsData.success && friendsData.data) {
          const accepted = friendsData.data.friends || [];
          setFriends(accepted);
          // If friends exist, auto-select the first one by default for immediate convenience
          if (accepted.length > 0) {
            const firstFriend = accepted[0];
            const uid = user?.uid || '';
            const fUid = firstFriend.fromUid === uid ? firstFriend.toUid : firstFriend.fromUid;
            if (fUid) setSelectedFriends([fUid]);
          }
        }
        if (guestsData.success && guestsData.data) setGuestContacts(guestsData.data);
      } catch (err) {
        console.error('Failed to load friends:', err);
      }
    }
    loadFriends();
  }, [router, user]);

  const currentUserId = user?.uid || '';
  const friendUserIds = new Set(
    friends
      .map((friend) => friend.fromUid === currentUserId ? friend.toUid : friend.fromUid)
      .filter((uid): uid is string => Boolean(uid))
  );
  const selectableGuestContacts = guestContacts.filter(
    (guest) => !guest.linkedUid || !friendUserIds.has(guest.linkedUid)
  );

  // Toggle friend selection
  const handleToggleFriend = (friendUid: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendUid) ? prev.filter((id) => id !== friendUid) : [...prev, friendUid]
    );
  };

  const participantKeys = [
    ...(includeMe ? [currentUserId] : []),
    ...selectedFriends,
    ...selectedGuests.map((guestId) => `guest:${guestId}`),
  ];
  const participantCount = participantKeys.length;
  const totalCost = verifiedData?.totalCost || 0;
  if (!verifiedData) return null;

  const getParticipantShare = (participantKey: string): number => {
    if (participantCount <= 0 || totalCost <= 0) return 0;
    const totalCents = Math.round(totalCost * 100);
    const baseCents = Math.floor(totalCents / participantCount);
    const remainingCents = totalCents % participantCount;
    const participantIndex = participantKeys.indexOf(participantKey);
    return (baseCents + (participantIndex >= 0 && participantIndex < remainingCents ? 1 : 0)) / 100;
  };

  const handleAddGuest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = guestName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (guestContacts.some((guest) => guest.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setErrorMsg('A guest with that name is already in this split.');
      return;
    }

    try {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not add guest.');
      }
      const guest = data.data as GuestContact;
      setGuestContacts((current) => [guest, ...current]);
      setSelectedGuests((current) => [...current, guest.id]);
      setGuestName('');
      setErrorMsg(null);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not add guest.');
    }
  };

  const handleToggleGuest = (guestId: string) => {
    setSelectedGuests((current) =>
      current.includes(guestId)
        ? current.filter((id) => id !== guestId)
        : [...current, guestId]
    );
  };

  const handleSaveTrip = async () => {
    if (!verifiedData) return;
    if (participantCount === 0) {
      setErrorMsg('Include yourself or select at least one friend.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const photoURL = sessionStorage.getItem('paytrol_photoURL') || '';

    // Build participants array
    const participantsList: TripParticipant[] = [];

    // Current user if included
    if (includeMe) {
      participantsList.push({
        uid: currentUserId,
        displayName: user?.name || 'You (Driver)',
        photoURL: user?.image || null,
        shareAmount: getParticipantShare(currentUserId),
        customPercentage: null,
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
        customPercentage: null,
        settled: false,
        settledAt: null,
      });
    }

    for (const guestId of selectedGuests) {
      const guest = guestContacts.find((contact) => contact.id === guestId);
      if (!guest) continue;
      participantsList.push({
        uid: guest.linkedUid || guest.guestUid,
        guestContactId: guest.id,
        displayName: guest.name,
        photoURL: null,
        isGuest: !guest.linkedUid,
        shareAmount: getParticipantShare(`guest:${guest.id}`),
        customPercentage: null,
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
          splitMode: 'equal',
          participants: participantsList,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save trip');
      }

      sessionStorage.setItem('paytrol_tripResult', JSON.stringify(data.data));
      router.push('/result');
    } catch (err: unknown) {
      console.error('Trip save error:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create trip ledger');
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
          Total: <strong className="text-slate-900 font-bold">{formatCurrency(totalCost)}</strong> ({verifiedData?.fuelUsedLiters} L fuel @ ₹{verifiedData?.fuelPricePerLiter}/L)
        </p>
      </header>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user?.image ? (
            <img src={user.image} alt="" className="w-10 h-10 rounded-full border border-slate-200" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
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
          role="switch"
          aria-checked={includeMe}
          aria-label="Include me in the split"
          className={cn(
            'w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out relative',
            includeMe ? 'bg-[#315e52]' : 'bg-slate-300'
          )}
        >
          <div
            className={cn(
              'w-5 h-5 rounded-full bg-white transform transition-transform duration-200 ease-in-out',
              includeMe ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">Equal split</span>
        <span className="text-xs font-bold text-slate-900">
          {participantCount > 0 ? `1 / ${participantCount}` : '0'}
        </span>
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
            className="text-xs text-[#315e52] hover:text-[#244a40] font-semibold"
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
              className="text-xs px-3.5 py-1.5 rounded-lg bg-slate-50 text-[#315e52] border border-slate-200 font-semibold"
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
                      ? 'bg-[#edf2ed] border-slate-300'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleFriend(fUid)}
                      className="flex items-center gap-3 flex-1 text-left"
                      aria-pressed={isSelected}
                    >
                      <div
                        className={cn(
                          'w-6 h-6 rounded-lg border flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-[#315e52] border-[#315e52] text-white'
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
                        <span className="text-sm font-bold text-[#315e52]">
                          {formatCurrency(getParticipantShare(fUid))}
                        </span>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Add someone without the app
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            We’ll include their share and track it by name for manual settlement.
          </p>
        </div>
        <form onSubmit={handleAddGuest} className="flex gap-2">
          <label htmlFor={guestNameInputId} className="sr-only">Guest name</label>
          <input
            id={guestNameInputId}
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            placeholder="Enter a name"
            maxLength={80}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!guestName.trim()}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-[#315e52] transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add guest
          </button>
        </form>
        {selectableGuestContacts.length > 0 && (
          <div className="space-y-2">
            {selectableGuestContacts.map((guest) => {
              const isSelected = selectedGuests.includes(guest.id);
              return (
                <div
                  key={guest.id}
                  className={cn(
                    'flex items-center justify-between rounded-2xl border p-3.5 transition-colors',
                    isSelected
                      ? 'border-slate-300 bg-[#edf2ed]'
                      : 'border-slate-800 bg-slate-900/60'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleGuest(guest.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-pressed={isSelected}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border',
                        isSelected
                          ? 'border-[#315e52] bg-[#315e52] text-white'
                          : 'border-slate-700 bg-slate-800'
                      )}
                    >
                      {isSelected && <span aria-hidden="true">✓</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                        {guest.name[0]?.toUpperCase()}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{guest.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {guest.linkedUid ? 'Account linked' : guest.email || 'Guest · no account needed'}
                      </span>
                    </span>
                  </button>
                  <div className="ml-3 flex shrink-0 items-center gap-3">
                    {isSelected && (
                      <span className="text-sm font-bold text-[#315e52]">
                        {formatCurrency(getParticipantShare(`guest:${guest.id}`))}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => router.push('/friends')}
                      aria-label={`Edit ${guest.name}`}
                      className="rounded-lg px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Summary card */}
      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Active Participants:</span>
          <span className="text-white font-semibold">{participantCount} person(s)</span>
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>Total Fuel Bill:</span>
          <span className="text-white font-semibold">{formatCurrency(totalCost)}</span>
        </div>
        <div className="border-t border-slate-800 pt-2 flex justify-between items-baseline">
          <span className="text-xs font-semibold text-slate-600">Typical share:</span>
          <span className="text-xl font-black text-slate-900">
            {participantCount > 0 ? formatCurrency(totalCost / participantCount) : formatCurrency(0)}
          </span>
        </div>
      </div>

      {/* Submit / Save Button */}
      <button
        type="button"
        onClick={handleSaveTrip}
        disabled={participantCount === 0 || saving}
        className="w-full py-4 bg-[#315e52] hover:bg-[#244a40] active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-500 text-white font-semibold rounded-2xl transition-all text-base flex items-center justify-center gap-2"
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
