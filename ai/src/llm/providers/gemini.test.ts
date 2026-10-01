import { ApiError } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTemplate } from "@archie/simulator";
import { getProvider, isConfigured, keyEnv, modelName, providerName } from "../client";
import { HarnessError, runCommand } from "../harness";
import { COMMAND_SYSTEM_PROMPT } from "../prompts/command";
import { createGeminiProvider, GEMINI_DEFAULT_MODEL, GEMINI_MAX_TOKENS, thinkingFor, WIRE_JSON_SCHEMA, type ModelsClient } from "./gemini";
import { modelLadder } from "../client";
import { ProviderError } from "./types";

const graph = buildTemplate("three-tier");
const NULL_OP = {
  id: null, kind: null, label: null, props: null, from: null, to: null, traffic: null,
  weight: null, replicas: null, node: null, rps: null, readRatio: null, peakMultiplier: null,
};

function geminiReply(body: object | string, extra: Record<string, unknown> = {}) {
  return {
    text: typeof body === "string" ? body : JSON.stringify(body),
    candidates: [{ finishReason: "STOP" }],
    modelVersion: "gemini-3.8-flash-001",
    usageMetadata: { promptTokenCount: 6000, cachedContentTokenCount: 5000, candidatesTokenCount: 120, thoughtsTokenCount: 80 },
    ...extra,
  };
}

function mockGemini(...replies: (object | Error)[]) {
  const generateContent = vi.fn();
  for (const r of replies) {
    if (r instanceof Error) generateContent.mockRejectedValueOnce(r);
    else generateContent.mockResolvedValueOnce(r);
  }
  const provider = createGeminiProvider({ client: { models: { generateContent } } as unknown as ModelsClient });
  return { provider, generateContent };
}

const noop = { kind: "noop", ops: [], message: "Only the design, please.", options: [], focusNodeIds: [] };
const request = (utterance: string) => ({ utterance, graph, baseVersion: 0 });

afterEach(() => vi.unstubAllEnvs());

