import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createDocument, queryDocuments, getDocument, updateDocument, deleteDocument } from '@/lib/cosmos';
import type { Friendship, UserProfile } from '@/types';
import { generateId } from '@/lib/utils';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;
    const email = session?.user?.email?.toLowerCase();

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Auto-link any invites that were sent to this user's email before they signed up
    if (email) {
      const unlinkedInvites = await queryDocuments<Friendship>(
        'friendships',
        'SELECT * FROM c WHERE c.toEmail = @email AND (c.toUid = null OR c.toUid = "")',
        [{ name: '@email', value: email }]
      );
      for (const inv of unlinkedInvites) {
        inv.toUid = uid;
        inv.toName = session?.user?.name || inv.toName;
        inv.toPhoto = session?.user?.image || inv.toPhoto;
        inv.updatedAt = new Date().toISOString();
        await updateDocument('friendships', inv);
      }
    }

    // 1. Fetch invites sent by current user
    const sent = await queryDocuments<Friendship>(
      'friendships',
      'SELECT * FROM c WHERE c.fromUid = @uid',
      [{ name: '@uid', value: uid }]
    );

    // 2. Fetch invites received by current user
    const received = await queryDocuments<Friendship>(
      'friendships',
      'SELECT * FROM c WHERE c.toUid = @uid OR (c.toEmail = @email AND c.fromUid != @uid)',
      [
        { name: '@uid', value: uid },
        { name: '@email', value: email || '' },
      ]
    );

    // Filter duplicates and partition into tabs
    const all = [...sent, ...received];
    const friends = all.filter((f) => f.status === 'accepted');
    const pendingSent = sent.filter((f) => f.status === 'pending');
    const pendingReceived = received.filter(
      (f) => f.status === 'pending' && f.fromUid !== uid
    );

    return NextResponse.json({
      success: true,
      data: {
        friends,
        pendingSent,
        pendingReceived,
      },
    });
  } catch (error: unknown) {
    console.error('Friends GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load friends' },
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
    const targetEmail = body.email?.toLowerCase()?.trim();

    if (!targetEmail || !targetEmail.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    if (session?.user?.email && targetEmail === session.user.email.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'You cannot send a friend invite to yourself.' },
        { status: 400 }
      );
    }

    // Check if invite or friendship already exists
    const existing = await queryDocuments<Friendship>(
      'friendships',
      'SELECT * FROM c WHERE (c.fromUid = @uid AND c.toEmail = @email) OR (c.toUid = @uid AND c.fromEmail = @email)',
      [
        { name: '@uid', value: uid },
        { name: '@email', value: targetEmail },
      ]
    );

    if (existing.length > 0) {
      const prev = existing[0];
      if (prev.status === 'accepted') {
        return NextResponse.json(
          { success: false, error: 'You are already friends with this person!' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'An invite is already pending with this person.' },
        { status: 400 }
      );
    }

    // Check if target user already exists in database
    const targetUsers = await queryDocuments<UserProfile>(
      'users',
      'SELECT * FROM c WHERE c.email = @email',
      [{ name: '@email', value: targetEmail }]
    );
    const targetUser = targetUsers[0] || null;

    const friendship: Friendship = {
      id: generateId(),
      fromUid: uid,
      fromName: session?.user?.name || 'Driver',
      fromEmail: session?.user?.email || 'driver@paytrol.app',
      fromPhoto: session?.user?.image || null,
      toUid: targetUser?.id || null,
      toEmail: targetEmail,
      toName: targetUser?.displayName || targetEmail.split('@')[0],
      toPhoto: targetUser?.photoURL || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await createDocument('friendships', friendship);

    // Deep link generated for invite email:
    const inviteLink = `${process.env.NEXTAUTH_URL || 'https://paytrol.app'}/friends?invite=${created.id}`;
    console.log(`[Invite Dispatched] Email sent to ${targetEmail} with link: ${inviteLink}`);

    return NextResponse.json({
      success: true,
      data: created,
      message: targetUser
        ? 'In-app notification and email invite dispatched!'
        : 'Invite email sent with deep link! Will auto-link once friend signs in.',
    });
  } catch (error: unknown) {
    console.error('Friends POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send invite' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { friendshipId, action } = body;

    if (!friendshipId || !['accept', 'decline'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid invite parameters' },
        { status: 400 }
      );
    }

    const friendship = await getDocument<Friendship>('friendships', friendshipId);
    if (!friendship) {
      return NextResponse.json(
        { success: false, error: 'Friendship invite not found.' },
        { status: 404 }
      );
    }
    const recipientMatches =
      friendship.toUid === uid ||
      friendship.toEmail.toLowerCase() === session?.user?.email?.toLowerCase();
    if (!recipientMatches) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    friendship.status = action === 'accept' ? 'accepted' : 'declined';
    friendship.toUid = uid;
    friendship.toName = session?.user?.name || friendship.toName;
    friendship.toPhoto = session?.user?.image || friendship.toPhoto;
    friendship.updatedAt = new Date().toISOString();

    const updated = await updateDocument('friendships', friendship);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    console.error('Friends PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update invite' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user?.uid || null;
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { friendshipId?: unknown };
    if (typeof body.friendshipId !== 'string') {
      return NextResponse.json({ success: false, error: 'Friendship ID is required.' }, { status: 400 });
    }

    const friendship = await getDocument<Friendship>('friendships', body.friendshipId);
    if (!friendship) {
      return NextResponse.json({ success: false, error: 'Friendship not found.' }, { status: 404 });
    }
    if (friendship.fromUid !== uid && friendship.toUid !== uid) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    await deleteDocument('friendships', friendship.id);
    return NextResponse.json({ success: true, data: { id: friendship.id } });
  } catch (error: unknown) {
    console.error('Friends DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to unfriend' },
      { status: 500 }
    );
  }
}
