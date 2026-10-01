import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTemplate } from "@archie/simulator";
import { fallbackName, isConfigured, quotaLimits } from "../client";
import { runCommand } from "../harness";
import { QuotaGuard } from "../quota";
import { createChain } from "./chain";
import { ProviderError, type Completion, type LlmProvider } from "./types";

const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 };
const noop = JSON.stringify({ kind: "noop", ops: [], message: "ok", options: [], focusNodeIds: [] });

function fake(name: "gemini" | "groq", behaviour: () => Promise<Completion>): LlmProvider & { calls: number } {
  const p = {
    name,
    model: `${name}-model`,
    effort: "low",
    calls: 0,
    complete: async () => {
      p.calls += 1;
      return behaviour();
    },
  };
  return p;
}

const ok = (model: string) => async (): Promise<Completion> => ({ text: noop, stop: "end", model, usage, raw: noop });
const fail = (kind: ProviderError["kind"], retryAfterMs?: number) => async (): Promise<Completion> => {
  throw new ProviderError(kind, { retryAfterMs });
};

const req = (signal = new AbortController().signal) => ({ system: "s", turns: [{ role: "user" as const, text: "u" }], tokenScale: 1 as const, signal });
const run = (provider: LlmProvider) => runCommand({ utterance: "hi", graph: buildTemplate("three-tier"), baseVersion: 0 }, { provider });

afterEach(() => vi.unstubAllEnvs());

describe("provider chain", () => {
  it("uses the primary when it has room", async () => {
    const gemini = fake("gemini", ok("gemini-3.8-flash"));
    const groq = fake("groq", ok("gpt-oss-120b"));
    const chain = createChain([
      { provider: gemini, guard: new QuotaGuard("gemini", { rpm: 5 }), outputAllowance: 0 },
      { provider: groq, outputAllowance: 0 },
    ]);
    expect((await chain.complete(req())).model).toBe("gemini-3.8-flash");
    expect(groq.calls).toBe(0);
  });

  it.each(["rate_limit", "overloaded", "connection", "aborted"] as const)("fails over to Groq on %s and cools the primary down", async (kind) => {
    const gemini = fake("gemini", fail(kind));
    const groq = fake("groq", ok("gpt-oss-120b"));
    const guard = new QuotaGuard("gemini", {});
    const chain = createChain([
      { provider: gemini, guard, outputAllowance: 0 },
      { provider: groq, outputAllowance: 0 },
    ]);
    expect((await chain.complete(req())).model).toBe("gpt-oss-120b");
    expect(guard.check(1)).toMatchObject({ ok: false, scope: "cooldown" });
    // While cooling down, the primary isn't even called.
    await chain.complete(req());
    expect(gemini.calls).toBe(1);
    expect(groq.calls).toBe(2);
  });

  it("honours Retry-After for the cooldown", async () => {
    const guard = new QuotaGuard("gemini", {});
    const chain = createChain([
      { provider: fake("gemini", fail("rate_limit", 5_000)), guard, outputAllowance: 0 },
      { provider: fake("groq", ok("g")), outputAllowance: 0 },
    ]);
    await chain.complete(req());
    expect(guard.check(1)).toMatchObject({ retryInMs: expect.any(Number) });
    expect((guard.check(1) as { retryInMs: number }).retryInMs).toBeLessThanOrEqual(5_000);
  });

  it("skips a provider whose quota is full without calling it", async () => {
    const gemini = fake("gemini", ok("gemini"));
    const guard = new QuotaGuard("gemini", { rpm: 1 });
    guard.reserve(1);
    const chain = createChain([
      { provider: gemini, guard, outputAllowance: 0 },
      { provider: fake("groq", ok("groq")), outputAllowance: 0 },
    ]);
    expect((await chain.complete(req())).model).toBe("groq");
    expect(gemini.calls).toBe(0);
  });

  it("does not fail over on a bad request (a bug, not an outage)", async () => {
    const groq = fake("groq", ok("groq"));
    const chain = createChain([
      { provider: fake("gemini", fail("upstream")), outputAllowance: 0 },
      { provider: groq, outputAllowance: 0 },
    ]);
    await expect(chain.complete(req())).rejects.toMatchObject({ kind: "upstream" });
    expect(groq.calls).toBe(0);
  });

  it("stops when the caller aborted", async () => {
    const controller = new AbortController();
    const groq = fake("groq", ok("groq"));
    const chain = createChain([
      {
        provider: fake("gemini", async () => {
          controller.abort();
          throw new ProviderError("aborted");
        }),
        outputAllowance: 0,
      },
      { provider: groq, outputAllowance: 0 },
    ]);
    await expect(chain.complete(req(controller.signal))).rejects.toMatchObject({ kind: "aborted" });
    expect(groq.calls).toBe(0);
  });

  it("surfaces the real failure when every provider was tried", async () => {
    const chain = createChain([
      { provider: fake("gemini", fail("overloaded")), outputAllowance: 0 },
      { provider: fake("groq", fail("connection")), outputAllowance: 0 },
    ]);
    await expect(chain.complete(req())).rejects.toMatchObject({ kind: "connection" });
  });

  it("answers 429 RATE_LIMITED with Retry-After when all quotas are full for the minute", async () => {
    const g1 = new QuotaGuard("gemini", { rpm: 1 });
    const g2 = new QuotaGuard("groq", { tpm: 8_000 });
    g1.reserve(1);
    g2.reserve(7_900);
    const chain = createChain([
      { provider: fake("gemini", ok("a")), guard: g1, outputAllowance: 0 },
      { provider: fake("groq", ok("b")), guard: g2, outputAllowance: 1_000 },
    ]);
    await expect(run(chain)).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
  });

  it("answers DAILY_CAP_REACHED when every daily quota is used", async () => {
    const g1 = new QuotaGuard("gemini", { rpd: 0 });
    const g2 = new QuotaGuard("groq", { rpd: 0 });
    const chain = createChain([
      { provider: fake("gemini", ok("a")), guard: g1, outputAllowance: 0 },
      { provider: fake("groq", ok("b")), guard: g2, outputAllowance: 0 },
    ]);
    await expect(run(chain)).rejects.toMatchObject({ code: "DAILY_CAP_REACHED" });
  });
});

