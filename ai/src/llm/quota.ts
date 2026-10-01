/**
 * Client-side quota guard per provider, so free tiers are never overrun (docs/20 T-03).
 *
 * Tracks requests and tokens per rolling minute and per quota day, plus a cooldown after the
 * provider itself says "429" or "overloaded". The chain consults it *before* calling and skips a
 * provider that has no room, instead of spending a request that would fail.
 *
 * In-memory per server instance: best-effort on serverless, like the backend rate limiter. The
 * provider's own 429s (and the cooldown they trigger) are the hard backstop.
 */

export interface QuotaLimits {
  rpm?: number;
  rpd?: number;
  /** Tokens per minute (input + output). */
  tpm?: number;
  /** Tokens per day. */
  tpd?: number;
  /** IANA zone whose midnight resets the daily quota (Gemini: America/Los_Angeles). */
  dayZone?: string;
}

export type QuotaCheck =
  | { ok: true }
  | { ok: false; scope: "minute" | "day" | "cooldown"; reason: string; retryInMs: number };

interface Entry {
  at: number;
  tokens: number;
}

const MINUTE = 60_000;

export class QuotaGuard {
  private window: Entry[] = [];
  private day = "";
  private dayRequests = 0;
  private dayTokens = 0;
  private coolUntil = 0;

  constructor(
    readonly name: string,
    readonly limits: QuotaLimits,
    private readonly now: () => number = Date.now,
  ) {}

  private dayKey(t: number): string {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: this.limits.dayZone ?? "UTC" }).format(t);
  }

  private roll(t: number): void {
    this.window = this.window.filter((e) => t - e.at < MINUTE);
    const key = this.dayKey(t);
    if (key !== this.day) {
      this.day = key;
      this.dayRequests = 0;
      this.dayTokens = 0;
    }
  }

  /** ms until the oldest entries leave the window enough to free `need` of a minute budget. */
  private minuteWait(t: number, used: (e: Entry) => number, limit: number, need: number): number {
    let total = this.window.reduce((s, e) => s + used(e), 0);
    for (const e of this.window) {
      if (total + need <= limit) break;
      total -= used(e);
      if (total + need <= limit) return e.at + MINUTE - t;
    }
    return total + need <= limit ? 0 : MINUTE;
  }

  /** Is there room for one request of about `tokens` tokens right now? */
  check(tokens: number): QuotaCheck {
    const t = this.now();
    this.roll(t);
    const l = this.limits;
    if (t < this.coolUntil) {
      return { ok: false, scope: "cooldown", reason: `${this.name} is cooling down after a rate limit`, retryInMs: this.coolUntil - t };
    }
    if (l.rpd !== undefined && this.dayRequests + 1 > l.rpd) {
      return { ok: false, scope: "day", reason: `${this.name} daily request quota used`, retryInMs: Infinity };
    }
    if (l.tpd !== undefined && this.dayTokens + tokens > l.tpd) {
      return { ok: false, scope: "day", reason: `${this.name} daily token quota used`, retryInMs: Infinity };
    }
    if (l.rpm !== undefined) {
      const wait = this.minuteWait(t, () => 1, l.rpm, 1);
      if (wait > 0) return { ok: false, scope: "minute", reason: `${this.name} requests per minute`, retryInMs: wait };
    }
    if (l.tpm !== undefined) {
      if (tokens > l.tpm) {
        return { ok: false, scope: "day", reason: `${this.name} can't fit a ${tokens}-token request in its per-minute limit`, retryInMs: Infinity };
      }
      const wait = this.minuteWait(t, (e) => e.tokens, l.tpm, tokens);
      if (wait > 0) return { ok: false, scope: "minute", reason: `${this.name} tokens per minute`, retryInMs: wait };
    }
    return { ok: true };
  }

  /** Record a request about to be sent. Returns a handle to settle with the real token count. */
  reserve(tokens: number): Entry {
    const t = this.now();
    this.roll(t);
    const entry = { at: t, tokens };
    this.window.push(entry);
    this.dayRequests += 1;
    this.dayTokens += tokens;
    return entry;
  }

  /** Replace the estimate with what the provider actually billed. */
  settle(entry: Entry, actualTokens: number): void {
    this.dayTokens += actualTokens - entry.tokens;
    entry.tokens = actualTokens;
  }

  /** The provider said 429 / overloaded: don't try it again for a while. */
  cooldown(ms: number): void {
    this.coolUntil = Math.max(this.coolUntil, this.now() + ms);
  }

  snapshot() {
    const t = this.now();
    this.roll(t);
    return {
      minute: { requests: this.window.length, tokens: this.window.reduce((s, e) => s + e.tokens, 0) },
      day: { requests: this.dayRequests, tokens: this.dayTokens },
      coolingDownMs: Math.max(0, this.coolUntil - t),
      limits: this.limits,
    };
  }
}

/** ms until the next midnight in `zone` (when a daily quota resets). */
export function msUntilMidnight(zone: string, now: number = Date.now()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const elapsed = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return Math.max(1_000, 86_400_000 - elapsed);
}

/** Rough token estimate for budgeting (about 3.5 characters per token for this prompt). */
export function estimateTokens(chars: number, outputAllowance: number): number {
  return Math.ceil(chars / 3.5) + outputAllowance;
}
