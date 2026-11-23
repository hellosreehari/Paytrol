'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { isAuthenticated, isLoading, needsSetup, signInGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (needsSetup) {
        router.push('/setup');
      } else {
        router.push('/home');
      }
    }
  }, [isAuthenticated, isLoading, needsSetup, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f1]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Loading Paytrol...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col justify-center px-6 py-10 max-w-md mx-auto">
      <div className="space-y-10">
        <div className="space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-[#315e52] text-white flex items-center justify-center border border-[#315e52] shadow-sm">
            <svg width={24} height={24} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#315e52] uppercase tracking-[0.18em]">Paytrol</p>
            <h1 className="text-4xl font-semibold tracking-tight text-[#1b231f]">Split the fuel.<br />Keep the trip simple.</h1>
            <p className="text-sm text-slate-500 leading-6 max-w-sm">
              Scan your dashboard, verify the numbers, and settle shared trips with friends.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            ['01', 'Scan'],
            ['02', 'Verify'],
            ['03', 'Split'],
          ].map(([number, label]) => (
            <div key={number} className="rounded-2xl border border-[#dde4dd] bg-white px-3 py-4 shadow-sm">
              <p className="text-[10px] font-semibold text-slate-400">{number}</p>
              <p className="mt-2 text-sm font-medium text-[#526158]">{label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
        {/* Google OAuth Login */}
        <button
          onClick={signInGoogle}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-900 font-semibold rounded-xl transition-all text-sm"
        >
          <svg width={20} height={20} className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <p className="text-[11px] text-center text-slate-600 pt-1">Add Paytrol to your home screen for the best experience.</p>
      </div>
      </div>
    </main>
  );
}
