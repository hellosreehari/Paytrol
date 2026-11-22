import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createDocument, queryDocuments, getDocument, updateDocument, deleteDocument } from '@/lib/cosmos';
import type { GuestContact, Trip, TripParticipant, UserProfile, Balance, Friendship } from '@/types';
import { generateId } from '@/lib/utils';
import { deletePhoto } from '@/lib/blob-storage';

// Helper to get normalized balance key
function getBalanceKey(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join('_');
}

async function isAcceptedFriend(ownerUid: string, participantUid: string): Promise<boolean> {
  if (ownerUid === participantUid) return true;
  const relationships = await queryDocuments<Friendship>(
    'friendships',
    'SELECT * FROM c WHERE c.status = @status AND (c.fromUid = @uid OR c.toUid = @uid)',
    [
      { name: '@status', value: 'accepted' },
      { name: '@uid', value: ownerUid },
    ]
  );
  return relationships.some((relationship) =>
    relationship.status === 'accepted' &&
    ((relationship.fromUid === ownerUid && relationship.toUid === participantUid) ||
      (relationship.fromUid === participantUid && relationship.toUid === ownerUid))
  );
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || (session ? 'demo-user' : null);

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const trips = await queryDocuments<Trip>(
      'trips',
      'SELECT * FROM c WHERE c.creatorUid = @uid OR ARRAY_CONTAINS(c.participants, {"uid": @uid}, true) ORDER BY c.createdAt DESC',
      [{ name: '@uid', value: uid }]
    );

    const retentionLimit = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const visibleTrips = await Promise.all(trips.map(async (trip) => {
      const createdAt = new Date(trip.createdAt).getTime();
      if (trip.photoURL && Number.isFinite(createdAt) && createdAt < retentionLimit) {
        await deletePhoto(trip.photoURL);
        const cleanedTrip = { ...trip, photoURL: '' };
        await updateDocument('trips', cleanedTrip);
        return cleanedTrip;
      }
      return trip;
    }));

    return NextResponse.json({ success: true, data: visibleTrips });
  } catch (error: unknown) {
    console.error('Trips GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load trips' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || (session ? 'demo-user' : null);
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { tripId?: string };
    if (!body.tripId) {
      return NextResponse.json({ success: false, error: 'Trip ID is required.' }, { status: 400 });
    }

    const trip = await getDocument<Trip>('trips', body.tripId);
    if (!trip) {
      return NextResponse.json({ success: false, error: 'Trip not found.' }, { status: 404 });
    }
    if (trip.creatorUid !== uid) {
      return NextResponse.json({ success: false, error: 'Only the trip creator can delete this trip.' }, { status: 403 });
    }

    for (const participant of trip.participants) {
      if (participant.uid === uid) continue;
      const share = participant.shareAmount || 0;
      if (share <= 0) continue;

      const balanceId = getBalanceKey(uid, participant.uid);
      const balance = await getDocument<Balance>('balances', balanceId);
      if (!balance) continue;

      if (balance.uid1 === uid) {
        balance.netAmount += share;
      } else {
        balance.netAmount -= share;
      }
      await updateDocument('balances', balance);
    }

    await deletePhoto(trip.photoURL);
    await deleteDocument('trips', trip.id);
    return NextResponse.json({ success: true, data: { id: trip.id } });
  } catch (error: unknown) {
    console.error('Trips DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete trip' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || (session ? 'demo-user' : null);

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      photoURL?: string;
      distanceKm?: number;
      avgMileageKmpl?: number;
      fuelPricePerLiter?: number;
      fuelUsedLiters?: number;
      totalCost?: number;
      splitMode?: 'equal' | 'custom';
      participants?: TripParticipant[];
    };

    const distanceKm = Number(body.distanceKm);
    const avgMileageKmpl = Number(body.avgMileageKmpl);
    const fuelPricePerLiter = Number(body.fuelPricePerLiter);
    const fuelUsedLiters = avgMileageKmpl > 0 ? distanceKm / avgMileageKmpl : 0;
    const totalCost = Math.round(fuelUsedLiters * fuelPricePerLiter * 100) / 100;
    const submittedParticipants = Array.isArray(body.participants) ? body.participants : [];
    const participants: TripParticipant[] = [];

    for (const participant of submittedParticipants) {
      if (participant.guestContactId) {
        const contact = await getDocument<GuestContact>('guests', participant.guestContactId);
        if (!contact || contact.ownerUid !== uid) {
          return NextResponse.json(
            { success: false, error: 'Guest contact not found.' },
            { status: 404 }
          );
        }
        const linkedUser = contact.linkedUid
          ? await getDocument<UserProfile>('users', contact.linkedUid)
          : null;
        participants.push({
          ...participant,
          uid: contact.linkedUid || contact.guestUid,
          displayName: contact.name,
          photoURL: linkedUser?.photoURL || null,
          isGuest: !contact.linkedUid,
        });
      } else {
        if (participant.isGuest) {
          return NextResponse.json(
            { success: false, error: 'Save a guest contact before adding them to a trip.' },
            { status: 400 }
          );
        }
        if (!await isAcceptedFriend(uid, participant.uid)) {
          return NextResponse.json(
            { success: false, error: 'Participant must be you or an accepted friend.' },
            { status: 403 }
          );
        }
        participants.push(participant);
      }
    }

    if (new Set(participants.map((participant) => participant.uid)).size !== participants.length) {
      return NextResponse.json(
        { success: false, error: 'A participant can only be included once.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return NextResponse.json({ success: false, error: 'Distance must be greater than zero.' }, { status: 400 });
    }
    if (!Number.isFinite(avgMileageKmpl) || avgMileageKmpl <= 0) {
      return NextResponse.json({ success: false, error: 'Mileage must be greater than zero.' }, { status: 400 });
    }
    if (!Number.isFinite(fuelPricePerLiter) || fuelPricePerLiter <= 0) {
      return NextResponse.json({ success: false, error: 'Fuel price must be greater than zero.' }, { status: 400 });
    }
    if (body.splitMode === 'custom') {
      const customTotal = participants.reduce((sum, p) => sum + (Number(p.customPercentage) || 0), 0);
      if (customTotal !== 100) {
        return NextResponse.json({ success: false, error: 'Custom split percentages must total 100.' }, { status: 400 });
      }
    }

    const trip: Trip = {
      id: generateId(),
      creatorUid: uid,
      creatorName: session?.user?.name || 'Driver',
      photoURL: body.photoURL || '',
      distanceKm,
      avgMileageKmpl,
      fuelPricePerLiter,
      fuelUsedLiters: Math.round(fuelUsedLiters * 1000) / 1000,
      totalCost,
      splitMode: body.splitMode || 'equal',
      participants,
      createdAt: new Date().toISOString(),
    };

    const savedTrip = await createDocument('trips', trip);

    // 1. Update creator's last fuel price preference
    try {
      const user = await getDocument<UserProfile>('users', uid);
      if (user) {
        user.lastFuelPrice = trip.fuelPricePerLiter;
        user.updatedAt = new Date().toISOString();
        await updateDocument('users', user);
      }
    } catch (e) {
      console.warn('Could not update user fuel preference:', e);
    }

    // 2. Automatically update Balances ledger between creator and each friend participant
    for (const participant of trip.participants) {
      if (participant.uid === uid) continue; // Skip creator's own share

      const pUid = participant.uid;
      const share = participant.shareAmount || 0;
      if (share <= 0) continue;

      const balanceId = getBalanceKey(uid, pUid);
      const existingBalance = await getDocument<Balance>('balances', balanceId);

      if (existingBalance) {
        // netAmount convention:
        // if uid === uid1, positive means uid1 owes uid2, negative means uid2 owes uid1.
        if (existingBalance.uid1 === uid) {
          existingBalance.netAmount -= share; // participant owes creator more
        } else {
          existingBalance.netAmount += share; // participant owes creator more
        }
        if (participant.isGuest) existingBalance.guestUid = pUid;
        await updateDocument('balances', existingBalance);
      } else {
        const newBalance: Balance = {
          id: balanceId,
          odataId: balanceId,
          uid1: uid,
          uid2: pUid,
          name1: session?.user?.name || 'Driver',
          name2: participant.displayName || 'Friend',
          photo1: session?.user?.image || null,
          photo2: participant.photoURL || null,
          netAmount: -share, // uid2 (participant) owes uid1 (creator) `share`
          ...(participant.isGuest ? { guestUid: pUid } : {}),
        };
        await createDocument('balances', newBalance);
      }
    }

    return NextResponse.json({ success: true, data: savedTrip });
  } catch (error: unknown) {
    console.error('Trips POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save trip' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || (session ? 'demo-user' : null);
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      tripId?: string;
      distanceKm?: number;
      avgMileageKmpl?: number;
      fuelPricePerLiter?: number;
      participants?: TripParticipant[];
    };
    if (!body.tripId) {
      return NextResponse.json({ success: false, error: 'Trip ID is required.' }, { status: 400 });
    }

    const trip = await getDocument<Trip>('trips', body.tripId);
    if (!trip) {
      return NextResponse.json({ success: false, error: 'Trip not found.' }, { status: 404 });
    }
    if (trip.creatorUid !== uid) {
      return NextResponse.json({ success: false, error: 'Only the trip creator can edit this trip.' }, { status: 403 });
    }

    const distanceKm = Number(body.distanceKm);
    const avgMileageKmpl = Number(body.avgMileageKmpl);
    const fuelPricePerLiter = Number(body.fuelPricePerLiter);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return NextResponse.json({ success: false, error: 'Distance must be greater than zero.' }, { status: 400 });
    }
    if (!Number.isFinite(avgMileageKmpl) || avgMileageKmpl <= 0) {
      return NextResponse.json({ success: false, error: 'Mileage must be greater than zero.' }, { status: 400 });
    }
    if (!Number.isFinite(fuelPricePerLiter) || fuelPricePerLiter <= 0) {
      return NextResponse.json({ success: false, error: 'Fuel price must be greater than zero.' }, { status: 400 });
    }

    const submittedParticipants = Array.isArray(body.participants)
      ? body.participants
      : trip.participants;
    const participants: TripParticipant[] = [];

    for (const participant of submittedParticipants) {
      if (participant.guestContactId) {
        const guest = await getDocument<GuestContact>('guests', participant.guestContactId);
        if (!guest || guest.ownerUid !== uid) {
          return NextResponse.json(
            { success: false, error: 'Guest contact not found.' },
            { status: 404 }
          );
        }
        const linkedUser = guest.linkedUid
          ? await getDocument<UserProfile>('users', guest.linkedUid)
          : null;
        participants.push({
          ...participant,
          uid: guest.linkedUid || guest.guestUid,
          displayName: guest.name,
          photoURL: linkedUser?.photoURL || null,
          isGuest: !guest.linkedUid,
        });
      } else {
        if (!await isAcceptedFriend(uid, participant.uid)) {
          return NextResponse.json(
            { success: false, error: 'Participant must be you or an accepted friend.' },
            { status: 403 }
          );
        }
        participants.push(participant);
      }
    }

    if (participants.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Include yourself or at least one person.' },
        { status: 400 }
      );
    }
    if (new Set(participants.map((participant) => participant.uid)).size !== participants.length) {
      return NextResponse.json(
        { success: false, error: 'A participant can only be included once.' },
        { status: 400 }
      );
    }

    const fuelUsedLiters = distanceKm / avgMileageKmpl;
    const totalCost = Math.round(fuelUsedLiters * fuelPricePerLiter * 100) / 100;
    const participantCount = participants.length;
    const totalCents = Math.round(totalCost * 100);
    const baseCents = participantCount > 0 ? Math.floor(totalCents / participantCount) : 0;
    const remainingCents = participantCount > 0 ? totalCents % participantCount : 0;

    const oldParticipants = new Map(
      trip.participants.map((participant) => [participant.uid, participant.shareAmount || 0])
    );
    const updatedParticipants = participants.map((participant, index) => ({
      ...participant,
      shareAmount: participantCount > 0
        ? (baseCents + (index < remainingCents ? 1 : 0)) / 100
        : 0,
    }));

    trip.distanceKm = distanceKm;
    trip.avgMileageKmpl = avgMileageKmpl;
    trip.fuelPricePerLiter = fuelPricePerLiter;
    trip.fuelUsedLiters = Math.round(fuelUsedLiters * 1000) / 1000;
    trip.totalCost = totalCost;
    trip.participants = updatedParticipants;

    const updatedTrip = await updateDocument('trips', trip);

    const participantMap = new Map(
      updatedParticipants.map((participant) => [participant.uid, participant])
    );
    const affectedUidSet = new Set([
      ...oldParticipants.keys(),
      ...participantMap.keys(),
    ]);

    for (const participantUid of affectedUidSet) {
      if (participantUid === uid) continue;
      const participant = participantMap.get(participantUid);
      const oldShare = oldParticipants.get(participantUid) || 0;
      const newShare = participant?.shareAmount || 0;
      const shareDelta = Math.round((newShare - oldShare) * 100) / 100;
      if (shareDelta === 0) continue;

      const balanceId = getBalanceKey(uid, participantUid);
      const existingBalance = await getDocument<Balance>('balances', balanceId);
      if (existingBalance) {
        if (existingBalance.uid1 === uid) {
          existingBalance.netAmount -= shareDelta;
        } else {
          existingBalance.netAmount += shareDelta;
        }
        await updateDocument('balances', existingBalance);
      } else if (participant && newShare > 0) {
        await createDocument('balances', {
          id: balanceId,
          odataId: balanceId,
          uid1: uid,
          uid2: participantUid,
          name1: session?.user?.name || 'Driver',
          name2: participant.displayName || 'Friend',
          photo1: session?.user?.image || null,
          photo2: participant.photoURL || null,
          netAmount: -newShare,
          ...(participant.isGuest ? { guestUid: participantUid } : {}),
        });
      } else {
        continue;
      }
    }

    try {
      const user = await getDocument<UserProfile>('users', uid);
      if (user) {
        user.lastFuelPrice = fuelPricePerLiter;
        user.updatedAt = new Date().toISOString();
        await updateDocument('users', user);
      }
    } catch (e) {
      console.warn('Could not update user fuel preference:', e);
    }

    return NextResponse.json({ success: true, data: updatedTrip });
  } catch (error: unknown) {
    console.error('Trips PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to edit trip' },
      { status: 500 }
    );
  }
}
