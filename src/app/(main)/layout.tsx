'use client';

import { useAuth } from '@/hooks/useAuth';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { prefetchData, RESOURCES } from '@/lib/data-cache';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsSetup } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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

  // The first paint, before the app has read who is signed in on this device,
  // is already the app's frame with placeholders rather than a spinner on an
  // empty page, so a launch looks instant. It is replaced a moment later.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between">
        <main className="flex-1 max-w-md w-full mx-auto px-5 pt-5 pb-28" aria-busy="true" aria-label="Loading Paytrol">
          <div className="space-y-5">
            <div className="flex items-center justify-between pt-1">
              <div className="space-y-2">
                <div className="h-5 w-32 rounded-md bg-surface-sunken" />
                <div className="h-3 w-24 rounded-md bg-surface-sunken" />
              </div>
              <div className="h-10 w-10 rounded-full bg-surface-sunken" />
            </div>
            {pathname === '/home' && <div className="aspect-[4/3.4] w-full rounded-3xl bg-[#0b110e]" />}
            <div className="space-y-2.5">
              <div className="h-20 rounded-2xl bg-surface" />
              <div className="h-20 rounded-2xl bg-surface" />
            </div>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between">
    <main className="flex-1 max-w-md w-full mx-auto px-5 pt-5 pb-28">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
