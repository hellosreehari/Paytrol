import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createDocument, queryDocuments, getDocument, updateDocument, deleteDocument } from '@/lib/db';
import type { GuestContact, Trip, TripParticipant, UserProfile } from '@/types';
import { generateId } from '@/lib/utils';
import { deletePhoto, getPhotoReadUrl, normalizeStoredPhotoUrl } from '@/lib/blob-storage';
import { computeTripCost, splitByPercentages, splitEqually } from '@/lib/money';
import { adjustBalance, getAcceptedFriendUids, type LedgerParty } from '@/lib/ledger';

const PHOTO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 80);
  return name || fallback;
}

function cleanPhoto(value: unknown): string | null {
  return typeof value === 'string' && /^https:\/\//.test(value) ? value : null;
}

type ResolveResult =
  | { ok: true; participants: TripParticipant[] }
  | { ok: false; error: string; status: number };

/**
 * Turn the participants a client submitted into trusted participant records.
 * Only identity is taken from the request; names for guests, settlement flags
 * and every share amount are decided here, on the server.
 */
async function resolveParticipants(
  uid: string,
  sessionUser: { name?: string | null; image?: string | null },
  submitted: unknown
): Promise<ResolveResult> {
  const list = Array.isArray(submitted) ? (submitted as Partial<TripParticipant>[]) : [];
  const participants: TripParticipant[] = [];
  let friendUids: Set<string> | null = null;
  const now = new Date().toISOString();

  for (const participant of list) {
    if (!participant || typeof participant !== 'object') {
      return { ok: false, error: 'Invalid participant.', status: 400 };
    }
    const customPercentage =
      participant.customPercentage === null || participant.customPercentage === undefined
        ? null
        : Number(participant.customPercentage);

    if (participant.guestContactId) {
      const contact = await getDocument<GuestContact>('guests', String(participant.guestContactId));
      if (!contact || contact.ownerUid !== uid) {
        return { ok: false, error: 'Guest contact not found.', status: 404 };
      }
      const linkedUser = contact.linkedUid
        ? await getDocument<UserProfile>('users', contact.linkedUid)
        : null;
      participants.push({
        uid: contact.linkedUid || contact.guestUid,
        guestContactId: contact.id,
        displayName: contact.name,
        photoURL: linkedUser?.photoURL || null,
        isGuest: !contact.linkedUid,
        shareAmount: 0,
        customPercentage,
        settled: false,
        settledAt: null,
      });
      continue;
    }

    if (participant.isGuest) {
      return { ok: false, error: 'Save a guest contact before adding them to a trip.', status: 400 };
    }
    const participantUid = typeof participant.uid === 'string' ? participant.uid : '';
    if (!participantUid) {
      return { ok: false, error: 'Participant must be you or an accepted friend.', status: 403 };
    }

    if (participantUid === uid) {
      participants.push({
        uid,
        displayName: cleanName(participant.displayName, sessionUser.name || 'You'),
        photoURL: cleanPhoto(participant.photoURL) ?? sessionUser.image ?? null,
        shareAmount: 0,
        customPercentage,
        settled: true, // the creator paid for the fuel
        settledAt: now,
      });
      continue;
    }

    friendUids ??= await getAcceptedFriendUids(uid);
    if (!friendUids.has(participantUid)) {
      return { ok: false, error: 'Participant must be you or an accepted friend.', status: 403 };
    }
    participants.push({
      uid: participantUid,
      displayName: cleanName(participant.displayName, 'Friend'),
      photoURL: cleanPhoto(participant.photoURL),
      shareAmount: 0,
      customPercentage,
      settled: false,
      settledAt: null,
    });
  }

  if (participants.length === 0) {
    return { ok: false, error: 'Include yourself or at least one person.', status: 400 };
  }
  if (new Set(participants.map((participant) => participant.uid)).size !== participants.length) {
    return { ok: false, error: 'A participant can only be included once.', status: 400 };
  }
  return { ok: true, participants };
}

/** Assign server-computed shares. Returns an error message when a custom split is invalid. */
function assignShares(
  participants: TripParticipant[],
  totalCost: number,
  splitMode: 'equal' | 'custom'
): string | null {
  const shares =
    splitMode === 'custom'
      ? splitByPercentages(totalCost, participants.map((p) => Number(p.customPercentage)))
      : splitEqually(totalCost, participants.length);
  if (!shares) return 'Custom split percentages must total 100.';
  participants.forEach((participant, index) => {
    participant.shareAmount = shares[index];
    if (splitMode === 'equal') participant.customPercentage = null;
  });
  return null;
}

