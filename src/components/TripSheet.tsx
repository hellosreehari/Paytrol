'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatCurrency } from '@/lib/utils';
import { computeTripCost, splitEqually } from '@/lib/money';
import { invalidate, RESOURCES, setCachedData, useCachedData } from '@/lib/data-cache';
import { cleanTripName, collectTripTags } from '@/lib/trip-labels';
import { buildRiders, guestKey, matchesSearch, orderRiders, riderHistory, type Rider } from '@/lib/riders';
import type { ScanReading } from '@/lib/scan-client';
import type { Friendship, GuestContact, Trip, TripParticipant } from '@/types';
import PersonToggle from '@/components/PersonToggle';
import QuickAddGuest from '@/components/QuickAddGuest';
import TripLabelsFields from '@/components/TripLabelsFields';
import { ChevronDownIcon, FuelPumpIcon, SearchIcon } from '@/components/icons';

/** Show a search box once there are more people than this. */
const SEARCH_AFTER = 8;

export interface TripDraft {
  reading: ScanReading | null;
  previewUrl: string | null;
  note?: string;
}

function numberText(value: number | undefined): string {
  return value && value > 0 ? String(value) : '';
}

/**
 * The one review step for a new trip: the scanned (or typed) numbers, who
 * rode, and Save. Replaces the old Verify and Split pages.
 */
