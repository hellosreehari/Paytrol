import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDocument, createDocument, updateDocument } from '@/lib/cosmos';
import { linkGuestContactsForUser } from '@/lib/guest-linking';
import type { UserProfile } from '@/types';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let user = await getDocument<UserProfile>('users', uid);

    if (!user && session?.user) {
      // Auto-initialize profile from session
      user = {
        id: uid,
        email: session.user.email || 'driver@paytrol.app',
        displayName: session.user.name || 'Driver',
        photoURL: session.user.image || null,
        defaultFuelType: 'petrol',
        currency: 'INR',
        lastFuelPrice: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await createDocument('users', user);
    }

    if (user) {
      await linkGuestContactsForUser(user);
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: unknown) {
    console.error('User GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load profile' },
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
    const existing = await getDocument<UserProfile>('users', uid);

    if (existing) {
      const updated: UserProfile = {
        ...existing,
        displayName: body.displayName ?? existing.displayName ?? session?.user?.name ?? 'Driver',
        photoURL: body.photoURL ?? existing.photoURL ?? session?.user?.image ?? null,
        defaultFuelType: body.defaultFuelType ?? existing.defaultFuelType ?? 'petrol',
        currency: body.currency ?? existing.currency ?? 'INR',
        lastFuelPrice: Number(body.lastFuelPrice) > 0
          ? Number(body.lastFuelPrice)
          : existing.lastFuelPrice,
        updatedAt: new Date().toISOString(),
      };
      const result = await updateDocument('users', updated);
      return NextResponse.json({ success: true, data: result });
    } else {
      const newUser: UserProfile = {
        id: uid,
        email: session?.user?.email || 'driver@paytrol.app',
        displayName: body.displayName || session?.user?.name || 'Driver',
        photoURL: body.photoURL || session?.user?.image || null,
        defaultFuelType: body.defaultFuelType || 'petrol',
        currency: body.currency || 'INR',
        lastFuelPrice: Number(body.lastFuelPrice) > 0 ? Number(body.lastFuelPrice) : 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = await createDocument('users', newUser);
      return NextResponse.json({ success: true, data: result });
    }
  } catch (error: unknown) {
    console.error('User POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update profile' },
      { status: 500 }
    );
  }
}
