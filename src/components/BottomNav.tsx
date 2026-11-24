'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CameraIcon, ProfileIcon, ScanIcon, TripsIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { requestCameraStart, requestCapture, useCameraState } from '@/lib/scan-events';

type NavItem = { href: string; label: string; icon: (props: { className?: string; size?: number; strokeWidth?: number }) => React.JSX.Element };

// Two tabs either side of the centre button, so the bar is symmetric.
// Off Home the centre button is Scan: it opens Home and turns the camera on.
// On Home, with the camera running, it is the shutter (Capture).
const LEFT: NavItem[] = [
  { href: '/history', label: 'Trips', icon: TripsIcon },
  { href: '/friends', label: 'Friends', icon: UsersIcon },
];
const RIGHT: NavItem[] = [
  { href: '/balances', label: 'Balances', icon: WalletIcon },
  { href: '/profile', label: 'Profile', icon: ProfileIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const onHome = isActive('/home');
  const camera = useCameraState();
  const shutter = onHome && (camera === 'live' || camera === 'reading');
  const reading = onHome && camera === 'reading';

  const tab = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-col items-center justify-center gap-1 py-1.5 text-[11px] transition-colors',
          active ? 'text-primary font-semibold' : 'text-muted font-medium hover:text-ink'
        )}
      >
        <span
          className={cn(
            'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
            active && 'bg-primary-soft'
          )}
        >
          <item.icon size={22} strokeWidth={active ? 2 : 1.7} />
        </span>
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-line pb-safe">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
        {LEFT.map(tab)}

        <Link
          href="/home"
          aria-label={shutter ? 'Capture the trip meter' : 'Scan dashboard'}
          aria-current={onHome ? 'page' : undefined}
          aria-disabled={reading || undefined}
          onClick={(event) => {
            event.preventDefault();
            if (reading) return;
            if (!onHome) {
              requestCameraStart();
              router.push('/home');
            } else if (camera === 'live') {
              requestCapture();
            } else {
              requestCameraStart();
            }
          }}
          className="flex flex-col items-center gap-1 pb-1.5 text-[11px] font-semibold text-primary focus:outline-none"
        >
          <span
            className={cn(
              '-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary',
              'shadow-lg shadow-primary/25 ring-4 ring-surface transition-transform active:scale-95 hover:bg-primary-hover',
              reading && 'opacity-70'
            )}
          >
            {reading ? (
              <span aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-[2.5px] border-on-primary/35 border-t-on-primary" />
            ) : shutter ? (
              <CameraIcon size={26} strokeWidth={1.9} />
            ) : (
              <ScanIcon size={26} strokeWidth={1.9} />
            )}
          </span>
          <span>{reading ? 'Reading' : shutter ? 'Capture' : 'Scan'}</span>
        </Link>

        {RIGHT.map(tab)}
      </div>
    </nav>
  );
}
