import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createDocument, queryDocuments, getDocument, updateDocument } from '@/lib/cosmos';
import type { Trip, TripParticipant, UserProfile, Balance } from '@/types';
import { generateId } from '@/lib/utils';

// Helper to get normalized balance key
function getBalanceKey(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join('_');
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

    return NextResponse.json({ success: true, data: trips });
  } catch (error: unknown) {
    console.error('Trips GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load trips' },
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
    const participants = Array.isArray(body.participants) ? body.participants : [];

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
