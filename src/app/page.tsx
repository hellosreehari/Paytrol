'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { isAuthenticated, isLoading, needsSetup, signInGoogle, signInDemo } = useAuth();
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
      <div className="min-h-screen flex items-center justify-center bg-[#090d16]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Loading Paytrol...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between px-6 py-12 max-w-md mx-auto">
      {/* Top Brand Hero */}
      <div className="pt-8 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-xl shadow-indigo-600/30 border border-indigo-400/30 shrink-0">
          <svg width={40} height={40} className="w-10 h-10 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Paytrol
          </h1>
          <p className="text-indigo-400 text-sm font-semibold tracking-wide uppercase mt-1">
            Trip Fuel Cost Splitter
          </p>
        </div>

        <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
          Snap your car dashboard cluster. Let Vision AI extract distance and mileage, verify numbers in one tap, and split with friends.
        </p>
      </div>

      {/* Feature Pills */}
      <div className="my-8 space-y-2.5 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <span className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
            1
          </span>
          <span>Snap cluster photo with framing guide</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <span className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
            2
          </span>
          <span>Gemini Vision AI extracts trip & avg fuel economy</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <span className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
            3
          </span>
          <span>Mandatory Verification Gate & real-time math</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <span className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
            4
          </span>
          <span>Equal/Custom split & 1-tap UPI settlement</span>
        </div>
      </div>

      {/* Auth Actions */}
      <div className="space-y-3">
        {/* Google OAuth Login */}
        <button
          onClick={signInGoogle}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-900 font-semibold rounded-2xl transition-all shadow-lg text-sm"
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

        {/* Demo Fast Login */}
        <button
          onClick={signInDemo}
          className="w-full py-3 px-4 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 font-medium rounded-2xl transition-all border border-slate-700/60 text-xs flex items-center justify-center gap-2"
        >
          <span>⚡ Try Demo Account (Instant Login)</span>
        </button>

        <p className="text-[11px] text-center text-slate-500 pt-2">
          PWA Enabled • Add to homescreen for full-screen camera
        </p>
      </div>
    </div>
  );
}