function validateReadings(distanceKm: number, avgMileageKmpl: number, fuelPricePerLiter: number) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 'Distance must be greater than zero.';
  if (!Number.isFinite(avgMileageKmpl) || avgMileageKmpl <= 0) return 'Mileage must be greater than zero.';
  if (!Number.isFinite(fuelPricePerLiter) || fuelPricePerLiter <= 0) return 'Fuel price must be greater than zero.';
  return null;
}

function owedShares(trip: Pick<Trip, 'creatorUid' | 'participants'>) {
  return new Map(
    trip.participants
      .filter((participant) => participant.uid !== trip.creatorUid)
      .map((participant) => [participant.uid, participant])
  );
}

async function rememberFuelPrice(uid: string, fuelPricePerLiter: number) {
  try {
    const user = await getDocument<UserProfile>('users', uid);
    if (user && user.lastFuelPrice !== fuelPricePerLiter) {
      user.lastFuelPrice = fuelPricePerLiter;
      user.updatedAt = new Date().toISOString();
      await updateDocument('users', user);
    }
  } catch (e) {
    console.warn('Could not update user fuel preference:', e);
  }
}

async function getCreatorParty(uid: string, sessionUser: { name?: string | null; image?: string | null }): Promise<LedgerParty> {
  const profile = await getDocument<UserProfile>('users', uid);
  return {
    uid,
    name: profile?.displayName || sessionUser.name || 'Driver',
    photo: profile?.photoURL ?? sessionUser.image ?? null,
  };
}