describe("fallback config", () => {
  it("defaults to Groq as the fallback when its key is set", () => {
    vi.stubEnv("ARCHIE_PROVIDER", "gemini");
    vi.stubEnv("ARCHIE_FALLBACK", "");
    vi.stubEnv("GROQ_API_KEY", "gsk-test");
    expect(fallbackName()).toBe("groq");
    vi.stubEnv("ARCHIE_FALLBACK", "none");
    expect(fallbackName()).toBeNull();
  });

  it("has no fallback without a key, and the fallback alone counts as configured", () => {
    vi.stubEnv("ARCHIE_PROVIDER", "gemini");
    vi.stubEnv("ARCHIE_FALLBACK", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(fallbackName()).toBeNull();
    expect(isConfigured()).toBe(false);
    vi.stubEnv("GROQ_API_KEY", "gsk-test");
    expect(isConfigured()).toBe(true);
  });

  it("reads quota overrides from env, falling back to the free-tier defaults", () => {
    vi.stubEnv("GEMINI_RPD", "1000");
    vi.stubEnv("GEMINI_RPM", "");
    expect(quotaLimits("gemini")).toMatchObject({ rpd: 1000, rpm: 9, dayZone: "America/Los_Angeles" });
    vi.stubEnv("GEMINI_RPD", "");
    expect(quotaLimits("gemini").rpd).toBe(19); // just under the measured 20/day per model
    expect(quotaLimits("groq")).toMatchObject({ rpm: 28, tpm: 7_600, tpd: 190_000 });
  });
});
