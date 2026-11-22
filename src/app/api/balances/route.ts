import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { queryDocuments, getDocument, updateDocument } from '@/lib/cosmos';
import type { Balance } from '@/types';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || (session ? 'demo-user' : null);

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const balances = await queryDocuments<Balance>(
      'balances',
      'SELECT * FROM c WHERE c.uid1 = @uid OR c.uid2 = @uid',
      [{ name: '@uid', value: uid }]
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
      const amount = isUid1 ? -b.netAmount : b.netAmount;

      return {
        id: b.odataId,
        odataId: b.odataId,
        friendUid,
        friendName,
        friendPhoto,
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
    const uid = session?.user?.uid || (session ? 'demo-user' : null);

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { balanceId } = body;

    if (!balanceId) {
      return NextResponse.json({ success: false, error: 'Balance ID is required' }, { status: 400 });
    }

    const balance = await getDocument<Balance>('balances', balanceId);
    if (!balance) {
      return NextResponse.json({ success: false, error: 'Balance record not found' }, { status: 404 });
    }
    if (balance.uid1 !== uid && balance.uid2 !== uid) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    balance.netAmount = 0;
    const updated = await updateDocument('balances', balance);

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    console.error('Balances POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to settle balance' },
      { status: 500 }
    );
  }
}
