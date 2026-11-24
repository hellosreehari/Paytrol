'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: (props: { className?: string }) => React.JSX.Element };

// Two tabs either side of the central Home button, so the bar is symmetric.
// Home holds the live scanner, so adding a trip starts from the middle.
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
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const homeActive = isActive('/home');

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
          <item.icon className={cn('h-[22px] w-[22px]', active ? 'stroke-[2]' : 'stroke-[1.6]')} />
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
          aria-label="Home"
          aria-current={homeActive ? 'page' : undefined}
          className="flex flex-col items-center gap-1 pb-1.5 text-[11px] font-semibold text-primary focus:outline-none"
        >
          <span
            className={cn(
              '-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary',
              'shadow-lg shadow-primary/25 ring-4 ring-surface transition-transform active:scale-95 hover:bg-primary-hover'
            )}
          >
            <HomeIcon className="h-6 w-6 stroke-[1.9]" />
          </span>
          <span>Home</span>
        </Link>

        {RIGHT.map(tab)}
      </div>
    </nav>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg width={22} height={22} className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg width={22} height={22} className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg width={22} height={22} className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg width={22} height={22} className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg width={22} height={22} className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  );
}
