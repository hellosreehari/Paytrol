'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { Trip } from '@/types';
import { CheckCircleIcon } from '@/components/icons';

interface NormalizedBalance {
  id: string;
  odataId: string;
  friendUid: string;
  friendName: string;
  friendPhoto: string | null;
  isGuest?: boolean;
  amount: number; // positive = friend owes you, negative = you owe friend
}

export default function BalancesPage() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<NormalizedBalance[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [expandedFriendUid, setExpandedFriendUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchBalancesList = async (): Promise<boolean> => {
    try {
      const [balancesRes, tripsRes] = await Promise.all([
        fetch('/api/balances'),
        fetch('/api/trips'),
      ]);
      const [balancesData, tripsData] = await Promise.all([
        balancesRes.json(),
        tripsRes.json(),
      ]);
      if (!balancesRes.ok || !balancesData.success || !Array.isArray(balancesData.data)) {
        throw new Error(balancesData.error || 'Could not load balances.');
      }
      setBalances(balancesData.data);
      setTrips(tripsData.success && Array.isArray(tripsData.data) ? tripsData.data : []);
      return true;
    } catch (error: unknown) {
      console.error('Failed to load balances:', error);
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not load balances.',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalancesList();
  }, []);

  const handleSettle = async (balanceId: string) => {
    setSettlingId(balanceId);
    setFeedback(null);
    try {
      const res = await fetch('/api/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balanceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not update this balance.');
      }
      if (await fetchBalancesList()) {
        setFeedback({ type: 'success', message: 'Balance marked as settled.' });
      }
    } catch (error: unknown) {
      console.error('Error settling balance:', error);
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not update this balance.',
      });
    } finally {
      setSettlingId(null);
    }
  };

  const totalOwedToYou = balances
    .filter((b) => b.amount > 0)
    .reduce((sum, b) => sum + b.amount, 0);

  const totalYouOwe = balances
    .filter((b) => b.amount < 0)
    .reduce((sum, b) => sum + Math.abs(b.amount), 0);

  const activeBalances = balances.filter((b) => Math.abs(b.amount) > 0.01);
  const currentUserId = user?.uid || '';

  const getTripBreakdown = (friendUid: string) => {
    return trips
      .filter((trip) =>
        trip.creatorUid === friendUid
          ? trip.participants.some((participant) => participant.uid === currentUserId)
          : trip.creatorUid === currentUserId
            ? trip.participants.some((participant) => participant.uid === friendUid)
            : false
      )
      .map((trip) => {
        const friendParticipant =
          trip.creatorUid === currentUserId
            ? trip.participants.find((participant) => participant.uid === friendUid)
            : trip.participants.find((participant) => participant.uid === currentUserId);

        if (!friendParticipant) return null;
        return {
          trip,
          amount: friendParticipant.shareAmount || 0,
          friendOwesYou: trip.creatorUid === currentUserId,
        };
      })
      .filter(
        (item): item is { trip: Trip; amount: number; friendOwesYou: boolean } => item !== null
      )
      .sort(
        (a, b) =>
          new Date(b.trip.createdAt).getTime() - new Date(a.trip.createdAt).getTime()
      );
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-ink">Balances &amp; Settlements</h1>
        <p className="text-xs text-muted mt-1">
          Net amounts across your trips. Record payments here when they’re settled.
        </p>
      </header>

      {feedback && (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-xl border px-3.5 py-3 text-xs',
            feedback.type === 'success'
              ? 'border-line-strong bg-canvas text-ink-soft'
              : 'border-danger-line bg-danger-soft text-danger'
          )}
        >
          {feedback.message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-surface-soft border border-line p-4 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Owed to you
          </span>
          <p className="text-2xl font-black text-ink">{formatCurrency(totalOwedToYou)}</p>
          <p className="text-[10px] text-muted">From shared fuel bills</p>
        </div>
        <div className="rounded-3xl bg-warning-soft border border-warning-line p-4 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-warning">
            You owe
          </span>
          <p className="text-2xl font-black text-ink">{formatCurrency(totalYouOwe)}</p>
          <p className="text-[10px] text-warning">To friends</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-semibold uppercase tracking-wider">Net Friend Balances</span>
          <span>{activeBalances.length} active</span>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-28 bg-surface rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : activeBalances.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line p-10 text-center space-y-2">
            <CheckCircleIcon size={36} strokeWidth={1.6} className="mx-auto text-primary" />
            <p className="text-sm font-semibold text-ink">All balances are settled!</p>
            <p className="text-xs text-muted max-w-xs mx-auto">
              When you or your friends split trips, the net balances will automatically update here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeBalances.map((bal, idx) => {
              const isOwed = bal.amount > 0;
              const absAmount = Math.abs(bal.amount);
              return (
                <div
                  key={`${bal.odataId || bal.id}-${idx}`}
                  className="rounded-3xl bg-surface border border-line p-4 space-y-3 shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {bal.friendPhoto ? (
                        <img src={bal.friendPhoto} alt="" className="w-11 h-11 rounded-2xl border border-line" />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-primary-soft text-primary flex items-center justify-center font-bold text-base">
                          {bal.friendName?.[0] || 'F'}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-ink">{bal.friendName}</p>
                        {bal.isGuest && (
                          <p className="text-[10px] text-muted">Guest · tracked by name</p>
                        )}
                        <p className={cn('text-xs font-semibold text-muted')}>
                          {isOwed ? `${bal.friendName} owes you` : `You owe ${bal.friendName}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-xl font-black text-ink')}>
                        {formatCurrency(absAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedFriendUid((current) =>
                          current === bal.friendUid ? null : bal.friendUid
                        )
                      }
                      className="text-xs font-semibold text-primary hover:text-primary-hover"
                    >
                      {expandedFriendUid === bal.friendUid ? 'Hide split' : 'View split'}
                    </button>
                    {isOwed || bal.isGuest ? (
                      <button
                        type="button"
                        onClick={() => handleSettle(bal.odataId)}
                        disabled={settlingId === bal.odataId}
                        className="text-xs font-semibold text-muted hover:text-ink-soft disabled:opacity-50"
                      >
                        {settlingId === bal.odataId ? 'Saving…' : 'Mark settled'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted">
                        {bal.friendName} marks this settled once paid
                      </span>
                    )}
                  </div>

                  {expandedFriendUid === bal.friendUid && (
                    <div className="rounded-2xl border border-line bg-canvas p-3 space-y-2">
                      {getTripBreakdown(bal.friendUid).length === 0 ? (
                        <p className="text-xs text-muted">No trip split details found.</p>
                      ) : (
                        getTripBreakdown(bal.friendUid).map(({ trip, amount, friendOwesYou }) => (
                          <div
                            key={trip.id}
                            className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0"
                          >
                            <div>
                              <p className="text-xs font-semibold text-ink">
                                {trip.distanceKm} km trip
                              </p>
                              <p className="text-[10px] text-muted">
                                {friendOwesYou ? 'Friend share' : 'Your share'} ·{' '}
                                {formatCurrency(trip.totalCost)} total
                              </p>
                            </div>
                            <p className="text-xs font-bold text-ink">
                              {friendOwesYou ? '+' : '−'}{formatCurrency(amount)}
                            </p>
                          </div>
                        ))
                      )}
                      <p className="pt-1 text-[10px] text-muted">
                        Net {formatCurrency(absAmount)} · opposite trip directions cancel automatically.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
