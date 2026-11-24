import type { ReactNode } from 'react';

/**
 * Small line-icon set used instead of emoji, so icons match the rest of the
 * UI (same stroke, size and colour via currentColor).
 */
type IconProps = { className?: string; size?: number; strokeWidth?: number };

function Icon({ className, size = 20, strokeWidth = 1.8, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function FuelPumpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M3 21h12" />
      <path d="M7 7.5h4" />
      <path d="M14 10h1.5a2 2 0 0 1 2 2v4.25a1.75 1.75 0 0 0 3.5 0V8.5L18.5 6" />
    </Icon>
  );
}

export function DropletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5c-3.2 4.3-6.25 7.6-6.25 11.05a6.25 6.25 0 0 0 12.5 0C18.25 11.1 15.2 7.8 12 3.5Z" />
    </Icon>
  );
}

export function GasCylinderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 3h5" />
      <path d="M12 3v3" />
      <rect x="6.5" y="6" width="11" height="15" rx="3" />
      <path d="M6.5 11h11" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.25 12.25 2.5 2.5 5-5" />
    </Icon>
  );
}

export function AlertCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.75v4.75" />
      <path d="M12 16.25h.01" />
    </Icon>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </Icon>
  );
}

export function CollapseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 4v5H4" />
      <path d="M15 4v5h5" />
      <path d="M9 20v-5H4" />
      <path d="M15 20v-5h5" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16.9 3.5a2.1 2.1 0 0 1 3 3L8.7 17.6l-4.2.9.9-4.2L16.9 3.5Z" />
      <path d="m15.75 4.5 3.75 3.75" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M5.5 7 6.5 19a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8L18.5 7" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Icon>
  );
}

export function UserPlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 19.5a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8v6" />
      <path d="M16 11h6" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 13.5a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </Icon>
  );
}

/** A filled "verified" badge: this person has signed in to Paytrol. */
export function VerifiedIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M12 1.75 14.6 3.6l3.17.13.9 3.05 2.5 1.95-1.03 3 1.03 3.02-2.5 1.95-.9 3.04-3.17.14L12 22.25 9.4 20.4l-3.17-.14-.9-3.04-2.5-1.95L3.86 12l-1.03-3.02 2.5-1.95.9-3.05L9.4 3.6 12 1.75Z"
      />
      <path d="m8.25 12.25 2.5 2.5 5-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const FUEL_TYPE_ICONS = {
  petrol: FuelPumpIcon,
  diesel: DropletIcon,
  cng: GasCylinderIcon,
} as const;

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.8 6.2a2.3 2.3 0 0 1-1.6 1c-.4.1-.8.1-1.1.2A2.1 2.1 0 0 0 2.25 9.6V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.6a2.1 2.1 0 0 0-1.8-2.2l-1.1-.2a2.3 2.3 0 0 1-1.6-1l-.8-1.3a2.2 2.2 0 0 0-1.8-1 48.8 48.8 0 0 0-5.2 0 2.2 2.2 0 0 0-1.7 1L6.8 6.2Z" />
      <circle cx="12" cy="12.75" r="4.5" />
    </Icon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.25" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15.5-4.7-4.7a1.5 1.5 0 0 0-2.1 0L5 19.5" />
    </Icon>
  );
}

export function FlashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 2.75 4.75 13.5H12l-1 7.75 8.25-10.75H12l1-7.75Z" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.75" />
      <path d="m20.25 20.25-4.5-4.5" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </Icon>
  );
}