export default function TripSheet({ draft, onClose }: { draft: TripDraft; onClose: () => void }) {
  const router = useRouter();
  const { user, profile, fetchProfile } = useAuth();
  const meUid = user?.uid || '';
  const titleId = useId();
  const distanceRef = useRef<HTMLInputElement>(null);

  const { reading } = draft;
  const scanned = Boolean(reading);
  const [distance, setDistance] = useState(numberText(reading?.distanceKm));
  const [mileage, setMileage] = useState(numberText(reading?.avgMileageKmpl));
  const [price, setPrice] = useState(numberText(profile?.lastFuelPrice));
  const [touched, setTouched] = useState({ distance: false, mileage: false });

  const friendsResource = useCachedData<{ friends: Friendship[] }>(RESOURCES.friends);
  const guestsResource = useCachedData<GuestContact[]>(RESOURCES.guests);
  const { data: tripsData } = useCachedData<Trip[]>(RESOURCES.trips);
  const trips = useMemo(() => tripsData ?? [], [tripsData]);
  const friends = useMemo(() => friendsResource.data?.friends ?? [], [friendsResource.data]);
  const guests = useMemo(() => guestsResource.data ?? [], [guestsResource.data]);

  const riders = useMemo(
    () => buildRiders({ uid: meUid, name: user?.name || 'You', photo: user?.image ?? null }, friends, guests),
    [meUid, user?.name, user?.image, friends, guests]
  );
  const history = useMemo(
    () => riderHistory(trips, meUid, new Set(riders.map((r) => r.key))),
    [trips, meUid, riders]
  );

  // Tick last trip's group by default, once the data is in.
  const defaultTicked = useMemo(
    () => (history.lastGroup.length > 0 ? history.lastGroup : [meUid]),
    [history.lastGroup, meUid]
  );
  const [ticked, setTicked] = useState<string[]>([meUid]);
  const [userChanged, setUserChanged] = useState(false);
  useEffect(() => {
    if (!userChanged) setTicked(defaultTicked);
  }, [defaultTicked, userChanged]);

  // Fix the row order while the sheet is open, so rows don't jump as boxes are ticked.
  const [orderKeys, setOrderKeys] = useState<string[] | null>(null);
  const ordered = useMemo(() => {
    const sorted = orderRiders(riders, defaultTicked, history.recent);
    if (!orderKeys) return sorted;
    const position = new Map(orderKeys.map((key, index) => [key, index]));
    // People added while the sheet is open (new guests) go right after you.
    return [...sorted].sort((a, b) => (position.get(a.key) ?? 0.5) - (position.get(b.key) ?? 0.5));
  }, [riders, defaultTicked, history.recent, orderKeys]);
  useEffect(() => {
    if (!orderKeys && friendsResource.data && guestsResource.data && tripsData) {
      setOrderKeys(orderRiders(riders, defaultTicked, history.recent).map((r) => r.key));
    }
  }, [orderKeys, friendsResource.data, guestsResource.data, tripsData, riders, defaultTicked, history.recent]);

  const [query, setQuery] = useState('');
  const visible = ordered.filter((rider) => matchesSearch(rider.name, query) || (rider.kind === 'me' && !query.trim()));

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tripName, setTripName] = useState('');
  const [tripTags, setTripTags] = useState<string[]>([]);
  const tagSuggestions = useMemo(() => collectTripTags(trips), [trips]);
  const [guestName, setGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const distanceKm = Number(distance);
  const mileageKmpl = Number(mileage);
  const pricePerLiter = Number(price);
  const valid =
    Number.isFinite(distanceKm) && distanceKm > 0 &&
    Number.isFinite(mileageKmpl) && mileageKmpl > 0 &&
    Number.isFinite(pricePerLiter) && pricePerLiter > 0;
  const { fuelUsedLiters, totalCost } = valid
    ? computeTripCost(distanceKm, mileageKmpl, pricePerLiter)
    : { fuelUsedLiters: 0, totalCost: 0 };

  // Riders in list order, so the extra paisa goes to the same people every time.
  const tickedInOrder = ordered.filter((rider) => ticked.includes(rider.key));
  const shares = splitEqually(totalCost, tickedInOrder.length);
  const shareFor = (key: string) => shares[tickedInOrder.findIndex((rider) => rider.key === key)] ?? 0;
  const eachPays = shares.length > 0 ? Math.max(...shares) : 0;

  // Keep the latest close handler without re-running the effects below on every render.
  const closeRef = useRef(onClose);
  const savingRef = useRef(saving);
  useEffect(() => {
    closeRef.current = onClose;
    savingRef.current = saving;
  });
  const close = () => {
    if (!savingRef.current) closeRef.current();
  };

  // Once, on open: focus Distance when typing in, close on Escape, and stop the page behind from scrolling.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!scanned) distanceRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag the top of the sheet down to dismiss it.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);
  const onDragStart = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    dragStart.current = event.clientY;
    setDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onDragMove = (event: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, event.clientY - dragStart.current));
  };
  const onDragEnd = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    setDragging(false);
    if (dragY > 110) close();
    else setDragY(0);
  };

  const [photoOpen, setPhotoOpen] = useState(false);

  const toggle = (key: string) => {
    setUserChanged(true);
    setTicked((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  };

  const sameAsLastTrip = () => {
    setUserChanged(true);
    setTicked(history.lastGroup);
  };
  const isLastGroup =
    history.lastGroup.length > 0 &&
    history.lastGroup.length === ticked.length &&
    history.lastGroup.every((key) => ticked.includes(key));

  const handleAddGuest = async () => {
    const name = guestName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (guests.some((guest) => guest.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setErrorMsg('You already have a guest with that name. Tick them in the list.');
      return;
    }
    setAddingGuest(true);
    try {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not add guest.');
      const guest = data.data as GuestContact;
      guestsResource.mutate((current) => [guest, ...(current ?? [])]);
      setUserChanged(true);
      setTicked((current) => [...current, guestKey(guest.id)]);
      setGuestName('');
      setQuery('');
      setErrorMsg(null);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not add guest.');
    } finally {
      setAddingGuest(false);
    }
  };

  const participantFor = (rider: Rider): TripParticipant => {
    const base = { shareAmount: shareFor(rider.key), customPercentage: null };
    if (rider.kind === 'me') {
      return {
        ...base,
        uid: meUid,
        displayName: user?.name || 'You (Driver)',
        photoURL: user?.image || null,
        settled: true, // the driver already paid for the fuel
        settledAt: new Date().toISOString(),
      };
    }
    if (rider.kind === 'friend') {
      return { ...base, uid: rider.key, displayName: rider.name, photoURL: rider.photo, settled: false, settledAt: null };
    }
    const guest = rider.guest!;
    return {
      ...base,
      uid: guest.linkedUid || guest.guestUid,
      guestContactId: guest.id,
      displayName: guest.name,
      photoURL: null,
      isGuest: !guest.linkedUid,
      settled: false,
      settledAt: null,
    };
  };

  const handleSave = async () => {
    setTouched({ distance: true, mileage: true });
    if (!valid) {
      setErrorMsg('Fill in the distance, average and fuel price.');
      return;
    }
    if (tickedInOrder.length === 0) {
      setErrorMsg('Tick at least one person.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoURL: reading?.photoURL || '',
          distanceKm,
          avgMileageKmpl: mileageKmpl,
          fuelPricePerLiter: pricePerLiter,
          fuelUsedLiters,
          totalCost,
          splitMode: 'equal',
          participants: tickedInOrder.map(participantFor),
          name: cleanTripName(tripName),
          tags: tripTags,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not save the trip.');

      sessionStorage.setItem('paytrol_tripResult', JSON.stringify(data.data));
      setCachedData<Trip[]>(RESOURCES.trips, (current) => [data.data as Trip, ...(current ?? [])]);
      invalidate([RESOURCES.trips, RESOURCES.balances]);
      // The server remembers this fuel price for next time.
      void fetchProfile?.();
      router.push('/result');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not save the trip.');
      setSaving(false);
    }
  };

  const lowDistance = scanned && reading?.confidenceDistance === 'low' && !touched.distance;
  const lowMileage = scanned && reading?.confidenceMileage === 'low' && !touched.mileage;
  const subtitle = draft.note || (scanned ? 'Check against the photo. Tap a number to fix it.' : 'Type in the trip meter readings.');

  const field = (
    label: string,
    unit: string,
    value: string,
    onChange: (value: string) => void,
    options: { low?: boolean; ref?: React.Ref<HTMLInputElement>; onEdit?: () => void } = {}
  ) => (
    <label
      className={cn(
        'flex min-w-0 flex-col rounded-xl border px-3 py-2 transition-colors focus-within:border-primary focus-within:bg-surface',
        options.low ? 'border-warning-line bg-warning-soft' : 'border-line bg-surface-soft'
      )}
    >
      <span className={cn('truncate text-[11px] font-medium', options.low ? 'text-warning' : 'text-muted')}>
        {options.low ? `${label} · check` : label}
      </span>
      <span className="flex items-baseline gap-1">
        <input
          ref={options.ref}
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={value}
          onChange={(event) => {
            options.onEdit?.();
            onChange(event.target.value);
          }}
          placeholder="—"
          className="w-full min-w-0 bg-transparent text-lg font-bold tabular-nums text-ink outline-none placeholder:text-subtle"
          // The whole field shows focus, so the input itself needs no ring.
          style={{ outline: 'none' }}
        />
        <span className="shrink-0 text-[11px] font-semibold text-muted">{unit}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/45 motion-safe:animate-fade-in"
      />
      <div
        className={cn(
          'relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface shadow-2xl motion-safe:animate-sheet-up',
          !dragging && 'transition-transform duration-200'
        )}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="shrink-0 touch-none cursor-grab"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong" aria-hidden="true" />

        <div className="flex items-center gap-3 px-5 pb-3 pt-3">
          {draft.previewUrl ? (
            <button
              type="button"
              onClick={() => setPhotoOpen((open) => !open)}
              aria-expanded={photoOpen}
              aria-label={photoOpen ? 'Hide the photo' : 'Show the photo to check the numbers'}
              className="shrink-0 rounded-xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.previewUrl} alt="" className="h-11 w-11 rounded-xl border border-line object-cover" />
            </button>
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FuelPumpIcon size={22} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold text-ink">New trip</h2>
            <p className={cn('text-xs', draft.note ? 'text-warning' : 'text-muted')}>{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="h-9 shrink-0 rounded-lg px-2 text-sm font-semibold text-primary hover:text-primary-hover"
          >
            {scanned ? 'Retake' : 'Cancel'}
          </button>
        </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4">
          {photoOpen && draft.previewUrl && (
            <button type="button" onClick={() => setPhotoOpen(false)} className="block w-full overflow-hidden rounded-2xl bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.previewUrl} alt="The dashboard photo that was read" className="max-h-64 w-full object-contain" />
            </button>
          )}
          <div className="grid grid-cols-3 gap-2">
            {field('Distance', 'km', distance, setDistance, {
              low: lowDistance,
              ref: distanceRef,
              onEdit: () => setTouched((t) => ({ ...t, distance: true })),
            })}
            {field('Average', 'km/L', mileage, setMileage, {
              low: lowMileage,
              onEdit: () => setTouched((t) => ({ ...t, mileage: true })),
            })}
            {field('Fuel', '₹/L', price, setPrice)}
          </div>

          <div className="flex items-baseline justify-between px-0.5 text-xs text-muted">
            <span>{valid ? `${fuelUsedLiters.toFixed(2)} L of fuel` : 'Fuel used shows here'}</span>
            <span className="text-lg font-black tabular-nums text-ink">{formatCurrency(totalCost)}</span>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Who rode · {tickedInOrder.length}
              </h3>
              {history.lastGroup.length > 0 && !isLastGroup && (
                <button type="button" onClick={sameAsLastTrip} className="h-8 text-xs font-semibold text-primary hover:text-primary-hover">
                  Same as last trip
                </button>
              )}
            </div>

            {riders.length > SEARCH_AFTER && (
              <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-muted focus-within:border-line-strong">
                <SearchIcon size={16} />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${riders.length - 1} people`}
                  aria-label="Search people"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-subtle"
                />
              </label>
            )}

            {/* One scroll area for the whole sheet: no list scrolling inside a scrolling sheet. */}
            <div className="space-y-1.5">
              {visible.map((rider) => (
                <PersonToggle
                  key={rider.key}
                  name={rider.name}
                  photo={rider.photo}
                  verified={rider.kind !== 'me' && rider.verified}
                  selected={ticked.includes(rider.key)}
                  onToggle={() => toggle(rider.key)}
                  trailing={
                    ticked.includes(rider.key) && totalCost > 0 ? (
                      <span className="text-sm font-bold tabular-nums text-primary">{formatCurrency(shareFor(rider.key))}</span>
                    ) : undefined
                  }
                />
              ))}
              {visible.length === 0 && (
                <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
                  No one called “{query.trim()}”. Add them as a guest below.
                </p>
              )}
            </div>

            <QuickAddGuest value={guestName} onChange={setGuestName} onAdd={handleAddGuest} adding={addingGuest} />
          </section>

          <section>
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              className="flex h-10 w-full items-center justify-between text-xs font-semibold text-ink-soft"
            >
              <span>{tripName || tripTags.length ? 'Name and tags' : 'Add a name or tags'}</span>
              <ChevronDownIcon size={16} className={cn('transition-transform', detailsOpen && 'rotate-180')} />
            </button>
            {detailsOpen && (
              <div className="rounded-2xl border border-line p-4">
                <TripLabelsFields
                  name={tripName}
                  onNameChange={setTripName}
                  tags={tripTags}
                  onTagsChange={setTripTags}
                  suggestions={tagSuggestions}
                />
              </div>
            )}
          </section>
        </div>

        <div className="shrink-0 space-y-2 border-t border-line px-5 pb-safe pt-3">
          {errorMsg && (
            <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
              {errorMsg}
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
                Saving…
              </>
            ) : tickedInOrder.length > 1 && totalCost > 0 ? (
              `Save trip · ${formatCurrency(eachPays)} each`
            ) : (
              'Save trip'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
