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

export const FUEL_TYPE_ICONS = {
  petrol: FuelPumpIcon,
  diesel: DropletIcon,
  cng: GasCylinderIcon,
} as const;
