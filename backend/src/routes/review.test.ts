import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTemplate } from "@archie/simulator";

const runReview = vi.hoisted(() => vi.fn());
vi.mock("@archie/ai/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@archie/ai/llm")>()),
  runReview,
}));

const { app } = await import("../app");
const { resetRateLimits } = await import("../middleware/rateLimit");

const post = (payload: unknown, ip: string) =>
  app.request("/api/review", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
  });

beforeEach(() => {
  resetRateLimits();
  runReview.mockReset();
  runReview.mockResolvedValue({ findings: [], aiAvailable: true, model: "m", timings: {} });
});

describe("POST /api/review", () => {
  it("returns findings, rejects invalid bodies, and rate-limits at 5 per minute", async () => {
    const graph = buildTemplate("three-tier");
    expect((await post({ graph }, "10.3.0.1")).status).toBe(200);
    expect((await post({ graph, problemId: "chess" }, "10.3.0.2")).status).toBe(400);
    for (let i = 0; i < 4; i++) expect((await post({ graph }, "10.3.0.1")).status).toBe(200);
    expect((await post({ graph }, "10.3.0.1")).status).toBe(429);
  });
});
