import { createHash, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { AppError } from "../errors";
import { clientKey, registerLimiter, TokenBuckets, tooMany } from "./rateLimit";

/**
 * Optional demo access code (docs/18). Off unless ARCHIE_ACCESS_CODE is set. The client sends
 * it as `X-Archie-Code` (never in the URL). Compared in constant time; 5 wrong codes per minute
 * per IP → 429 (T-12).
 */

const failures = new TokenBuckets(5, 60_000);
registerLimiter(failures);

const digest = (value: string) => createHash("sha256").update(value).digest();

export function codeMatches(given: string, expected: string): boolean {
  // Hash both sides so the compare is constant-time regardless of length.
  return timingSafeEqual(digest(given), digest(expected));
}

export const accessCode = createMiddleware(async (c, next) => {
  const expected = process.env.ARCHIE_ACCESS_CODE;
  if (!expected) return next();
  const given = c.req.header("x-archie-code");
  if (given && codeMatches(given, expected)) return next();
  if (given) {
    const wait = failures.take(clientKey(c));
    if (wait > 0) {
      c.header("Retry-After", String(Math.max(1, Math.ceil(wait / 1000))));
      throw tooMany(wait);
    }
  }
  throw new AppError("ACCESS_CODE_REQUIRED", "This demo needs an access code.");
});
