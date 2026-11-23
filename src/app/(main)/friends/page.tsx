'use client';

import { useState, useEffect, useId } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { Friendship, GuestContact } from '@/types';

export default function FriendsPage() {
  const { user } = useAuth();
  const emailInputId = useId();
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pendingSent, setPendingSent] = useState<Friendship[]>([]);
  const [pendingReceived, setPendingReceived] = useState<Friendship[]>([]);
  const [guestContacts, setGuestContacts] = useState<GuestContact[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [guestNameDraft, setGuestNameDraft] = useState('');
  const [guestEmailDraft, setGuestEmailDraft] = useState('');
  const [savingGuest, setSavingGuest] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmUnfriendId, setConfirmUnfriendId] = useState<string | null>(null);
  const [deletingFriendId, setDeletingFriendId] = useState<string | null>(null);
  const [confirmDeleteGuestId, setConfirmDeleteGuestId] = useState<string | null>(null);
  const [deletingGuestId, setDeletingGuestId] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchFriendsList = async () => {
    try {
      const [friendsRes, guestsRes] = await Promise.all([
        fetch('/api/friends'),
        fetch('/api/guests'),
      ]);
      const [data, guestsData] = await Promise.all([
        friendsRes.json(),
        guestsRes.json(),
      ]);
      if (data.success && data.data) {
        setFriends(data.data.friends || []);
        setPendingSent(data.data.pendingSent || []);
        setPendingReceived(data.data.pendingReceived || []);
      }
      if (guestsData.success && guestsData.data) setGuestContacts(guestsData.data);
    } catch (err) {
      console.error('Failed to load friends:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFriendsList();
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setSending(true);
    setBannerNotice(null);

    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send invite');
      }

      setBannerNotice({
        type: 'success',
        text: data.message || 'Invite dispatched! Added to Pending Sent.',
      });
      setInviteEmail('');
      fetchFriendsList();
    } catch (err: unknown) {
      setBannerNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not send invite.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleRespondInvite = async (friendshipId: string, action: 'accept' | 'decline') => {
    try {
      const res = await fetch('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId, action }),
      });
      const data = await res.json();
      if (data.success) {
        setBannerNotice({
          type: 'success',
          text: action === 'accept' ? 'Friend request accepted!' : 'Invite declined.',
        });
        fetchFriendsList();
      }
    } catch (err) {
      console.error('Error responding to invite:', err);
    }
  };

  const handleUnfriend = async (friendshipId: string) => {
    setDeletingFriendId(friendshipId);
    setBannerNotice(null);
    try {
      const res = await fetch('/api/friends', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not remove friend.');
      }
      setFriends((current) => current.filter((friend) => friend.id !== friendshipId));
      setConfirmUnfriendId(null);
      setBannerNotice({ type: 'success', text: 'Friend removed.' });
    } catch (error: unknown) {
      setBannerNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not remove friend.',
      });
    } finally {
      setDeletingFriendId(null);
    }
  };

  const handleDeleteGuest = async (guestId: string) => {
    setDeletingGuestId(guestId);
    setBannerNotice(null);
    try {
      const res = await fetch('/api/guests', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not delete guest.');
      }
      setGuestContacts((current) => current.filter((guest) => guest.id !== guestId));
      setConfirmDeleteGuestId(null);
      setBannerNotice({ type: 'success', text: 'Guest deleted and removed from trip splits.' });
    } catch (error: unknown) {
      setBannerNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not delete guest.',
      });
    } finally {
      setDeletingGuestId(null);
    }
  };

  const handleUpdateGuest = async (guest: GuestContact) => {
    setSavingGuest(true);
    setBannerNotice(null);
    try {
      const res = await fetch('/api/guests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: guest.id,
          name: guestNameDraft,
          email: guestEmailDraft.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not update guest.');
      }

      const updated = data.data as GuestContact;
      setGuestContacts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingGuestId(null);
      setBannerNotice({
        type: 'success',
        text: updated.linkedUid
          ? `${updated.name}’s account is linked. Their trip history and balance were transferred.`
          : updated.email
            ? 'Guest saved. Their trips and balance will link when they create an account with this email.'
            : 'Guest contact updated.',
      });
    } catch (error: unknown) {
      setBannerNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not update guest.',
      });
    } finally {
      setSavingGuest(false);
    }
  };

  const currentUserId = user?.uid || '';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-ink">Friends</h1>
        <p className="mt-1 text-xs text-muted">
          Add friends by email to split fuel costs and track balances.
        </p>
      </header>

      {bannerNotice && (
        <div
          role="status"
          className={cn(
            'flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs',
            bannerNotice.type === 'success'
              ? 'border-primary-line bg-primary-soft text-primary'
              : 'border-danger-line bg-danger-soft text-danger'
          )}
        >
          <span aria-hidden="true">{bannerNotice.type === 'success' ? '✓' : '!'}</span>
          <span>{bannerNotice.text}</span>
        </div>
      )}

      {/* Invite */}
      <form onSubmit={handleSendInvite} className="space-y-2">
        <label htmlFor={emailInputId} className="block text-xs font-semibold text-muted">
          Invite a friend
        </label>
        <div className="flex gap-2">
          <input
            id={emailInputId}
            type="email"
            required
            placeholder="friend@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary"
          />
          <button type="submit" disabled={sending || !inviteEmail} className={BTN_PRIMARY}>
            {sending ? 'Sending…' : 'Invite'}
          </button>
        </div>
        <p className="px-1 text-[11px] text-muted">
          They&apos;ll see it in Paytrol when they sign in with this email.
        </p>
      </form>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-soft" />
          ))}
        </div>
      ) : (
        <>
          {/* Requests for me: only shown when there are any */}
          {pendingReceived.length > 0 && (
            <Section title="Requests" count={pendingReceived.length}>
              {pendingReceived.map((f) => (
                <Row
                  key={f.id}
                  name={f.fromName}
                  subtitle={f.fromEmail}
                  photo={f.fromPhoto}
                  actions={
                    <>
                      <button type="button" onClick={() => handleRespondInvite(f.id, 'decline')} className={BTN_SECONDARY}>
                        Decline
                      </button>
                      <button type="button" onClick={() => handleRespondInvite(f.id, 'accept')} className={BTN_PRIMARY}>
                        Accept
                      </button>
                    </>
                  }
                />
              ))}
            </Section>
          )}

          <Section title="Friends" count={friends.length}>
            {friends.length === 0 ? (
              <Empty>No friends yet. Invite someone above to get started.</Empty>
            ) : (
              friends.map((f) => {
                const isFrom = f.fromUid === currentUserId;
                const fName = (isFrom ? f.toName : f.fromName) || 'Friend';
                return (
                  <Row
                    key={f.id}
                    name={fName}
                    subtitle={isFrom ? f.toEmail : f.fromEmail}
                    photo={isFrom ? f.toPhoto : f.fromPhoto}
                    actions={
                      confirmUnfriendId === f.id ? (
                        <>
                          <button type="button" onClick={() => setConfirmUnfriendId(null)} className={BTN_SECONDARY}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUnfriend(f.id)}
                            disabled={deletingFriendId === f.id}
                            className={BTN_DANGER}
                          >
                            {deletingFriendId === f.id ? 'Removing…' : 'Remove'}
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmUnfriendId(f.id)} className={BTN_SECONDARY}>
                          Remove
                        </button>
                      )
                    }
                  />
                );
              })
            )}
          </Section>

          {/* Invites I sent: only shown when there are any */}
          {pendingSent.length > 0 && (
            <Section title="Invites sent" count={pendingSent.length}>
              {pendingSent.map((f) => (
                <Row
                  key={f.id}
                  name={f.toName || f.toEmail}
                  subtitle={f.toEmail}
                  photo={f.toPhoto}
                  actions={<span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning">Waiting</span>}
                />
              ))}
            </Section>
          )}
        </>
      )}

      <Section
        title="Guests"
        count={guestContacts.length}
        hint="Add an email later to link their trips and balance when they join Paytrol."
      >
        {guestContacts.length === 0 ? (
          <Empty>Guests you add while splitting a trip will show up here.</Empty>
        ) : (
          guestContacts.map((guest) =>
            editingGuestId === guest.id ? (
              <form
                key={guest.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  handleUpdateGuest(guest);
                }}
                className="space-y-3 rounded-2xl border border-line bg-surface p-4"
              >
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium text-muted">Name</span>
                  <input
                    value={guestNameDraft}
                    onChange={(event) => setGuestNameDraft(event.target.value)}
                    maxLength={80}
                    required
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-primary"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium text-muted">Email (optional)</span>
                  <input
                    type="email"
                    value={guestEmailDraft}
                    onChange={(event) => setGuestEmailDraft(event.target.value)}
                    disabled={Boolean(guest.linkedUid)}
                    placeholder="friend@example.com"
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-primary disabled:opacity-60"
                  />
                </label>
                {guest.linkedUid && (
                  <p className="text-[11px] text-muted">A linked account&apos;s email can&apos;t be changed.</p>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingGuestId(null)} className={BTN_SECONDARY}>
                    Cancel
                  </button>
                  <button type="submit" disabled={savingGuest} className={BTN_PRIMARY}>
                    {savingGuest ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              <Row
                key={guest.id}
                name={guest.name}
                subtitle={guest.linkedUid ? 'Account linked' : guest.email || 'No email added'}
                actions={
                  confirmDeleteGuestId === guest.id ? (
                    <>
                      <button type="button" onClick={() => setConfirmDeleteGuestId(null)} className={BTN_SECONDARY}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGuest(guest.id)}
                        disabled={deletingGuestId === guest.id}
                        className={BTN_DANGER}
                      >
                        {deletingGuestId === guest.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGuestId(guest.id);
                          setGuestNameDraft(guest.name);
                          setGuestEmailDraft(guest.email || '');
                        }}
                        className={BTN_SECONDARY}
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteGuestId(guest.id)} className={BTN_SECONDARY}>
                        Delete
                      </button>
                    </>
                  )
                }
              />
            )
          )
        )}
      </Section>
    </div>
  );
}

// One button style per role, used everywhere on this page.
const BTN_BASE =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-xl px-3.5 text-xs font-semibold transition-colors disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-on-primary hover:bg-primary-hover`;
const BTN_SECONDARY = `${BTN_BASE} border border-line bg-surface text-ink hover:bg-surface-soft`;
const BTN_DANGER = `${BTN_BASE} bg-danger text-on-primary hover:bg-danger-hover`;

function Section({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          {title}
          {count ? (
            <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-semibold text-muted">
              {count}
            </span>
          ) : null}
        </h2>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  name,
  subtitle,
  photo,
  actions,
}: {
  name: string;
  subtitle?: string | null;
  photo?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="flex min-w-0 items-center gap-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-full" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">
            {name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-6 text-center text-xs text-muted">
      {children}
    </div>
  );
}
