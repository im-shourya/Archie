import { afterEach, describe, expect, it, vi } from "vitest";
import { codeMatches } from "./accessCode";
import { clientIp, DailyCap, DEFAULT_DAILY_CAP, TokenBuckets } from "./rateLimit";

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

describe("clientIp (docs/35 Step 7: a client can't forge its bucket behind the proxy)", () => {
  const headers = (h: Record<string, string>) => (name: string) => h[name.toLowerCase()];

  it("defaults to the first X-Forwarded-For entry (local runs, unchanged)", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(headers({}))).toBe("unknown");
  });

  it("uses a header the host sets when ARCHIE_CLIENT_IP_HEADER names it", () => {
    vi.stubEnv("ARCHIE_CLIENT_IP_HEADER", "True-Client-IP");
    expect(clientIp(headers({ "true-client-ip": "9.9.9.9", "x-forwarded-for": "6.6.6.6" }))).toBe("9.9.9.9");
  });

  it("counts X-Forwarded-For from the right, so a forged left entry changes nothing", () => {
    vi.stubEnv("ARCHIE_CLIENT_IP_HEADER", "x-forwarded-for");
    // The client sent "6.6.6.6"; the proxy appended the address it really saw.
    expect(clientIp(headers({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientIp(headers({ "x-forwarded-for": "7.7.7.7, 6.6.6.6, 5.5.5.5" }))).toBe("5.5.5.5");
    vi.stubEnv("ARCHIE_TRUSTED_PROXY_HOPS", "2");
    expect(clientIp(headers({ "x-forwarded-for": "6.6.6.6, 5.5.5.5, 10.0.0.1" }))).toBe("5.5.5.5");
  });

  it("falls back to 'unknown' when the configured header is missing (never to a client-set one)", () => {
    vi.stubEnv("ARCHIE_CLIENT_IP_HEADER", "true-client-ip");
    expect(clientIp(headers({ "x-forwarded-for": "6.6.6.6" }))).toBe("unknown");
  });
});
