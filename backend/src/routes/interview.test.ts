import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTemplate } from "@archie/simulator";

const runInterviewTurn = vi.hoisted(() => vi.fn());
const runScore = vi.hoisted(() => vi.fn());
vi.mock("@archie/ai/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@archie/ai/llm")>()),
  runInterviewTurn,
  runScore,
}));

const { app } = await import("../app");
const { resetRateLimits } = await import("../middleware/rateLimit");
const { HarnessError } = await import("@archie/ai/llm");

const body = { problemId: "url-shortener", graph: buildTemplate("three-tier"), transcript: [] };
let ip = 0;
const post = (payload: unknown, headers: Record<string, string> = {}, from = `10.1.0.${++ip}`) =>
  app.request("/api/interview/turn", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json", "X-Forwarded-For": from, ...headers },
  });

beforeEach(() => {
  resetRateLimits();
  runInterviewTurn.mockReset();
  runInterviewTurn.mockResolvedValue({
    question: "Why?",
    focusNodeIds: ["api"],
    checks: [],
    source: "ai",
    done: false,
    model: "m",
    timings: { contextMs: 1, llmMs: 2, totalMs: 3 },
  });
});

describe("POST /api/interview/turn", () => {
  it("returns the turn", async () => {
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ question: "Why?", source: "ai" });
  });

  it("400 on an invalid body, before any model call", async () => {
    const res = await post({ ...body, problemId: "chess" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
    expect(runInterviewTurn).not.toHaveBeenCalled();
  });

  it("rate-limits at 10 per minute per IP", async () => {
    for (let i = 0; i < 10; i++) expect((await post(body, {}, "10.9.9.9")).status).toBe(200);
    const res = await post(body, {}, "10.9.9.9");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("requires the access code when one is set", async () => {
    vi.stubEnv("ARCHIE_ACCESS_CODE", "secret");
    expect((await post(body)).status).toBe(401);
    expect((await post(body, { "X-Archie-Code": "secret" })).status).toBe(200);
    vi.unstubAllEnvs();
  });

  it("maps harness errors to the standard error shape", async () => {
    runInterviewTurn.mockRejectedValueOnce(
      new HarnessError("LLM_UPSTREAM", "The AI service returned an error."),
    );
    const res = await post(body);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "LLM_UPSTREAM", message: "The AI service returned an error." },
    });
  });
});

describe("POST /api/interview/score", () => {
  it("returns the scorecard; 400 on an invalid body", async () => {
    runScore.mockResolvedValue({
      problemId: "url-shortener",
      checks: [],
      rubric: [],
      overall: 3.4,
      summary: "s",
      model: "m",
      timings: {},
    });
    const ok = await app.request("/api/interview/score", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.2.0.1" },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ overall: 3.4 });
    const bad = await app.request("/api/interview/score", {
      method: "POST",
      body: JSON.stringify({ ...body, transcript: "nope" }),
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.2.0.2" },
    });
    expect(bad.status).toBe(400);
  });
});
