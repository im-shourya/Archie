import { describe, expect, it } from "vitest";
import { estimateTokens, QuotaGuard } from "./quota";

function clock(start = Date.UTC(2026, 9, 3, 12, 0, 0)) {
  const c = { t: start, now: () => c.t };
  return c;
}

describe("QuotaGuard", () => {
  it("enforces requests per minute and frees slots as the window rolls", () => {
    const c = clock();
    const g = new QuotaGuard("gemini", { rpm: 2 }, c.now);
    g.reserve(10);
    c.t += 10_000;
    g.reserve(10);
    expect(g.check(10)).toMatchObject({ ok: false, scope: "minute", retryInMs: 50_000 });
    c.t += 50_000;
    expect(g.check(10)).toEqual({ ok: true });
  });

  it("enforces tokens per minute using real (settled) usage", () => {
    const c = clock();
    const g = new QuotaGuard("groq", { tpm: 8_000 }, c.now);
    const r = g.reserve(7_000);
    expect(g.check(2_000)).toMatchObject({ ok: false, scope: "minute" });
    g.settle(r, 5_000);
    expect(g.check(2_000)).toEqual({ ok: true });
  });

  it("refuses a request bigger than the whole per-minute token budget for the day", () => {
    const g = new QuotaGuard("groq", { tpm: 8_000 }, clock().now);
    expect(g.check(9_000)).toMatchObject({ ok: false, scope: "day" });
  });

  it("enforces daily requests and tokens, resetting at midnight in the quota's zone", () => {
    // 08:00 UTC on Oct 3 = 01:00 PDT on Oct 3.
    const c = clock(Date.UTC(2026, 9, 3, 8, 0));
    const g = new QuotaGuard("gemini", { rpd: 1, tpd: 100, dayZone: "America/Los_Angeles" }, c.now);
    g.reserve(50);
    expect(g.check(10)).toMatchObject({ ok: false, scope: "day" });
    c.t = Date.UTC(2026, 9, 4, 0, 1); // 17:01 PDT, same Pacific day even though UTC rolled over
    expect(g.check(10)).toMatchObject({ ok: false, scope: "day" });
    c.t = Date.UTC(2026, 9, 4, 7, 1); // 00:01 PDT next day
    expect(g.check(10)).toEqual({ ok: true });
  });

  it("cools down after a provider rate limit", () => {
    const c = clock();
    const g = new QuotaGuard("gemini", {}, c.now);
    g.cooldown(30_000);
    expect(g.check(1)).toMatchObject({ ok: false, scope: "cooldown", retryInMs: 30_000 });
    c.t += 30_000;
    expect(g.check(1)).toEqual({ ok: true });
  });

  it("snapshots usage", () => {
    const g = new QuotaGuard("groq", { rpm: 28 }, clock().now);
    g.reserve(6_000);
    expect(g.snapshot()).toMatchObject({ minute: { requests: 1, tokens: 6_000 }, day: { requests: 1, tokens: 6_000 } });
  });

  it("estimateTokens", () => {
    expect(estimateTokens(3_500, 1_000)).toBe(2_000);
  });
});