async function withReadablePhoto(trip: Trip): Promise<Trip> {
  return trip.photoURL ? { ...trip, photoURL: await getPhotoReadUrl(trip.photoURL) } : trip;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;

    if (!uid) {
      return jsonError('Unauthorized', 401);
    }

    const trips = await queryDocuments<Trip>(
      'trips',
      { $or: [{ creatorUid: uid }, { participants: { $elemMatch: { uid } } }] },
      { newestFirst: true }
    );

    // Dashboard photos are kept for 7 days. The scheduled cleanup route does the
    // same job; this keeps expired photos hidden even if the schedule hasn't run.
    const retentionLimit = Date.now() - PHOTO_RETENTION_MS;
    const visibleTrips = await Promise.all(trips.map(async (trip) => {
      const createdAt = new Date(trip.createdAt).getTime();
      if (trip.photoURL && Number.isFinite(createdAt) && createdAt < retentionLimit) {
        await deletePhoto(trip.photoURL);
        const cleanedTrip = { ...trip, photoURL: '' };
        await updateDocument('trips', cleanedTrip);
        return cleanedTrip;
      }
      return withReadablePhoto(trip);
    }));

    return NextResponse.json({ success: true, data: visibleTrips });
  } catch (error: unknown) {
    console.error('Trips GET error:', error);
    return jsonError(error instanceof Error ? error.message : 'Failed to load trips', 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;
    if (!uid) {
      return jsonError('Unauthorized', 401);
    }

    const body = await req.json() as { tripId?: string };
    if (!body.tripId) {
      return jsonError('Trip ID is required.', 400);
    }

    const trip = await getDocument<Trip>('trips', body.tripId);
    if (!trip) {
      return jsonError('Trip not found.', 404);
    }
    if (trip.creatorUid !== uid) {
      return jsonError('Only the trip creator can delete this trip.', 403);
    }

    // Delete the trip first so a failure part-way never leaves balances
    // reversed for a trip that still exists.
    await deleteDocument('trips', trip.id);
    const owner = await getCreatorParty(uid, session?.user || {});
    for (const participant of owedShares(trip).values()) {
      const share = participant.shareAmount || 0;
      if (share <= 0) continue;
      await adjustBalance(
        owner,
        { uid: participant.uid, name: participant.displayName, photo: participant.photoURL },
        -share,
        { createIfMissing: false }
      );
    }
    await deletePhoto(trip.photoURL);

    return NextResponse.json({ success: true, data: { id: trip.id } });
  } catch (error: unknown) {
    console.error('Trips DELETE error:', error);
    return jsonError(error instanceof Error ? error.message : 'Failed to delete trip', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;

    if (!uid) {
      return jsonError('Unauthorized', 401);
    }

    const body = await req.json() as {
      photoURL?: string;
      distanceKm?: number;
      avgMileageKmpl?: number;
      fuelPricePerLiter?: number;
      splitMode?: 'equal' | 'custom';
      participants?: TripParticipant[];
    };

    const distanceKm = Number(body.distanceKm);
    const avgMileageKmpl = Number(body.avgMileageKmpl);
    const fuelPricePerLiter = Number(body.fuelPricePerLiter);
    const readingsError = validateReadings(distanceKm, avgMileageKmpl, fuelPricePerLiter);
    if (readingsError) return jsonError(readingsError, 400);

    const photoURL = normalizeStoredPhotoUrl(body.photoURL);
    if (photoURL === null) {
      return jsonError('That photo could not be attached. Please scan it again.', 400);
    }

    const resolved = await resolveParticipants(uid, session?.user || {}, body.participants);
    if (!resolved.ok) return jsonError(resolved.error, resolved.status);

    const splitMode = body.splitMode === 'custom' ? 'custom' : 'equal';
    const { fuelUsedLiters, totalCost } = computeTripCost(distanceKm, avgMileageKmpl, fuelPricePerLiter);
    const shareError = assignShares(resolved.participants, totalCost, splitMode);
    if (shareError) return jsonError(shareError, 400);

    const owner = await getCreatorParty(uid, session?.user || {});
    const trip: Trip = {
      id: generateId(),
      creatorUid: uid,
      creatorName: owner.name,
      photoURL,
      distanceKm,
      avgMileageKmpl,
      fuelPricePerLiter,
      fuelUsedLiters,
      totalCost,
      splitMode,
      participants: resolved.participants,
      createdAt: new Date().toISOString(),
    };

    const savedTrip = await createDocument('trips', trip);

    await rememberFuelPrice(uid, fuelPricePerLiter);

    // Each participant now owes the creator their share.
    for (const participant of owedShares(trip).values()) {
      if (participant.shareAmount <= 0) continue;
      await adjustBalance(
        owner,
        {
          uid: participant.uid,
          name: participant.displayName,
          photo: participant.photoURL,
          isGuest: participant.isGuest,
        },
        participant.shareAmount
      );
    }

    return NextResponse.json({ success: true, data: await withReadablePhoto(savedTrip) });
  } catch (error: unknown) {
    console.error('Trips POST error:', error);
    return jsonError(error instanceof Error ? error.message : 'Failed to save trip', 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;
    if (!uid) {
      return jsonError('Unauthorized', 401);
    }

    const body = await req.json() as {
      tripId?: string;
      distanceKm?: number;
      avgMileageKmpl?: number;
      fuelPricePerLiter?: number;
      participants?: TripParticipant[];
    };
    if (!body.tripId) {
      return jsonError('Trip ID is required.', 400);
    }

    const trip = await getDocument<Trip>('trips', body.tripId);
    if (!trip) {
      return jsonError('Trip not found.', 404);
    }
    if (trip.creatorUid !== uid) {
      return jsonError('Only the trip creator can edit this trip.', 403);
    }

    const distanceKm = Number(body.distanceKm);
    const avgMileageKmpl = Number(body.avgMileageKmpl);
    const fuelPricePerLiter = Number(body.fuelPricePerLiter);
    const readingsError = validateReadings(distanceKm, avgMileageKmpl, fuelPricePerLiter);
    if (readingsError) return jsonError(readingsError, 400);

    const resolved = await resolveParticipants(
      uid,
      session?.user || {},
      Array.isArray(body.participants) ? body.participants : trip.participants
    );
    if (!resolved.ok) return jsonError(resolved.error, resolved.status);

    // The edit form only supports equal splits, so an edit re-splits equally.
    const { fuelUsedLiters, totalCost } = computeTripCost(distanceKm, avgMileageKmpl, fuelPricePerLiter);
    assignShares(resolved.participants, totalCost, 'equal');

    const oldShares = owedShares(trip);
    const newShares = owedShares({ creatorUid: uid, participants: resolved.participants });

    trip.distanceKm = distanceKm;
    trip.avgMileageKmpl = avgMileageKmpl;
    trip.fuelPricePerLiter = fuelPricePerLiter;
    trip.fuelUsedLiters = fuelUsedLiters;
    trip.totalCost = totalCost;
    trip.splitMode = 'equal';
    trip.participants = resolved.participants;

    const updatedTrip = await updateDocument('trips', trip);

    const owner = await getCreatorParty(uid, session?.user || {});
    for (const participantUid of new Set([...oldShares.keys(), ...newShares.keys()])) {
      const before = oldShares.get(participantUid);
      const after = newShares.get(participantUid);
      const delta = (after?.shareAmount || 0) - (before?.shareAmount || 0);
      const person = after || before!;
      await adjustBalance(
        owner,
        { uid: participantUid, name: person.displayName, photo: person.photoURL, isGuest: person.isGuest },
        delta,
        { createIfMissing: Boolean(after && after.shareAmount > 0) }
      );
    }

    await rememberFuelPrice(uid, fuelPricePerLiter);

    return NextResponse.json({ success: true, data: await withReadablePhoto(updatedTrip) });
  } catch (error: unknown) {
    console.error('Trips PATCH error:', error);
    return jsonError(error instanceof Error ? error.message : 'Failed to edit trip', 500);
  }
}
