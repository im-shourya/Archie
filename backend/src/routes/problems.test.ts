import { describe, expect, it } from "vitest";
import { PROBLEM_IDS } from "@archie/simulator";
import { app } from "../app";

describe("GET /api/problems", () => {
  it("serves the six problems with requirements and hints, cacheable, never the answer key", async () => {
    const res = await app.request("/api/problems");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age");
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(body.items.map((p) => p.id)).toEqual([...PROBLEM_IDS]);
    for (const p of body.items) {
      expect(p).toEqual({
        id: expect.any(String),
        title: expect.any(String),
        difficulty: expect.stringMatching(/^(easy|medium|hard)$/),
        brief: expect.any(String),
        requirements: {
          dau: expect.any(Number),
          peakRps: expect.any(Number),
          readRatio: expect.any(Number),
          p99Ms: expect.any(Number),
          p99WriteMs: expect.any(Number),
          availability: expect.any(Number),
          monthlyBudget: expect.any(Number),
        },
        hints: expect.any(Array),
      });
      expect(JSON.stringify(p)).not.toContain('"addNode"');
    }
  });
});