describe("gemini provider", () => {
  it("sends the system prompt, JSON schema, the model's thinking setting and the abort signal", async () => {
    const { provider, generateContent } = mockGemini(geminiReply(noop));
    const res = await runCommand(request("write a poem"), { provider });
    expect(res.kind).toBe("noop");
    const { model, contents, config } = generateContent.mock.calls[0]![0];
    expect(model).toBe(GEMINI_DEFAULT_MODEL);
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({ role: "user", parts: [{ text: expect.stringContaining("<utterance>write a poem</utterance>") }] });
    expect(config.systemInstruction).toBe(COMMAND_SYSTEM_PROMPT);
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseJsonSchema).toBe(WIRE_JSON_SCHEMA);
    expect(config.maxOutputTokens).toBe(GEMINI_MAX_TOKENS);
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 }); // default model is gemini-2.5-flash
    expect(config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("reports the served model and splits cached from uncached input tokens", async () => {
    const { provider } = mockGemini(geminiReply(noop));
    const res = await runCommand(request("hi"), { provider });
    expect(res.model).toBe("gemini-3.8-flash-001");
    expect(res.usage).toEqual({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 0 });
  });

  it("repairs invalid ops with an append-only model turn", async () => {
    const bad = geminiReply({ ...noop, kind: "ops", ops: [{ ...NULL_OP, type: "fail", id: "postgres" }] });
    const good = geminiReply({ ...noop, kind: "ops", ops: [{ ...NULL_OP, type: "fail", id: "pg" }] });
    const { provider, generateContent } = mockGemini(bad, good);
    const res = await runCommand(request("kill the main database"), { provider });
    expect(res).toMatchObject({ kind: "ops", attempts: 2, ops: [{ type: "fail", id: "pg" }] });
    const contents = generateContent.mock.calls[1]![0].contents;
    expect(contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    expect(contents[1].parts[0].text).toBe(bad.text);
    expect(contents[2].parts[0].text).toContain('node "postgres" not found');
  });

  it("retries once with 2× tokens when thinking + output hit the cap", async () => {
    const { provider, generateContent } = mockGemini(
      geminiReply("{\"kind\":", { candidates: [{ finishReason: "MAX_TOKENS" }] }),
      geminiReply(noop),
    );
    await runCommand(request("big design"), { provider });
    expect(generateContent.mock.calls.map((c) => c[0].config.maxOutputTokens)).toEqual([GEMINI_MAX_TOKENS, GEMINI_MAX_TOKENS * 2]);
  });

  it.each([
    ["SAFETY finish", { candidates: [{ finishReason: "SAFETY" }] }],
    ["blocked prompt", { candidates: [], promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }],
  ])("maps a %s to LLM_REFUSED", async (_name, extra) => {
    const { provider } = mockGemini(geminiReply("", extra));
    await expect(runCommand(request("x"), { provider })).rejects.toMatchObject({ code: "LLM_REFUSED" });
  });

  it.each([
    ["429", new ApiError({ message: "quota", status: 429 }), "LLM_UNAVAILABLE"],
    ["500", new ApiError({ message: "secret detail", status: 500 }), "LLM_UPSTREAM"],
    ["network", new TypeError("fetch failed"), "LLM_UNAVAILABLE"],
  ] as const)("maps a %s error to %s without leaking provider text", async (_name, error, code) => {
    const { provider } = mockGemini(error);
    const err = await runCommand(request("x"), { provider }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HarnessError);
    expect(err).toMatchObject({ code });
    expect((err as Error).message).not.toMatch(/secret|quota|fetch failed/);
  });

  it("picks thinking per model generation", () => {
    expect(thinkingFor("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(thinkingFor("gemini-3.8-flash")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingFor("gemini-3.6-flash")).toEqual({ thinkingLevel: "MINIMAL" });
    expect(thinkingFor("gemini-3.5-flash-lite")).toBeUndefined();
  });

  it("treats a per-day 429 as a cooldown until Pacific midnight, a per-minute one as its retry delay", async () => {
    const day = new ApiError({ message: '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"} Please retry in 20.4s.', status: 429 });
    const minute = new ApiError({ message: "Quota exceeded per minute. Please retry in 20.4s.", status: 429 });
    const req = { system: "", turns: [], tokenScale: 1 as const, signal: new AbortController().signal };
    const dayErr = await mockGemini(day).provider.complete(req).catch((e: ProviderError) => e);
    const minErr = await mockGemini(minute).provider.complete(req).catch((e: ProviderError) => e);
    expect(dayErr).toMatchObject({ kind: "rate_limit" });
    expect((dayErr as ProviderError).retryAfterMs).toBeGreaterThan(21_000);
    expect(minErr).toMatchObject({ kind: "rate_limit", retryAfterMs: 20_400 });
  });

  it("classifies AbortError as aborted", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { provider } = mockGemini(abort);
    const err = await provider
      .complete({ system: "", turns: [], tokenScale: 1, signal: new AbortController().signal })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ kind: "aborted" });
  });

  it("JSON schema has no $schema key and keeps nullable fields as type arrays", () => {
    expect(WIRE_JSON_SCHEMA).not.toHaveProperty("$schema");
    expect(JSON.stringify(WIRE_JSON_SCHEMA)).toContain('"type":["string","null"]');
  });
});

describe("provider selection", () => {
  it("defaults to Gemini (free tier)", () => {
    vi.stubEnv("ARCHIE_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ARCHIE_MODEL", "");
    expect(providerName()).toBe("gemini");
    expect(modelName()).toBe(GEMINI_DEFAULT_MODEL);
    expect(keyEnv()).toBe("GEMINI_API_KEY");
    expect(isConfigured()).toBe(false);
  });

  it("uses Claude when only an Anthropic key is present, or when asked", () => {
    vi.stubEnv("ARCHIE_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(providerName()).toBe("anthropic");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    expect(providerName()).toBe("gemini");
    vi.stubEnv("ARCHIE_PROVIDER", "anthropic");
    expect(providerName()).toBe("anthropic");
    expect(isConfigured()).toBe(true);
  });

  it("ARCHIE_MODEL pins the primary model and getProvider caches the chain", () => {
    vi.stubEnv("ARCHIE_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    vi.stubEnv("ARCHIE_MODEL", "gemini-3.5-flash");
    const p = getProvider();
    expect(p).toMatchObject({ name: "gemini", model: "gemini-3.5-flash" });
    expect(getProvider()).toBe(p);
  });

  it("Gemini uses a model ladder (per-model free quotas), overridable with GEMINI_MODELS", () => {
    vi.stubEnv("GEMINI_MODELS", "");
    expect(modelLadder("gemini")).toEqual(["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]);
    vi.stubEnv("GEMINI_MODELS", "gemini-3.5-flash, gemini-2.5-flash");
    expect(modelLadder("gemini")).toEqual(["gemini-3.5-flash", "gemini-2.5-flash"]);
    expect(modelLadder("gemini", "pinned")).toEqual(["pinned"]);
    expect(modelLadder("groq")).toEqual(["openai/gpt-oss-120b"]);
  });
});
