'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { Friendship, GuestContact, Trip, TripParticipant } from '@/types';

export default function HistoryPage() {
  const { user } = useAuth();
  const currentUserId = user?.uid || '';
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [distanceDraft, setDistanceDraft] = useState('');
  const [mileageDraft, setMileageDraft] = useState('');
  const [fuelPriceDraft, setFuelPriceDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState(false);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [guestContacts, setGuestContacts] = useState<GuestContact[]>([]);
  const [includeCreatorDraft, setIncludeCreatorDraft] = useState(true);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [quickGuestName, setQuickGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

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

  const openEdit = async (trip: Trip) => {
    setEditingTrip(trip);
    setDistanceDraft(String(trip.distanceKm));
    setMileageDraft(String(trip.avgMileageKmpl));
    setFuelPriceDraft(String(trip.fuelPricePerLiter));
    setEditError(null);
    setIncludeCreatorDraft(trip.participants.some((participant) => participant.uid === currentUserId));
    setSelectedParticipantIds(
      trip.participants
        .filter((participant) => participant.uid !== currentUserId)
        .map((participant) =>
          participant.guestContactId ? `guest:${participant.guestContactId}` : `friend:${participant.uid}`
        )
    );

    try {
      const [friendsRes, guestsRes] = await Promise.all([
        fetch('/api/friends'),
        fetch('/api/guests'),
      ]);
      const [friendsData, guestsData] = await Promise.all([
        friendsRes.json(),
        guestsRes.json(),
      ]);
      if (friendsData.success) {
        setFriends(friendsData.data?.friends || []);
      }
      if (guestsData.success) {
        setGuestContacts(guestsData.data || []);
      }
    } catch (error) {
      console.error('Failed to load split people:', error);
    }
  };

  const closeEdit = () => {
    if (savingEdit) return;
    setConfirmDeleteTrip(false);
    setEditingTrip(null);
    setEditError(null);
  };

  const deleteTrip = async () => {
    if (!editingTrip) return;
    setDeletingTrip(true);
    setEditError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/trips', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: editingTrip.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not delete trip.');
      }
      setTrips((current) => current.filter((trip) => trip.id !== editingTrip.id));
      setEditingTrip(null);
      setConfirmDeleteTrip(false);
      setNotice('Trip deleted and balances adjusted.');
    } catch (error: unknown) {
      setEditError(error instanceof Error ? error.message : 'Could not delete trip.');
    } finally {
      setDeletingTrip(false);
    }
  };

  const toggleParticipant = (key: string) => {
    setSelectedParticipantIds((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  };

  const addQuickGuest = async () => {
    const name = quickGuestName.trim();
    if (!name) return;
    setAddingGuest(true);
    setEditError(null);
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
      setSelectedParticipantIds((current) => [...current, `guest:${guest.id}`]);
      setQuickGuestName('');
    } catch (error: unknown) {
      setEditError(error instanceof Error ? error.message : 'Could not add guest.');
    } finally {
      setAddingGuest(false);
    }
  };

  const saveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTrip) return;

    setSavingEdit(true);
    setEditError(null);
    setNotice(null);

    try {
      const participants: TripParticipant[] = [];
      if (includeCreatorDraft) {
        participants.push({
          uid: currentUserId,
          displayName: user?.name || 'You',
          photoURL: user?.image || null,
          shareAmount: 0,
          customPercentage: null,
          settled: true,
          settledAt: new Date().toISOString(),
        });
      }

      for (const key of selectedParticipantIds) {
        if (key.startsWith('friend:')) {
          const uid = key.slice('friend:'.length);
          const friend = friends.find((item) =>
            item.fromUid === uid || item.toUid === uid
          );
          if (!friend) continue;
          const isFrom = friend.fromUid === uid;
          participants.push({
            uid,
            displayName: isFrom ? friend.fromName : friend.toName || 'Friend',
            photoURL: isFrom ? friend.fromPhoto : friend.toPhoto,
            shareAmount: 0,
            customPercentage: null,
            settled: false,
            settledAt: null,
          });
        } else if (key.startsWith('guest:')) {
          const guestId = key.slice('guest:'.length);
          const guest = guestContacts.find((item) => item.id === guestId);
          if (!guest) continue;
          participants.push({
            uid: guest.linkedUid || guest.guestUid,
            guestContactId: guest.id,
            displayName: guest.name,
            photoURL: null,
            isGuest: !guest.linkedUid,
            shareAmount: 0,
            customPercentage: null,
            settled: false,
            settledAt: null,
          });
        }
      }

      if (participants.length === 0) {
        throw new Error('Include yourself or at least one person.');
      }

      const res = await fetch('/api/trips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: editingTrip.id,
          distanceKm: Number(distanceDraft),
          avgMileageKmpl: Number(mileageDraft),
          fuelPricePerLiter: Number(fuelPriceDraft),
          participants,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not update trip.');
      }

      const updatedTrip = data.data as Trip;
      setTrips((current) =>
        current.map((trip) => trip.id === updatedTrip.id ? updatedTrip : trip)
      );
      setEditingTrip(null);
      setNotice('Trip details updated and balances adjusted.');
    } catch (error: unknown) {
      setEditError(error instanceof Error ? error.message : 'Could not update trip.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-white">Trip History</h1>
        <p className="text-xs text-slate-400 mt-1">
          Every trip logged with attached dashboard photo, math breakdown, and participant shares.
        </p>
      </header>

      {notice && (
        <p role="status" className="text-xs text-[#315e52]">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-slate-900/60 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800 p-12 text-center space-y-2">
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
              className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm"
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
                    <h3 className="text-base font-bold text-white">{trip.distanceKm} km Trip</h3>
                    <p className="text-xs text-slate-400">Logged by {trip.creatorName}</p>
                  </div>
                  <div className="flex items-start gap-2 text-right">
                    <div>
                      <span className="text-lg font-black text-slate-900">{formatCurrency(trip.totalCost)}</span>
                      <span className="text-[10px] text-slate-500 block">{trip.fuelUsedLiters.toFixed(2)} L fuel</span>
                    </div>
{trip.creatorUid === currentUserId && (
                    <button
                      type="button"
                      onClick={() => openEdit(trip)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
                      aria-label={`Edit trip for ${trip.distanceKm} km`}
                      title="Edit trip"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.862 3.487a2.1 2.1 0 013.651 1.434c0 .557-.221 1.091-.614 1.485L8.7 17.605l-4.2.9.9-4.2L16.862 3.487zM15.75 4.5l3.75 3.75"
                        />
                      </svg>
                    </button>
                    )}
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
                          <span className="text-indigo-400 font-bold">{formatCurrency(p.shareAmount)}</span>
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

      {editingTrip && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 px-4 pb-24 sm:items-center sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-trip-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEdit();
          }}
        >
          <form
            onSubmit={saveEdit}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 id="edit-trip-title" className="text-base font-bold text-slate-900">
                  Edit trip
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Updating this trip recalculates its split and balance.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit}
                className="text-xl leading-none text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {editError && (
              <p role="alert" className="mb-3 text-xs text-red-600">
                {editError}
              </p>
            )}

            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Distance driven (km)</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={distanceDraft}
                  onChange={(event) => setDistanceDraft(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Mileage (km/L)</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={mileageDraft}
                  onChange={(event) => setMileageDraft(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Fuel price (₹/L)</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  required
                  value={fuelPriceDraft}
                  onChange={(event) => setFuelPriceDraft(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                />
              </label>
            </div>

            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">People in this split</span>
                <span className="text-[11px] text-slate-500">
                  {(includeCreatorDraft ? 1 : 0) + selectedParticipantIds.length} people
                </span>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={includeCreatorDraft}
                onClick={() => setIncludeCreatorDraft((current) => !current)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <span className="text-xs font-medium text-slate-800">Include me</span>
                <span
                  className={includeCreatorDraft
                    ? 'h-5 w-9 rounded-full bg-[#315e52] p-0.5'
                    : 'h-5 w-9 rounded-full bg-slate-300 p-0.5'}
                >
                  <span
                    className={includeCreatorDraft
                      ? 'block h-4 w-4 translate-x-4 rounded-full bg-white'
                      : 'block h-4 w-4 rounded-full bg-white'}
                  />
                </span>
              </button>

              {friends.map((friend) => {
                const friendUid =
                  friend.fromUid === currentUserId ? friend.toUid : friend.fromUid;
                const friendName =
                  friend.fromUid === currentUserId ? friend.toName : friend.fromName;
                if (!friendUid) return null;
                const key = `friend:${friendUid}`;
                const selected = selectedParticipantIds.includes(key);
                return (
                  <button
                    type="button"
                    key={friend.id}
                    onClick={() => toggleParticipant(key)}
                    aria-pressed={selected}
                    className={selected
                      ? 'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-[#edf2ed] px-3 py-2.5'
                      : 'flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5'}
                  >
                    <span className="text-xs font-medium text-slate-800">{friendName}</span>
                    <span className="text-xs text-slate-500">{selected ? 'Added' : 'Add'}</span>
                  </button>
                );
              })}

              {guestContacts.map((guest) => {
                const key = `guest:${guest.id}`;
                const selected = selectedParticipantIds.includes(key);
                return (
                  <button
                    type="button"
                    key={guest.id}
                    onClick={() => toggleParticipant(key)}
                    aria-pressed={selected}
                    className={selected
                      ? 'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-[#edf2ed] px-3 py-2.5'
                      : 'flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5'}
                  >
                    <span className="text-xs font-medium text-slate-800">{guest.name}</span>
                    <span className="text-xs text-slate-500">{selected ? 'Added' : 'Add'}</span>
                  </button>
                );
              })}

              <div className="flex gap-2">
                <input
                  value={quickGuestName}
                  onChange={(event) => setQuickGuestName(event.target.value)}
                  maxLength={80}
                  placeholder="Add a guest"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400"
                />
                <button
                  type="button"
                  onClick={addQuickGuest}
                  disabled={!quickGuestName.trim() || addingGuest}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-[#315e52] disabled:opacity-50"
                >
                  {addingGuest ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              {confirmDeleteTrip ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTrip(false)}
                    disabled={deletingTrip}
                    className="px-2.5 py-2 text-xs font-semibold text-slate-500"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={deleteTrip}
                    disabled={deletingTrip}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                  >
                    {deletingTrip ? 'Deleting…' : 'Delete now'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTrip(true)}
                  className="px-2.5 py-2 text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Delete trip
                </button>
              )}
              <div className="flex gap-3">
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit}
                className="px-3 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-xl bg-[#315e52] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#244a40] disabled:opacity-50"
              >
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
