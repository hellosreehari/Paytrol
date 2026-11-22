import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createDocument, queryDocuments, getDocument, updateDocument } from '@/lib/cosmos';
import type { Trip, UserProfile, Balance } from '@/types';
import { generateId } from '@/lib/utils';

// Helper to get normalized balance key
function getBalanceKey(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join('_');
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = (session?.user as any)?.uid || (session ? 'demo-user' : null);

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const trips = await queryDocuments<Trip>(
      'trips',
      'SELECT * FROM c WHERE c.creatorUid = @uid OR ARRAY_CONTAINS(c.participants, {"uid": @uid}, true) ORDER BY c.createdAt DESC',
      [{ name: '@uid', value: uid }]
    );

    return NextResponse.json({ success: true, data: trips });
  } catch (error: any) {
    console.error('Trips GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = (session?.user as any)?.uid || (session ? 'demo-user' : null);

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const trip: Trip = {
      id: generateId(),
      creatorUid: uid,
      creatorName: session?.user?.name || 'Driver',
      photoURL: body.photoURL || '',
      distanceKm: Number(body.distanceKm) || 0,
      avgMileageKmpl: Number(body.avgMileageKmpl) || 0,
      fuelPricePerLiter: Number(body.fuelPricePerLiter) || 105.0,
      fuelUsedLiters: Number(body.fuelUsedLiters) || 0,
      totalCost: Number(body.totalCost) || 0,
      splitMode: body.splitMode || 'equal',
      participants: body.participants || [],
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
        };
        await createDocument('balances', newBalance as any);
      }
    }

    return NextResponse.json({ success: true, data: savedTrip });
  } catch (error: any) {
    console.error('Trips POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
