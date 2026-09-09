interface LogoProps {
  size?: number;
  withWordmark?: boolean;
}

/** Marque TSSR NEO : symbole original, aucune reference a une marque tierce. */
export function Logo({ size = 32, withWordmark = true }: LogoProps): JSX.Element {
  return (
    <span className="neo-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="TSSR NEO">
        <defs>
          <linearGradient id="neo-logo-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--neo-accent-strong)" />
            <stop offset="1" stopColor="#2b7fff" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="var(--neo-bg-2)" stroke="var(--neo-border)" />
        <path d="M14 46V18h6l14 19V18h6v28h-6L20 27v19z" fill="url(#neo-logo-gradient)" />
        <circle cx="46" cy="22" r="4" fill="var(--neo-accent)" />
        <circle cx="46" cy="42" r="4" fill="none" stroke="var(--neo-accent)" strokeWidth="2" />
      </svg>
      {withWordmark ? (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <strong style={{ letterSpacing: '0.04em' }}>TSSR NEO</strong>
          <span className="neo-dim" style={{ fontSize: 'var(--neo-fs-xs)' }}>
            NEO Systems
          </span>
        </span>
      ) : null}
    </span>
  );
}
