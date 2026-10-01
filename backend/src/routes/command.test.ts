import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTemplate } from "@archie/simulator";
import type { CommandResponse } from "@archie/ai/llm";

const runCommand = vi.hoisted(() => vi.fn());
vi.mock("@archie/ai/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@archie/ai/llm")>()),
  runCommand,
}));

const { app } = await import("../app");
const { resetRateLimits } = await import("../middleware/rateLimit");
const { HarnessError } = await import("@archie/ai/llm");

type ErrorResponse = { error: { code: string; message: string; details?: Record<string, unknown> } };

const graph = buildTemplate("three-tier");
const body = { utterance: "add a cache in front of postgres", graph, baseVersion: 0 };

const RESPONSE: CommandResponse = {
  kind: "ops",
  ops: [{ type: "addNode", id: "memcache", kind: "cache", label: "Memcache" }],
  message: "Added a cache.",
  options: [],
  focusNodeIds: ["memcache"],
  baseVersion: 0,
  attempts: 1,
  model: "claude-opus-5-5",
  timings: { contextMs: 1, llmMs: 900, validateMs: 1, totalMs: 905 },
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 0 },
};

let ipCounter = 0;
function post(payload: unknown, headers: Record<string, string> = {}, ip = `10.0.0.${++ipCounter}`) {
  return app.request("/api/command", {
    method: "POST",
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...headers },
  });
}

beforeEach(() => {
  resetRateLimits();
  runCommand.mockReset();
  runCommand.mockResolvedValue(RESPONSE);
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/command", () => {
  it("returns the harness result and echoes X-Request-Id", async () => {
    const res = await post(body, { "X-Request-Id": "req-42" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-Id")).toBe("req-42");
    expect(await res.json()).toEqual(RESPONSE);
    const [input, opts] = runCommand.mock.calls[0]!;
    expect(input).toEqual(body);
    expect(opts.requestId).toBe("req-42");
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["missing utterance", { graph, baseVersion: 0 }],
    ["blank utterance", { ...body, utterance: "   " }],
    ["utterance over 4,000 chars", { ...body, utterance: "x".repeat(4001) }],
    ["unknown field", { ...body, extra: true }],
    ["invalid graph", { ...body, graph: { nodes: "no" } }],
    ["malformed JSON", "{not json"],
  ])("400 VALIDATION_ERROR on %s", async (_name, payload) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("VALIDATION_ERROR");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("413 PAYLOAD_TOO_LARGE over 256 KB", async () => {
    const res = await post({ ...body, history: ["x".repeat(300 * 1024)] });
    expect(res.status).toBe(413);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("429 RATE_LIMITED with Retry-After on the 21st call in a minute", async () => {
    for (let i = 0; i < 20; i++) expect((await post(body, {}, "10.9.9.9")).status).toBe(200);
    const res = await post(body, {}, "10.9.9.9");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("RATE_LIMITED");
    // Other clients are unaffected.
    expect((await post(body, {}, "10.9.9.10")).status).toBe(200);
  });

  it("429 DAILY_CAP_REACHED once the global cap is used up", async () => {
    vi.stubEnv("ARCHIE_DAILY_CAP", "2");
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(200);
    const res = await post(body);
    expect(res.status).toBe(429);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("DAILY_CAP_REACHED");
  });

  describe("access code", () => {
    beforeEach(() => vi.stubEnv("ARCHIE_ACCESS_CODE", "goa-demo"));

    it("401 ACCESS_CODE_REQUIRED without the code", async () => {
      const res = await post(body);
      expect(res.status).toBe(401);
      expect(((await res.json()) as ErrorResponse).error.code).toBe("ACCESS_CODE_REQUIRED");
      expect(runCommand).not.toHaveBeenCalled();
    });

    it("401 with a wrong code, 200 with the right one", async () => {
      expect((await post(body, { "X-Archie-Code": "nope" })).status).toBe(401);
      expect((await post(body, { "X-Archie-Code": "goa-demo" })).status).toBe(200);
    });

    it("429 after 5 wrong codes in a minute (T-12)", async () => {
      for (let i = 0; i < 5; i++) expect((await post(body, { "X-Archie-Code": `bad-${i}` }, "10.7.7.7")).status).toBe(401);
      expect((await post(body, { "X-Archie-Code": "bad" }, "10.7.7.7")).status).toBe(429);
    });
  });

  it.each([
    ["LLM_REFUSED", 422],
    ["LLM_UPSTREAM", 502],
    ["LLM_UNAVAILABLE", 503],
  ] as const)("maps HarnessError %s to %i without provider details", async (code, status) => {
    runCommand.mockRejectedValue(new HarnessError(code, "safe message", { cause: new Error("provider secret") }));
    const res = await post(body);
    expect(res.status).toBe(status);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toEqual({ error: { code, message: "safe message" } });
  });

  it("500 INTERNAL for unexpected errors", async () => {
    runCommand.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(body);
    expect(res.status).toBe(500);
    expect(((await res.json()) as ErrorResponse).error).toEqual({ code: "INTERNAL", message: "Something went wrong" });
  });
});
