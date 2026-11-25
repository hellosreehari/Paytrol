'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { Friendship, GuestContact, Trip, TripParticipant } from '@/types';
import { invalidate, prefetchData, RESOURCES, useCachedData } from '@/lib/data-cache';
import { cleanTripName, rankTripNames, sameTripName, tripDisplayName } from '@/lib/trip-labels';
import TripNameField from '@/components/TripNameField';
import TripWhenField from '@/components/TripWhenField';
import { formatTripWhen, formatTripWhenExact, sortByTripDate, toDayString, tripWhen } from '@/lib/trip-date';
import { CheckIcon, CloseIcon, PencilIcon, TrashIcon, TripsIcon, UsersIcon } from '@/components/icons';
import PersonToggle from '@/components/PersonToggle';
import QuickAddGuest from '@/components/QuickAddGuest';
import { guestSubtitle } from '@/lib/people';
import { BTN, BTN_SIZE } from '@/lib/ui';
import { cn } from '@/lib/utils';

/**
 * The tripDate to send for the When row: the chosen day ('' meaning today),
 * or '' to clear it when that is simply the day the trip was logged.
 */
function tripDateFor(trip: Trip, when: string): string {
  const day = when || toDayString(new Date());
  return day === toDayString(new Date(trip.createdAt)) ? '' : day;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const currentUserId = user?.uid || '';
  const tripsResource = useCachedData<Trip[]>(RESOURCES.trips);
  const trips = tripsResource.data ?? [];
  const loading = tripsResource.loading;
  const setTrips = (update: (current: Trip[]) => Trip[]) =>
    tripsResource.mutate((current) => update(current ?? []));
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [distanceDraft, setDistanceDraft] = useState('');
  const [mileageDraft, setMileageDraft] = useState('');
  const [fuelPriceDraft, setFuelPriceDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState(false);
  const friendsResource = useCachedData<{ friends: Friendship[] }>(RESOURCES.friends);
  const guestsResource = useCachedData<GuestContact[]>(RESOURCES.guests);
  const friends = friendsResource.data?.friends ?? [];
  const guestContacts = guestsResource.data ?? [];
  const setGuestContacts = (update: (current: GuestContact[]) => GuestContact[]) =>
    guestsResource.mutate((current) => update(current ?? []));
  const [includeCreatorDraft, setIncludeCreatorDraft] = useState(true);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [quickGuestName, setQuickGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  // The When row: '' = today, else "YYYY-MM-DD". Kept with its starting value
  // so an untouched date isn't sent back.
  const [whenDraft, setWhenDraft] = useState('');
  const [whenStart, setWhenStart] = useState('');
  // Cards whose date is showing the exact date and time.
  const [exactDates, setExactDates] = useState<Set<string>>(new Set());
  const toggleExact = (id: string) =>
    setExactDates((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [nameFilter, setNameFilter] = useState<string | null>(null);

  // Guests linked to someone who is already a friend are shown once, as the friend.
  const friendUids = new Set(
    friends
      .map((friend) => (friend.fromUid === currentUserId ? friend.toUid : friend.fromUid))
      .filter((uid): uid is string => Boolean(uid))
  );
  const availableGuests = guestContacts.filter((guest) => !guest.linkedUid || !friendUids.has(guest.linkedUid));

  // Names you gave your own trips, offered under the name field when editing.
  const myNames = rankTripNames(trips.filter((trip) => trip.creatorUid === currentUserId));
  // Filter chips for names that cover more than one trip, so a chip always narrows the list.
  const nameCounts = new Map<string, number>();
  for (const trip of trips) {
    const key = tripDisplayName(trip).toLocaleLowerCase();
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const filterNames = rankTripNames(trips.map((trip) => ({ name: tripDisplayName(trip) })))
    .filter((name) => (nameCounts.get(name.toLocaleLowerCase()) ?? 0) > 1 && (nameCounts.get(name.toLocaleLowerCase()) ?? 0) < trips.length)
    .slice(0, 8);
  const activeNameFilter = nameFilter && filterNames.some((name) => sameTripName(name, nameFilter)) ? nameFilter : null;
  // Newest trip first, by when it happened rather than when it was logged.
  const visibleTrips = sortByTripDate(
    activeNameFilter ? trips.filter((trip) => sameTripName(tripDisplayName(trip), activeNameFilter)) : trips
  );

  const openEdit = (trip: Trip) => {
    setEditingTrip(trip);
    setDistanceDraft(String(trip.distanceKm));
    setMileageDraft(String(trip.avgMileageKmpl));
    setFuelPriceDraft(String(trip.fuelPricePerLiter));
    // Older trips may only have tags: they become the name when saved.
    setNameDraft(tripDisplayName(trip));
    const today = toDayString(new Date());
    const startDay = trip.tripDate || toDayString(new Date(trip.createdAt));
    const start = startDay === today ? '' : startDay;
    setWhenDraft(start);
    setWhenStart(start);
    setEditError(null);
    setIncludeCreatorDraft(trip.participants.some((participant) => participant.uid === currentUserId));
    setSelectedParticipantIds(
      trip.participants
        .filter((participant) => participant.uid !== currentUserId)
        .map((participant) =>
          participant.guestContactId ? `guest:${participant.guestContactId}` : `friend:${participant.uid}`
        )
    );

    // Friends and guests are usually cached already; refresh them quietly.
    prefetchData([RESOURCES.friends, RESOURCES.guests]);
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
      invalidate([RESOURCES.balances]);
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
          name: cleanTripName(nameDraft),
          ...(whenDraft !== whenStart ? { tripDate: tripDateFor(editingTrip, whenDraft) } : {}),
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
      invalidate([RESOURCES.balances]);
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
        <h1 className="text-2xl font-black text-ink">Trips</h1>
        <p className="text-xs text-muted mt-1">
          Every trip you’ve logged, with who rode and what they owe.
        </p>
      </header>

      {notice && (
        <p role="status" className="text-xs text-primary">
          {notice}
        </p>
      )}

      {filterNames.length > 0 && (
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Show trips by name">
          {[null, ...filterNames].map((name) => {
            const selected = name === null ? !activeNameFilter : Boolean(activeNameFilter && sameTripName(name, activeNameFilter));
            return (
              <button
                type="button"
                key={name ?? 'all'}
                onClick={() => setNameFilter(name === null || selected ? null : name)}
                aria-pressed={selected}
                className={selected
                  ? 'h-8 max-w-[14rem] shrink-0 truncate rounded-full bg-primary px-3 text-xs font-semibold text-on-primary'
                  : 'h-8 max-w-[14rem] shrink-0 truncate rounded-full border border-line bg-surface px-3 text-xs font-medium text-muted hover:text-ink'}
              >
                {name ?? 'All'}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-surface rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line p-12 text-center space-y-2">
          <p className="text-sm font-semibold text-ink">No trips recorded yet</p>
          <p className="text-xs text-muted max-w-xs mx-auto">
            Scan your car dashboard cluster to log your first trip!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleTrips.map((trip) => {
            const riders = trip.participants ?? [];
            const mine = trip.creatorUid === currentUserId;
            const myShare = riders.find((p) => p.uid === currentUserId)?.shareAmount;
            const firstNames = riders.map((p) => (p.uid === currentUserId ? 'You' : p.displayName.split(' ')[0]));
            return (
              <article key={trip.id} className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
                <div className="flex items-start gap-3">
                  {trip.photoURL ? (
                    <button
                      type="button"
                      onClick={() => setPhotoOpen(trip.photoURL)}
                      aria-label="See the dashboard photo"
                      className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-black"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={trip.photoURL} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <TripsIcon size={22} />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="truncate text-sm font-bold text-ink">
                        {tripDisplayName(trip) || `${trip.distanceKm} km`}
                      </h3>
                      <span className="shrink-0 text-base font-black text-ink tabular-nums">
                        {formatCurrency(trip.totalCost)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                      <span className="min-w-0 truncate">
                        <button
                          type="button"
                          onClick={() => toggleExact(trip.id)}
                          aria-label={exactDates.has(trip.id) ? 'Show how long ago' : `Show the exact date, ${formatTripWhenExact(tripWhen(trip))}`}
                          className="underline decoration-line-strong decoration-dotted underline-offset-[3px] hover:text-ink"
                        >
                          {exactDates.has(trip.id) ? formatTripWhenExact(tripWhen(trip)) : formatTripWhen(tripWhen(trip))}
                        </button>
                        {/* The exact date is long: it takes the whole line while shown. */}
                        {!exactDates.has(trip.id) && (tripDisplayName(trip) ? ` · ${trip.distanceKm} km` : ` · ${trip.avgMileageKmpl} km/L`)}
                      </span>
                      {myShare !== undefined && riders.length > 1 && (
                        <span className="shrink-0">
                          {mine ? 'You paid' : `Your share ${formatCurrency(myShare)}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex min-h-9 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                    <UsersIcon size={14} className="mr-1 -mt-0.5 text-muted" />
                    {firstNames.join(', ')}
                  </p>
                  {/* Same corner on every card: Edit on your trips, who logged it on others'. */}
                  {mine ? (
                    <button
                      type="button"
                      onClick={() => openEdit(trip)}
                      className="-my-2 inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:text-ink"
                      aria-label={`Edit trip ${tripDisplayName(trip) || `for ${trip.distanceKm} km`}`}
                    >
                      <PencilIcon size={14} />
                      Edit
                    </button>
                  ) : (
                    <span className="shrink-0 px-2 text-xs text-muted">by {trip.creatorName.split(' ')[0]}</span>
                  )}
                </div>

              </article>
            );
          })}
        </div>
      )}

      {photoOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard photo"
          onClick={() => setPhotoOpen(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoOpen} alt="Dashboard photo" className="max-h-full max-w-full rounded-xl object-contain" />
          <button
            type="button"
            aria-label="Close photo"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <CloseIcon size={20} />
          </button>
        </div>
      )}

      {editingTrip && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-surface/90 px-4 pb-24 sm:items-center sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-trip-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEdit();
          }}
        >
          <form
            onSubmit={saveEdit}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 id="edit-trip-title" className="text-base font-bold text-ink">
                  Edit trip
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Updating this trip recalculates its split and balance.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit}
                className="text-xl leading-none text-muted hover:text-ink-soft"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {editError && (
              <p role="alert" className="mb-3 text-xs text-danger">
                {editError}
              </p>
            )}

            <TripNameField value={nameDraft} onChange={setNameDraft} names={myNames} className="mb-4" />
            <TripWhenField value={whenDraft} onChange={setWhenDraft} className="mb-4 border-b border-line pb-4" />

            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">Distance driven (km)</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={distanceDraft}
                  onChange={(event) => setDistanceDraft(event.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-line-strong"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">Mileage (km/L)</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={mileageDraft}
                  onChange={(event) => setMileageDraft(event.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-line-strong"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">Fuel price (₹/L)</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  required
                  value={fuelPriceDraft}
                  onChange={(event) => setFuelPriceDraft(event.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-line-strong"
                />
              </label>
            </div>


            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-soft">People in this split</span>
                <span className="text-[11px] text-muted">
                  {(includeCreatorDraft ? 1 : 0) + selectedParticipantIds.length} people
                </span>
              </div>

              <PersonToggle
                name="You"
                photo={user?.image}
                selected={includeCreatorDraft}
                onToggle={() => setIncludeCreatorDraft((current) => !current)}
              />

              {friends.length > 0 && (
                <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Friends</p>
              )}
              {friends.map((friend) => {
                const isFrom = friend.fromUid === currentUserId;
                const friendUid = isFrom ? friend.toUid : friend.fromUid;
                if (!friendUid) return null;
                const key = `friend:${friendUid}`;
                return (
                  <PersonToggle
                    key={friend.id}
                    name={(isFrom ? friend.toName : friend.fromName) || 'Friend'}
                    subtitle={isFrom ? friend.toEmail : friend.fromEmail}
                    photo={isFrom ? friend.toPhoto : friend.fromPhoto}
                    verified
                    selected={selectedParticipantIds.includes(key)}
                    onToggle={() => toggleParticipant(key)}
                  />
                );
              })}

              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Guests{availableGuests.length > 0 ? ` (${availableGuests.length})` : ''}
              </p>
              {availableGuests.length === 0 && (
                <p className="text-[11px] text-muted">No guests yet. Add one below.</p>
              )}
              {availableGuests.map((guest) => {
                const key = `guest:${guest.id}`;
                return (
                  <PersonToggle
                    key={guest.id}
                    name={guest.name}
                    subtitle={guestSubtitle(guest)}
                    verified={Boolean(guest.linkedUid)}
                    selected={selectedParticipantIds.includes(key)}
                    onToggle={() => toggleParticipant(key)}
                  />
                );
              })}

              <QuickAddGuest
                value={quickGuestName}
                onChange={setQuickGuestName}
                onAdd={addQuickGuest}
                adding={addingGuest}
              />
            </div>

            <div className="mt-5 border-t border-line pt-4">
              {confirmDeleteTrip ? (
                <div className="space-y-2.5 rounded-2xl border border-danger-line bg-danger-soft p-3">
                  <p className="text-xs font-medium text-ink">
                    Delete this trip? Everyone&apos;s balance is adjusted to remove it.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTrip(false)}
                      disabled={deletingTrip}
                      className={cn(BTN.secondary, BTN_SIZE.md, 'w-full')}
                    >
                      Keep trip
                    </button>
                    <button
                      type="button"
                      onClick={deleteTrip}
                      disabled={deletingTrip}
                      className={cn(BTN.danger, BTN_SIZE.md, 'w-full')}
                    >
                      {deletingTrip ? 'Deleting…' : 'Delete trip'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTrip(true)}
                  disabled={savingEdit}
                  className="inline-flex h-11 items-center gap-1.5 text-sm font-semibold text-danger hover:underline disabled:opacity-50"
                >
                  <TrashIcon size={16} />
                  Delete trip
                </button>
              )}
            </div>

            <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 border-t border-line bg-surface px-5 py-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={savingEdit}
                  className={cn(BTN.secondary, BTN_SIZE.md, 'w-full')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || deletingTrip || confirmDeleteTrip}
                  className={cn(BTN.primary, BTN_SIZE.md, 'w-full')}
                >
                  <CheckIcon size={16} />
                  {savingEdit ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
