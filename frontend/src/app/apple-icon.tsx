import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const { colors } = SITE;
  return new ImageResponse(
    (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: colors.background }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M16 8L7 24M16 8L25 24M10.4 18L21.6 18" fill="none" stroke={colors.ink} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="12.5" y="4.5" width="7" height="7" rx="2" fill={colors.primary} />
          <rect x="3.5" y="20.5" width="7" height="7" rx="2" fill={colors.ink} />
          <rect x="21.5" y="20.5" width="7" height="7" rx="2" fill={colors.ink} />
        </svg>
      </div>
    ),
    size,
  );
}
