'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ListIcon, ProfileIcon, ScanIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { requestScan } from '@/lib/scan-events';

type NavItem = { href: string; label: string; icon: (props: { className?: string; size?: number; strokeWidth?: number }) => React.JSX.Element };

// Two tabs either side of the central Scan button, so the bar is symmetric.
// Scan opens Home, where the camera lives, and starts a scan.
const LEFT: NavItem[] = [
  { href: '/history', label: 'Trips', icon: ListIcon },
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
          aria-label="Scan dashboard"
          aria-current={onHome ? 'page' : undefined}
          onClick={(event) => {
            event.preventDefault();
            requestScan();
            if (!onHome) router.push('/home');
          }}
          className="flex flex-col items-center gap-1 pb-1.5 text-[11px] font-semibold text-primary focus:outline-none"
        >
          <span
            className={cn(
              '-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary',
              'shadow-lg shadow-primary/25 ring-4 ring-surface transition-transform active:scale-95 hover:bg-primary-hover'
            )}
          >
            <ScanIcon size={26} strokeWidth={1.9} />
          </span>
          <span>Scan</span>
        </Link>

        {RIGHT.map(tab)}
      </div>
    </nav>
  );
}
