import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createDocument, queryDocuments, getDocument, updateDocument, deleteDocument, equalsIgnoreCase } from '@/lib/cosmos';
import type { Friendship, UserProfile } from '@/types';
import { generateId } from '@/lib/utils';

/**
 * Every friendship document involving this user, filtered in code so the
 * result is exact on both Cosmos and the in-memory store.
 */
async function getRelationships(uid: string, email: string | undefined): Promise<Friendship[]> {
  const docs = await queryDocuments<Friendship>(
    'friendships',
    'SELECT * FROM c WHERE c.fromUid = @me OR c.toUid = @me OR LOWER(c.toEmail) = @myEmail',
    [
      { name: '@me', value: uid },
      { name: '@myEmail', value: email || '' },
    ],
    {
      $or: [
        { fromUid: uid },
        { toUid: uid },
        ...(email ? [{ toEmail: equalsIgnoreCase(email) }] : [{ toEmail: '' }]),
      ],
    }
  );
  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return (
      doc.fromUid === uid ||
      doc.toUid === uid ||
      (!!email && doc.toEmail?.toLowerCase() === email && doc.fromUid !== uid)
    );
  });
}

/** A stable key for "the other person" so mutual invites collapse into one entry. */
function otherPartyKey(doc: Friendship, uid: string): string {
  if (doc.fromUid === uid) return doc.toUid || doc.toEmail.toLowerCase();
  return doc.fromUid;
}

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
        [{ name: '@email', value: email }],
        { toEmail: email, $or: [{ toUid: null }, { toUid: '' }] }
      );
      for (const inv of unlinkedInvites) {
        inv.toUid = uid;
        inv.toName = session?.user?.name || inv.toName;
        inv.toPhoto = session?.user?.image || inv.toPhoto;
        inv.updatedAt = new Date().toISOString();
        await updateDocument('friendships', inv);
      }
    }

    const relationships = await getRelationships(uid, email);

    // One entry per person: mutual or repeated invites must not show twice.
    const friends: Friendship[] = [];
    const friendKeys = new Set<string>();
    for (const doc of relationships) {
      if (doc.status !== 'accepted') continue;
      const key = otherPartyKey(doc, uid);
      if (friendKeys.has(key)) continue;
      friendKeys.add(key);
      friends.push(doc);
    }
    const pendingSent = relationships.filter(
      (doc) => doc.status === 'pending' && doc.fromUid === uid && !friendKeys.has(otherPartyKey(doc, uid))
    );
    const pendingReceived = relationships.filter(
      (doc) => doc.status === 'pending' && doc.fromUid !== uid && !friendKeys.has(otherPartyKey(doc, uid))
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

    // Check if invite or friendship already exists, in either direction
    const myEmail = session?.user?.email?.toLowerCase();
    const existing = (await getRelationships(uid, myEmail)).filter((invite) =>
      invite.fromUid === uid
        ? invite.toEmail.toLowerCase() === targetEmail
        : invite.fromEmail?.toLowerCase() === targetEmail
    );

    // They already invited us: accept that invite instead of creating a second one.
    const theirInvite = existing.find((invite) => invite.status === 'pending' && invite.fromUid !== uid);
    if (theirInvite && !existing.some((invite) => invite.status === 'accepted')) {
      theirInvite.status = 'accepted';
      theirInvite.toUid = uid;
      theirInvite.updatedAt = new Date().toISOString();
      const accepted = await updateDocument('friendships', theirInvite);
      return NextResponse.json({
        success: true,
        data: accepted,
        message: `${theirInvite.fromName || 'They'} had already invited you, so you're now friends.`,
      });
    }

    if (existing.some((invite) => invite.status === 'accepted')) {
      return NextResponse.json(
        { success: false, error: 'You are already friends with this person!' },
        { status: 400 }
      );
    }
    if (existing.some((invite) => invite.status === 'pending')) {
      return NextResponse.json(
        { success: false, error: 'An invite is already pending with this person.' },
        { status: 400 }
      );
    }
    // A previously declined invite no longer blocks a new one.
    for (const declined of existing.filter((invite) => invite.status === 'declined')) {
      await deleteDocument('friendships', declined.id);
    }

    // Check if target user already exists in database
    const targetUsers = await queryDocuments<UserProfile>(
      'users',
      'SELECT * FROM c WHERE c.email = @email',
      [{ name: '@email', value: targetEmail }],
      { email: targetEmail }
    );
    const targetUser = targetUsers[0] || null;

    const friendship: Friendship = {
      id: generateId(),
      fromUid: uid,
      fromName: session?.user?.name || 'Driver',
      fromEmail: myEmail || 'driver@paytrol.app',
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

    // No email is sent yet: the invite appears in the app when they sign in with this email.
    return NextResponse.json({
      success: true,
      data: created,
      message: targetUser
        ? 'Invite sent. They’ll see it in Paytrol under Received.'
        : 'Invite saved. It will appear when they sign in to Paytrol with this email.',
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
