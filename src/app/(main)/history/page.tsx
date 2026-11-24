'use client';

import { useState } from 'react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { Friendship, GuestContact, Trip, TripParticipant } from '@/types';
import { invalidate, prefetchData, RESOURCES, useCachedData } from '@/lib/data-cache';
import { cleanTripName, collectTripTags, tripHasTag } from '@/lib/trip-labels';
import TripLabelsFields from '@/components/TripLabelsFields';
import { CheckIcon, TrashIcon, UserPlusIcon, VerifiedIcon } from '@/components/icons';
import { BTN, BTN_SIZE } from '@/lib/ui';
import { cn } from '@/lib/utils';

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
  const [tagsDraft, setTagsDraft] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Guests linked to someone who is already a friend are shown once, as the friend.
  const friendUids = new Set(
    friends
      .map((friend) => (friend.fromUid === currentUserId ? friend.toUid : friend.fromUid))
      .filter((uid): uid is string => Boolean(uid))
  );
  const availableGuests = guestContacts.filter((guest) => !guest.linkedUid || !friendUids.has(guest.linkedUid));

  const allTags = collectTripTags(trips);
  const activeTagFilter = tagFilter && allTags.some((tag) => tag.toLocaleLowerCase() === tagFilter.toLocaleLowerCase())
    ? tagFilter
    : null;
  const visibleTrips = activeTagFilter ? trips.filter((trip) => tripHasTag(trip, activeTagFilter)) : trips;

  const openEdit = (trip: Trip) => {
    setEditingTrip(trip);
    setDistanceDraft(String(trip.distanceKm));
    setMileageDraft(String(trip.avgMileageKmpl));
    setFuelPriceDraft(String(trip.fuelPricePerLiter));
    setNameDraft(trip.name ?? '');
    setTagsDraft(trip.tags ?? []);
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
          tags: tagsDraft,
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
        <h1 className="text-2xl font-black text-ink">Trip History</h1>
        <p className="text-xs text-muted mt-1">
          Every trip logged with attached dashboard photo, math breakdown, and participant shares.
        </p>
      </header>

      {notice && (
        <p role="status" className="text-xs text-primary">
          {notice}
        </p>
      )}

      {allTags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Filter trips by tag">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            aria-pressed={!activeTagFilter}
            className={!activeTagFilter
              ? 'shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary'
              : 'shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted'}
          >
            All
          </button>
          {allTags.map((tag) => {
            const selected = activeTagFilter?.toLocaleLowerCase() === tag.toLocaleLowerCase();
            return (
              <button
                type="button"
                key={tag}
                onClick={() => setTagFilter(selected ? null : tag)}
                aria-pressed={selected}
                className={selected
                  ? 'shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary'
                  : 'shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted'}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-surface rounded-3xl animate-pulse" />
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
        <div className="space-y-4">
          {visibleTrips.map((trip) => (
            <div
              key={trip.id}
              className="rounded-3xl border border-line bg-surface overflow-hidden shadow-sm"
            >
              {trip.photoURL && (
                <div className="relative aspect-[21/9] bg-black">
                  <img
                    src={trip.photoURL}
                    alt="Dashboard proof"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-surface/90 backdrop-blur-md text-[10px] text-ink-soft">
                    {formatRelativeTime(trip.createdAt)}
                  </div>
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-ink break-words">
                      {trip.name || `${trip.distanceKm} km Trip`}
                    </h3>
                    <p className="text-xs text-muted">
                      {trip.name ? `${trip.distanceKm} km · ` : ''}Logged by {trip.creatorName}
                    </p>
                    {trip.tags && trip.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {trip.tags.map((tag) => (
                          <button
                            type="button"
                            key={tag}
                            onClick={() => setTagFilter(tag)}
                            className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-2 text-right">
                    <div>
                      <span className="text-lg font-black text-ink">{formatCurrency(trip.totalCost)}</span>
                      <span className="text-[10px] text-muted block">{trip.fuelUsedLiters.toFixed(2)} L fuel</span>
                    </div>
{trip.creatorUid === currentUserId && (
                    <button
                      type="button"
                      onClick={() => openEdit(trip)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
                      aria-label={`Edit trip ${trip.name || `for ${trip.distanceKm} km`}`}
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

                <div className="grid grid-cols-3 gap-2 bg-surface-soft p-2.5 rounded-xl border border-line text-center text-xs">
                  <div>
                    <span className="text-[10px] text-muted block">Mileage</span>
                    <span className="font-semibold text-ink">{trip.avgMileageKmpl} km/L</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block">Fuel Rate</span>
                    <span className="font-semibold text-ink">₹{trip.fuelPricePerLiter}/L</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block">Split Mode</span>
                    <span className="font-semibold text-ink capitalize">{trip.splitMode}</span>
                  </div>
                </div>

                {trip.participants && trip.participants.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                      Riders ({trip.participants.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {trip.participants.map((p, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1.5 bg-surface-soft border border-line px-2 py-1 rounded-lg text-xs"
                        >
                          <span className="text-ink font-medium">{p.displayName}</span>
                          <span className="text-primary font-bold">{formatCurrency(p.shareAmount)}</span>
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

            <div className="mt-4 border-t border-line pt-4">
              <TripLabelsFields
                name={nameDraft}
                onNameChange={setNameDraft}
                tags={tagsDraft}
                onTagsChange={setTagsDraft}
                suggestions={allTags}
              />
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
                subtitle="Include me in this split"
                photo={user?.image}
                verified
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
                    subtitle={
                      guest.linkedUid
                        ? 'Linked account'
                        : guest.email
                          ? `Guest · links when ${guest.email} signs in`
                          : 'Guest · no account'
                    }
                    verified={Boolean(guest.linkedUid)}
                    selected={selectedParticipantIds.includes(key)}
                    onToggle={() => toggleParticipant(key)}
                  />
                );
              })}

              <div className="flex gap-2">
                <input
                  value={quickGuestName}
                  onChange={(event) => setQuickGuestName(event.target.value)}
                  maxLength={80}
                  placeholder="New guest name"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addQuickGuest();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs text-ink outline-none focus:border-line-strong"
                />
                <button
                  type="button"
                  onClick={addQuickGuest}
                  disabled={!quickGuestName.trim() || addingGuest}
                  className={cn(BTN.soft, BTN_SIZE.sm)}
                >
                  <UserPlusIcon size={15} />
                  {addingGuest ? 'Adding…' : 'Add guest'}
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-3 border-t border-line pt-4">
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
                  disabled={savingEdit || deletingTrip}
                  className={cn(BTN.primary, BTN_SIZE.md, 'w-full')}
                >
                  <CheckIcon size={16} />
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>

              {confirmDeleteTrip ? (
                <div className="rounded-2xl border border-danger-line bg-danger-soft p-3 space-y-2.5">
                  <p className="text-xs font-medium text-danger">
                    Delete this trip? Everyone&apos;s balance is adjusted to remove it.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTrip(false)}
                      disabled={deletingTrip}
                      className={cn(BTN.secondary, BTN_SIZE.sm, 'w-full')}
                    >
                      Keep trip
                    </button>
                    <button
                      type="button"
                      onClick={deleteTrip}
                      disabled={deletingTrip}
                      className={cn(BTN.danger, BTN_SIZE.sm, 'w-full')}
                    >
                      <TrashIcon size={15} />
                      {deletingTrip ? 'Deleting…' : 'Delete trip'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTrip(true)}
                  disabled={savingEdit}
                  className={cn(BTN.dangerOutline, BTN_SIZE.sm, 'w-full')}
                >
                  <TrashIcon size={15} />
                  Delete trip
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function PersonToggle({
  name,
  subtitle,
  photo,
  verified,
  selected,
  onToggle,
}: {
  name: string;
  subtitle?: string | null;
  photo?: string | null;
  verified?: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        selected ? 'border-primary-line bg-primary-soft' : 'border-line bg-surface hover:bg-surface-soft'
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
          selected ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface'
        )}
      >
        {selected && <CheckIcon size={14} strokeWidth={2.4} />}
      </span>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-8 w-8 shrink-0 rounded-full" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-soft text-xs font-bold text-muted">
          {name[0]?.toUpperCase() || '?'}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-xs font-semibold text-ink">
          <span className="truncate">{name}</span>
          {verified && (
            <span title="Signed in to Paytrol" className="shrink-0 text-primary">
              <VerifiedIcon size={14} />
              <span className="sr-only">Verified account</span>
            </span>
          )}
        </span>
        {subtitle && <span className="block truncate text-[11px] text-muted">{subtitle}</span>}
      </span>
    </button>
  );
}
