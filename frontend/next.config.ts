import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Env files live at the repo root (.env.example says so), but Next only reads the app's own
// directory. Load the root .env.local and .env too, so `npm run dev` / `npm start` see
// GEMINI_API_KEY etc. Values already set (hosted env vars) always win.
for (const file of [".env.local", ".env"]) {
  const full = path.join(root, file);
  if (!existsSync(full)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(full, "utf8")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
const isProd = process.env.NODE_ENV === "production";

// docs/20-security.md: security headers. CSP only in production (dev needs eval for HMR).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
  ...(isProd
    ? [
        { key: "Content-Security-Policy", value: csp },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  transpilePackages: ["@archie/simulator", "@archie/ai", "@archie/database", "@archie/backend"],
  turbopack: { root },
  outputFileTracingRoot: root,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
