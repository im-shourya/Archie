import { createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { AppError } from "../errors";

/**
 * Spend control for AI routes (docs/18, docs/20 T-03): a per-IP token bucket plus a global daily
 * cap. In-memory per server instance, so best-effort on serverless. The daily cap and the Console
 * spend limit are the hard stops.
 */

export const DEFAULT_DAILY_CAP = 500;
const MAX_TRACKED_CLIENTS = 10_000;

/** Raw IPs are never stored or logged: only a salted hash is used as the bucket key. */
const SALT = process.env.ARCHIE_IP_SALT || randomBytes(16).toString("hex");

export function clientKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || c.req.header("x-real-ip") || "unknown";
  return createHash("sha256").update(SALT).update(ip).digest("hex").slice(0, 32);
}

interface Bucket {
  tokens: number;
  updated: number;
}

/** Classic token bucket: `capacity` requests, refilled continuously over `windowMs`. */
export class TokenBuckets {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    readonly capacity: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Take one token. Returns 0 when allowed, else the ms until a token is available. */
  take(key: string): number {
    const t = this.now();
    const rate = this.capacity / this.windowMs;
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: t };
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.updated) * rate);
    b.updated = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      this.set(key, b);
      return 0;
    }
    this.set(key, b);
    return Math.ceil((1 - b.tokens) / rate);
  }

  clear(): void {
    this.buckets.clear();
  }

  private set(key: string, bucket: Bucket): void {
    // Bounded memory: drop the oldest entries (Map keeps insertion order).
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    if (this.buckets.size > MAX_TRACKED_CLIENTS) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
  }
}

/** Global AI calls per UTC day (ARCHIE_DAILY_CAP, default 500). */
export class DailyCap {
  private day = "";
  private count = 0;

  constructor(private readonly now: () => number = Date.now) {}

  limit(): number {
    const n = Number(process.env.ARCHIE_DAILY_CAP);
    return Number.isFinite(n) && n >= 0 && process.env.ARCHIE_DAILY_CAP !== "" ? n : DEFAULT_DAILY_CAP;
  }

  /** Count one call. False when today's cap is already used up. */
  take(): boolean {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.count = 0;
    }
    if (this.count >= this.limit()) return false;
    this.count += 1;
    return true;
  }

  clear(): void {
    this.day = "";
    this.count = 0;
  }
}

const limiters: { clear(): void }[] = [];
const dailyCap = new DailyCap();
limiters.push(dailyCap);

export function tooMany(retryMs: number): AppError {
  return new AppError("RATE_LIMITED", "Too many requests. Try again shortly.", {
    retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
  });
}

/** Per-IP limit for one route, then the shared daily cap. */
export function rateLimit(perMinute: number) {
  const buckets = new TokenBuckets(perMinute, 60_000);
  limiters.push(buckets);
  return createMiddleware(async (c, next) => {
    const wait = buckets.take(clientKey(c));
    if (wait > 0) {
      c.header("Retry-After", String(Math.max(1, Math.ceil(wait / 1000))));
      throw tooMany(wait);
    }
    if (!dailyCap.take()) {
      throw new AppError("DAILY_CAP_REACHED", "The AI's daily limit is used up. Local commands still work.");
    }
    await next();
  });
}

/** Test-only: reset every limiter's state. */
export function resetRateLimits(): void {
  for (const l of limiters) l.clear();
}

export function registerLimiter(limiter: { clear(): void }): void {
  limiters.push(limiter);
}
