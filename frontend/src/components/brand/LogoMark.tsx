/**
 * Archie mark: an "A" drawn as a three-node architecture graph. The apex node uses the
 * primary colour (the component that's "listening"); legs and crossbar are graph edges.
 * Geometry is shared with app/icon.svg and public/brand/*.svg.
 */
export function LogoMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M16 8L7 24M16 8L25 24M10.4 18L21.6 18"
        fill="none"
        stroke="var(--color-text-primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="12.5" y="4.5" width="7" height="7" rx="2" fill="var(--color-primary)" />
      <rect x="3.5" y="20.5" width="7" height="7" rx="2" fill="var(--color-text-primary)" />
      <rect x="21.5" y="20.5" width="7" height="7" rx="2" fill="var(--color-text-primary)" />
    </svg>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.35 }}>
      <LogoMark size={size} />
      <span style={{ fontWeight: 600, fontSize: size * 0.8, letterSpacing: "-0.01em", lineHeight: 1 }}>Archie</span>
    </span>
  );
}
