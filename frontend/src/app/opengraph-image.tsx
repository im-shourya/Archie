import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** IBM Plex Sans (SIL OFL 1.1, see assets/fonts/OFL-IBM-Plex.txt), vendored for OG rendering. */
function font(weight: 400 | 600) {
  return readFile(join(process.cwd(), "assets", "fonts", `ibm-plex-sans-latin-${weight}-normal.woff`));
}

/** Social card: the mark, the name, the tagline and a real simulator readout. */
export default async function OpengraphImage() {
  const { colors } = SITE;
  const node = (label: string, detail: string, border: string, detailColor = "#525866") => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 210,
        padding: "14px 18px",
        border: `2px solid ${border}`,
        borderRadius: 10,
        background: "#ffffff",
      }}
    >
      <span style={{ fontSize: 24, fontWeight: 600, color: colors.ink }}>{label}</span>
      <span style={{ fontSize: 20, color: detailColor }}>{detail}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: 72, background: colors.background, fontFamily: "Plex" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="76" height="76" viewBox="0 0 32 32">
            <path d="M16 8L7 24M16 8L25 24M10.4 18L21.6 18" fill="none" stroke={colors.ink} strokeWidth="2.4" strokeLinecap="round" />
            <rect x="12.5" y="4.5" width="7" height="7" rx="2" fill={colors.primary} />
            <rect x="3.5" y="20.5" width="7" height="7" rx="2" fill={colors.ink} />
            <rect x="21.5" y="20.5" width="7" height="7" rx="2" fill={colors.ink} />
          </svg>
          <span style={{ fontSize: 64, fontWeight: 600, color: colors.ink, letterSpacing: -1 }}>Archie</span>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 52, fontWeight: 600, color: colors.ink, lineHeight: 1.15, maxWidth: 980 }}>
          {SITE.tagline}
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 28, color: "#525866", maxWidth: 980 }}>
          Describe an architecture out loud. Put traffic through it. See exactly why it fails.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: "auto" }}>
          {node("API ×30", "ρ 0.83 · warm", "#9a6200")}
          <span style={{ fontSize: 30, color: "#a8a497" }}>→</span>
          {node("Postgres", "ρ 1.40 · saturated", "#c0283a", "#c0283a")}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 18, fontSize: 22, color: "#525866" }}>
            <span>“Shard Postgres into two.”</span>
            <span>→ ρ 0.70 · success 100%</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Plex", data: await font(400), weight: 400, style: "normal" },
        { name: "Plex", data: await font(600), weight: 600, style: "normal" },
      ],
    },
  );
}
