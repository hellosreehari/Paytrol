'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { prefetchData, RESOURCES } from '@/lib/data-cache';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsSetup } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push('/');
      } else if (needsSetup) {
        router.push('/setup');
      }
    }
  }, [isAuthenticated, isLoading, needsSetup, router]);

  // Warm every tab's data in parallel as soon as we know who is signed in, so
  // switching tabs shows data straight away instead of a loading skeleton.
  const ready = !isLoading && isAuthenticated && !needsSetup;
  useEffect(() => {
    if (!ready) return;
    const refresh = () => prefetchData(Object.values(RESOURCES));
    refresh();
    // Refresh when the installed app comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ready]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f8fa]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Loading Paytrol...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900 flex flex-col justify-between">
    <main className="flex-1 max-w-md w-full mx-auto px-5 pt-5 pb-28">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
