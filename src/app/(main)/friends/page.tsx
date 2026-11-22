'use client';

import { useState, useEffect, useId } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { Friendship } from '@/types';

type Tab = 'friends' | 'sent' | 'received';

export default function FriendsPage() {
  const { user } = useAuth();
  const emailInputId = useId();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pendingSent, setPendingSent] = useState<Friendship[]>([]);
  const [pendingReceived, setPendingReceived] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchFriendsList = async () => {
    try {
      const res = await fetch('/api/friends');
      const data = await res.json();
      if (data.success && data.data) {
        setFriends(data.data.friends || []);
        setPendingSent(data.data.pendingSent || []);
        setPendingReceived(data.data.pendingReceived || []);
      }
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
      setTab('sent');
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

  const currentUserId = user?.uid || 'demo-user';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-white">Friends Network</h1>
        <p className="text-xs text-slate-400 mt-1">
          Add friends by email to split fuel bills and track balances.
        </p>
      </header>

      {bannerNotice && (
        <div
          className={cn(
            'p-3.5 rounded-2xl text-xs flex items-start gap-2.5 transition-all',
            bannerNotice.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
              : 'bg-red-500/15 border border-red-500/40 text-red-200'
          )}
        >
          <span>{bannerNotice.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{bannerNotice.text}</span>
        </div>
      )}

      {/* Send Invite Form */}
      <form onSubmit={handleSendInvite} className="space-y-2">
        <label
          htmlFor={emailInputId}
          className="text-xs font-semibold text-slate-300 uppercase tracking-wider block cursor-pointer"
        >
          Send Email Invite
        </label>
        <div className="flex gap-2">
          <input
            id={emailInputId}
            type="email"
            required
            placeholder="friend@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={sending || !inviteEmail}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-2xl text-xs transition-all shadow-md shrink-0"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 px-1">
          Existing users get an in-app invite; new users get a deep link to install and auto-connect.
        </p>
      </form>

      {/* Tabs */}
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1 bg-slate-900/80 border border-slate-800 p-1 rounded-2xl">
          <button
            onClick={() => setTab('friends')}
            className={cn(
              'py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
              tab === 'friends'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <span>Friends</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20">
              {friends.length}
            </span>
          </button>

          <button
            onClick={() => setTab('sent')}
            className={cn(
              'py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
              tab === 'sent'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <span>Sent</span>
            {pendingSent.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-200 font-bold">
                {pendingSent.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('received')}
            className={cn(
              'py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
              tab === 'received'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <span>Received</span>
            {pendingReceived.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 font-bold">
                {pendingReceived.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-slate-900/60 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Tab: Friends */}
            {tab === 'friends' && (
              <>
                {friends.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                    No active friends yet. Enter an email above to send your first invite!
                  </div>
                ) : (
                  friends.map((f) => {
                    const isFrom = f.fromUid === currentUserId;
                    const fName = isFrom ? f.toName : f.fromName;
                    const fEmail = isFrom ? f.toEmail : f.fromEmail;
                    const fPhoto = isFrom ? f.toPhoto : f.fromPhoto;

                    return (
                      <div
                        key={f.id}
                        className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          {fPhoto ? (
                            <img src={fPhoto} alt="" className="w-10 h-10 rounded-full border border-slate-700" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-indigo-600/20 text-indigo-400 font-bold flex items-center justify-center">
                              {fName?.[0] || 'F'}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-semibold text-white">{fName}</p>
                            <p className="text-xs text-slate-500">{fEmail}</p>
                          </div>
                        </div>

                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                          Active Friend
                        </span>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* Tab: Pending Sent */}
            {tab === 'sent' && (
              <>
                {pendingSent.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                    No pending invites sent.
                  </div>
                ) : (
                  pendingSent.map((f) => (
                    <div
                      key={f.id}
                      className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{f.toEmail}</p>
                        <p className="text-[11px] text-amber-400/90 flex items-center gap-1 mt-0.5">
                          <span>⏳ Awaiting friend sign-up or accept</span>
                        </p>
                      </div>

                      <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-full border border-amber-500/30">
                        Pending
                      </span>
                    </div>
                  ))
                )}
              </>
            )}

            {/* Tab: Pending Received */}
            {tab === 'received' && (
              <>
                {pendingReceived.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                    No incoming requests right now.
                  </div>
                ) : (
                  pendingReceived.map((f) => (
                    <div
                      key={f.id}
                      className="p-3.5 rounded-2xl bg-slate-900/80 border border-indigo-500/30 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {f.fromPhoto ? (
                          <img src={f.fromPhoto} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300">
                            {f.fromName?.[0] || 'F'}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-white">{f.fromName}</p>
                          <p className="text-xs text-slate-400">{f.fromEmail}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRespondInvite(f.id, 'accept')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleRespondInvite(f.id, 'decline')}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
