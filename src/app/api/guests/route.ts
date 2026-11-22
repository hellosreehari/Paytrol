import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createDocument,
  deleteDocument,
  getDocument,
  queryDocuments,
  updateDocument,
} from '@/lib/cosmos';
import {
  getGuestUid,
  linkGuestContact,
  renameGuestContact,
} from '@/lib/guest-linking';
import type { Balance, GuestContact, Trip, TripParticipant, UserProfile } from '@/types';
import { generateId } from '@/lib/utils';

async function getOwnerUid() {
  const session = await getServerSession(authOptions);
  return session?.user?.uid || (session ? 'demo-user' : null);
}

export async function GET() {
  try {
    const ownerUid = await getOwnerUid();
    if (!ownerUid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const guests = await queryDocuments<GuestContact>(
      'guests',
      'SELECT * FROM c WHERE c.ownerUid = @ownerUid ORDER BY c.createdAt DESC',
      [{ name: '@ownerUid', value: ownerUid }]
    );
    return NextResponse.json({ success: true, data: guests });
  } catch (error: unknown) {
    console.error('Guests GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load guests' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ownerUid = await getOwnerUid();
    if (!ownerUid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 80) {
      return NextResponse.json(
        { success: false, error: 'Enter a guest name up to 80 characters.' },
        { status: 400 }
      );
    }

    const existingGuests = await queryDocuments<GuestContact>(
      'guests',
      'SELECT * FROM c WHERE c.ownerUid = @ownerUid',
      [{ name: '@ownerUid', value: ownerUid }]
    );
    if (existingGuests.some((guest) => guest.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return NextResponse.json(
        { success: false, error: 'A guest with that name already exists.' },
        { status: 409 }
      );
    }

    const id = generateId();
    const now = new Date().toISOString();
    const guest: GuestContact = {
      id,
      ownerUid,
      guestUid: getGuestUid(ownerUid, id),
      name,
      email: null,
      linkedUid: null,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await createDocument('guests', guest);
    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (error: unknown) {
    console.error('Guests POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to add guest' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ownerUid = await getOwnerUid();
    if (!ownerUid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { guestId?: unknown; name?: unknown; email?: unknown };
    if (typeof body.guestId !== 'string') {
      return NextResponse.json({ success: false, error: 'Guest ID is required.' }, { status: 400 });
    }

    const guest = await getDocument<GuestContact>('guests', body.guestId);
    if (!guest || guest.ownerUid !== ownerUid) {
      return NextResponse.json({ success: false, error: 'Guest contact not found.' }, { status: 404 });
    }

    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : guest.name;
    if (!name || name.length > 80) {
      return NextResponse.json(
        { success: false, error: 'Enter a guest name up to 80 characters.' },
        { status: 400 }
      );
    }

    const email = body.email === null || body.email === ''
      ? null
      : typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : guest.email;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (email && email === (await getDocument<UserProfile>('users', ownerUid))?.email.toLowerCase()) {
      return NextResponse.json({ success: false, error: 'You cannot link a guest to your own email.' }, { status: 400 });
    }
    if (guest.linkedUid && email !== guest.email) {
      return NextResponse.json(
        { success: false, error: 'Email cannot be changed after this guest is linked to an account.' },
        { status: 400 }
      );
    }

    const duplicateName = (await queryDocuments<GuestContact>(
      'guests',
      'SELECT * FROM c WHERE c.ownerUid = @ownerUid',
      [{ name: '@ownerUid', value: ownerUid }]
    )).some((other) => other.id !== guest.id && other.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicateName) {
      return NextResponse.json({ success: false, error: 'A guest with that name already exists.' }, { status: 409 });
    }

    guest.email = email;
    await renameGuestContact(guest, name);

    if (email && !guest.linkedUid) {
      const users = await queryDocuments<UserProfile>(
        'users',
        'SELECT * FROM c WHERE LOWER(c.email) = @email',
        [{ name: '@email', value: email }]
      );
      const matchingUser = users.find((user) => user.id !== ownerUid);
      if (matchingUser) {
        await linkGuestContact(guest, {
          id: matchingUser.id,
          displayName: matchingUser.displayName,
          photoURL: matchingUser.photoURL,
        });
      }
    }

    const updated = await getDocument<GuestContact>('guests', guest.id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    console.error('Guests PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update guest' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ownerUid = await getOwnerUid();
    if (!ownerUid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { guestId?: unknown };
    if (typeof body.guestId !== 'string') {
      return NextResponse.json({ success: false, error: 'Guest ID is required.' }, { status: 400 });
    }

    const guest = await getDocument<GuestContact>('guests', body.guestId);
    if (!guest || guest.ownerUid !== ownerUid) {
      return NextResponse.json({ success: false, error: 'Guest contact not found.' }, { status: 404 });
    }

    const guestUid = guest.linkedUid || guest.guestUid;
    const trips = await queryDocuments<Trip>(
      'trips',
      'SELECT * FROM c WHERE ARRAY_CONTAINS(c.participants, {"guestContactId": @contactId}, true)',
      [{ name: '@contactId', value: guest.id }]
    );

    for (const trip of trips) {
      const oldParticipants = new Map(
        trip.participants.map((participant) => [participant.uid, participant.shareAmount || 0])
      );
      const remaining = trip.participants.filter(
        (participant) => participant.guestContactId !== guest.id && participant.uid !== guestUid
      );
      if (remaining.length === trip.participants.length) continue;

      const participantCount = remaining.length;
      const totalCents = Math.round(trip.totalCost * 100);
      const baseCents = participantCount > 0 ? Math.floor(totalCents / participantCount) : 0;
      const remainingCents = participantCount > 0 ? totalCents % participantCount : 0;
      trip.participants = remaining.map((participant: TripParticipant, index: number) => ({
        ...participant,
        shareAmount:
          participantCount > 0
            ? (baseCents + (index < remainingCents ? 1 : 0)) / 100
            : 0,
      }));
      await updateDocument('trips', trip);

      for (const participant of trip.participants) {
        if (participant.uid === ownerUid) continue;
        const oldShare = oldParticipants.get(participant.uid) || 0;
        const delta = Math.round((participant.shareAmount - oldShare) * 100) / 100;
        if (delta === 0) continue;
        const balanceId: string = [ownerUid, participant.uid].sort().join('_');
        const balance: Balance | null = await getDocument<Balance>('balances', balanceId);
        if (!balance) continue;
        if (balance.uid1 === ownerUid) {
          balance.netAmount -= delta;
        } else {
          balance.netAmount += delta;
        }
        await updateDocument('balances', balance);
      }
    }

    await deleteDocument('balances', [ownerUid, guestUid].sort().join('_'));
    await deleteDocument('guests', guest.id);
    return NextResponse.json({ success: true, data: { id: guest.id } });
  } catch (error: unknown) {
    console.error('Guests DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete guest' },
      { status: 500 }
    );
  }
}
