import { afterEach, describe, expect, it, vi } from "vitest";
import { codeMatches } from "./accessCode";
import { DailyCap, DEFAULT_DAILY_CAP, TokenBuckets } from "./rateLimit";

afterEach(() => vi.unstubAllEnvs());

describe("TokenBuckets", () => {
  it("allows `capacity` calls, then reports the wait, then refills", () => {
    let t = 0;
    const b = new TokenBuckets(20, 60_000, () => t);
    for (let i = 0; i < 20; i++) expect(b.take("ip")).toBe(0);
    expect(b.take("ip")).toBe(3000);
    t += 3000;
    expect(b.take("ip")).toBe(0);
    expect(b.take("ip")).toBeGreaterThan(0);
  });

  it("keeps clients separate", () => {
    const b = new TokenBuckets(1, 60_000, () => 0);
    expect(b.take("a")).toBe(0);
    expect(b.take("a")).toBeGreaterThan(0);
    expect(b.take("b")).toBe(0);
  });
});

describe("DailyCap", () => {
  it("defaults to 500 and resets at 00:00 UTC", () => {
    let t = Date.UTC(2026, 9, 3, 23, 59);
    const cap = new DailyCap(() => t);
    expect(cap.limit()).toBe(DEFAULT_DAILY_CAP);
    vi.stubEnv("ARCHIE_DAILY_CAP", "1");
    expect(cap.take()).toBe(true);
    expect(cap.take()).toBe(false);
    t = Date.UTC(2026, 9, 4, 0, 0);
    expect(cap.take()).toBe(true);
  });

  it("ignores an invalid cap", () => {
    vi.stubEnv("ARCHIE_DAILY_CAP", "lots");
    expect(new DailyCap().limit()).toBe(DEFAULT_DAILY_CAP);
  });
});

describe("codeMatches", () => {
  it("compares codes of any length", () => {
    expect(codeMatches("goa-demo", "goa-demo")).toBe(true);
    expect(codeMatches("goa", "goa-demo")).toBe(false);
    expect(codeMatches("", "goa-demo")).toBe(false);
  });
});
