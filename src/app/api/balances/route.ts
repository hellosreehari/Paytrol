import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createDocument, queryDocuments, upsertDocumentAtomically } from '@/lib/db';
import { roundMoney } from '@/lib/money';
import { generateId } from '@/lib/utils';
import type { Balance, Settlement } from '@/types';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const balances = await queryDocuments<Balance>(
      'balances',
      { $or: [{ uid1: uid }, { uid2: uid }] }
    );

    // Normalize from the current user's perspective:
    // positive amount = friend owes you
    // negative amount = you owe friend
    const normalized = balances.map((b) => {
      const isUid1 = b.uid1 === uid;
      const friendUid = isUid1 ? b.uid2 : b.uid1;
      const friendName = isUid1 ? b.name2 : b.name1;
      const friendPhoto = isUid1 ? b.photo2 : b.photo1;
      // In our trip route:
      // uid1 created trip, uid2 owes uid1 `share`, recorded as b.netAmount = -share.
      // So if current user is uid1: netAmount is negative, so amount = -b.netAmount (positive = they owe you).
      // If current user is uid2: amount = b.netAmount (negative = you owe uid1).
      const amount = roundMoney(isUid1 ? -b.netAmount : b.netAmount);

      return {
        id: b.odataId,
        odataId: b.odataId,
        friendUid,
        friendName,
        friendPhoto,
        isGuest: b.guestUid === friendUid,
        amount,
      };
    });

    return NextResponse.json({ success: true, data: normalized });
  } catch (error: unknown) {
    console.error('Balances GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load balances' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { balanceId } = body;

    if (!balanceId || typeof balanceId !== 'string') {
      return NextResponse.json({ success: false, error: 'Balance ID is required' }, { status: 400 });
    }

    let failure: { error: string; status: number } | null = null;
    let settledAmount = 0;
    let debtorUid = '';
    let otherUidForRecord = '';
    const updated = await upsertDocumentAtomically<Balance>('balances', balanceId, (balance) => {
      failure = null;
      if (!balance) {
        failure = { error: 'Balance record not found', status: 404 };
        return null;
      }
      if (balance.uid1 !== uid && balance.uid2 !== uid) {
        failure = { error: 'Forbidden', status: 403 };
        return null;
      }
      // Positive netAmount means uid1 owes uid2. Only the person who is owed
      // can mark the debt as settled, so nobody can clear their own debt.
      const amountOwedToMe = roundMoney(balance.uid1 === uid ? -balance.netAmount : balance.netAmount);
      const otherUid = balance.uid1 === uid ? balance.uid2 : balance.uid1;
      const otherIsGuest = Boolean(balance.guestUid) && balance.guestUid === otherUid;
      if (amountOwedToMe < 0 && !otherIsGuest) {
        failure = {
          error: 'Only the person who is owed can mark this balance as settled.',
          status: 403,
        };
        return null;
      }
      settledAmount = Math.abs(amountOwedToMe);
      debtorUid = amountOwedToMe >= 0 ? otherUid : uid;
      otherUidForRecord = otherUid;
      balance.netAmount = 0;
      return balance;
    });

    const rejected = failure as { error: string; status: number } | null;
    if (rejected) {
      const { error, status } = rejected;
      return NextResponse.json({ success: false, error }, { status });
    }

    // Keep a record of every settlement instead of silently zeroing the balance.
    if (settledAmount > 0) {
      const settlement: Settlement = {
        id: generateId(),
        balanceId,
        fromUid: debtorUid,
        toUid: debtorUid === uid ? otherUidForRecord : uid,
        amount: settledAmount,
        recordedBy: uid,
        createdAt: new Date().toISOString(),
      };
      try {
        await createDocument('settlements', settlement);
      } catch (e) {
        console.warn('Could not record settlement:', e);
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    console.error('Balances POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to settle balance' },
      { status: 500 }
    );
  }
}
