/**
 * Paytrol mark: a fuel drop split into two shares. The same artwork is used
 * for the favicon (src/app/icon.svg) and the app icons in public/icons.
 */
export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Paytrol"
      className={className}
    >
      <rect width="64" height="64" rx="15" className="fill-primary" />
      <path d="M30.8 11.6C25.4 18.4 16 30 16 39.5c0 8.6 6.6 15.6 14.8 16.4Z" className="fill-on-primary" />
      <path d="M33.2 11.6C38.6 18.4 48 30 48 39.5c0 8.6-6.6 15.6-14.8 16.4Z" className="fill-accent" />
    </svg>
  );
}

export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="text-lg font-semibold tracking-tight text-ink">Paytrol</span>
    </span>
  );
}
