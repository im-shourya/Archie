/** Canonical site facts for metadata, OG images, manifest and JSON-LD (single source of truth). */
export const SITE = {
  name: "Archie",
  title: "Archie · talk through a system, watch it run",
  tagline: "Talk through a system. Watch it run. Watch it break.",
  description:
    "A voice-first system-design board. Describe an architecture out loud, see it drawn, put real traffic through it, and see exactly where and why it fails.",
  repo: "https://github.com/im-shourya/Archie",
  /** The released version (root package.json and CHANGELOG.md). */
  version: "1.1.0",
  author: "Shourya",
  keywords: [
    "system design",
    "system design interview",
    "architecture diagram",
    "capacity planning",
    "queueing simulation",
    "voice",
    "Wispr Flow",
  ],
  colors: { background: "#f5f5f7", ink: "#1d1d1f", primary: "#0071e3", darkBackground: "#000000" },
} as const;

/** Absolute base URL for metadata. Set NEXT_PUBLIC_SITE_URL in production. */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}
