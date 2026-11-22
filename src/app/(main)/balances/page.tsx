'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, cn } from '@/lib/utils';

interface NormalizedBalance {
  id: string;
  odataId: string;
  friendUid: string;
  friendName: string;
  friendPhoto: string | null;
  amount: number; // positive = friend owes you, negative = you owe friend
}

export default function BalancesPage() {
  const [balances, setBalances] = useState<NormalizedBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const fetchBalancesList = async () => {
    try {
      const res = await fetch('/api/balances');
      const data = await res.json();
      if (data.success && data.data) {
        setBalances(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load balances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalancesList();
  }, []);

  const handleSettle = async (balanceId: string) => {
    setSettlingId(balanceId);
    try {
      const res = await fetch('/api/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balanceId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchBalancesList();
      }
    } catch (err) {
      console.error('Error settling balance:', err);
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-white">Balances &amp; Settlements</h1>
        <p className="text-xs text-slate-400 mt-1">
          Net amounts aggregated across all trips with 1-tap UPI settlement.
        </p>
      </header>

      {/* Aggregate Top Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-emerald-500/10 border border-emerald-500/30 p-4 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Owed to you
          </span>
          <p className="text-2xl font-black text-emerald-400">
            {formatCurrency(totalOwedToYou)}
          </p>
          <p className="text-[10px] text-emerald-300/80">From shared fuel bills</p>
        </div>

        <div className="rounded-3xl bg-rose-500/10 border border-rose-500/30 p-4 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">
            You owe
          </span>
          <p className="text-2xl font-black text-rose-400">
            {formatCurrency(totalYouOwe)}
          </p>
          <p className="text-[10px] text-rose-300/80">To friends</p>
        </div>
      </div>

      {/* Balance items list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-wider">Net Friend Balances</span>
          <span>{activeBalances.length} active</span>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-28 bg-slate-900/60 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : activeBalances.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-800 p-10 text-center space-y-2">
            <span className="text-3xl">🎉</span>
            <p className="text-sm font-semibold text-white">All balances are settled!</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              When you or your friends split trips, the net balances will automatically update here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeBalances.map((bal) => {
              const isOwed = bal.amount > 0;
              const absAmount = Math.abs(bal.amount);
              const upiLink = `upi://pay?pa=&pn=${encodeURIComponent(
                bal.friendName
              )}&am=${absAmount.toFixed(2)}&cu=INR&tn=Paytrol%20Fuel%20Settlement`;

              return (
                <div
                  key={bal.odataId}
                  className="rounded-3xl bg-slate-900/80 border border-slate-800 p-4 space-y-3 shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {bal.friendPhoto ? (
                        <img
                          src={bal.friendPhoto}
                          alt=""
                          className="w-11 h-11 rounded-2xl border border-slate-700"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-base">
                          {bal.friendName?.[0] || 'F'}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-white">{bal.friendName}</p>
                        <p
                          className={cn(
                            'text-xs font-semibold',
                            isOwed ? 'text-emerald-400' : 'text-rose-400'
                          )}
                        >
                          {isOwed ? `${bal.friendName} owes you` : `You owe ${bal.friendName}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p
                        className={cn(
                          'text-xl font-black',
                          isOwed ? 'text-emerald-400' : 'text-rose-400'
                        )}
                      >
                        {formatCurrency(absAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Actions for settlement */}
                  <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2">
                    {/* UPI Deep Link Button if you owe them */}
                    {!isOwed ? (
                      <a
                        href={upiLink}
                        className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30 active:scale-95 transition-all text-center"
                      >
                        <span>⚡ Pay via UPI</span>
                      </a>
                    ) : (
                      <button
                        onClick={() => {
                          const msg = `Hey ${bal.friendName}! You have a pending fuel balance of ${formatCurrency(absAmount)} on Paytrol.`;
                          if (navigator.share) {
                            navigator.share({ text: msg }).catch(() => {});
                          } else {
                            navigator.clipboard.writeText(msg);
                            alert('Reminder copied to clipboard!');
                          }
                        }}
                        className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
                      >
                        <span>💬 Send Reminder</span>
                      </button>
                    )}

                    {/* Mark as Settled Button */}
                    <button
                      onClick={() => handleSettle(bal.odataId)}
                      disabled={settlingId === bal.odataId}
                      className="py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-700/80 active:scale-95 transition-all"
                    >
                      {settlingId === bal.odataId ? (
                        <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>✓ Mark as Settled</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
