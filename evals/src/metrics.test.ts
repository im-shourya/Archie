import { describe, expect, it } from "vitest";
import { byCategory, computeMetrics, latency, type CaseResult } from "./metrics";

const r = (over: Partial<CaseResult>): CaseResult => ({
  id: "x-01",
  category: "create",
  pass: true,
  expectedKind: "ops",
  actualKind: "ops",
  tier: "ai",
  attempts: 1,
  totalMs: 1000,
  applied: true,
  ...over,
});

describe("computeMetrics", () => {
  const results: CaseResult[] = [
    r({ tier: "fastpath", totalMs: 0.2 }),
    r({ tier: "fastpath", totalMs: 0.3, pass: false }),
    r({ usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 5000 } }),
    r({ attempts: 2, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 5000, cacheWriteTokens: 0 } }),
    r({ expectedKind: "ops", actualKind: "clarify", pass: false, applied: false }),
    r({ category: "ambiguity", expectedKind: "clarify", actualKind: "ops", pass: false, applied: true }),
    r({ category: "off-topic", expectedKind: "noop", actualKind: "noop", applied: false }),
    r({ category: "question", expectedKind: "answer", actualKind: "answer", applied: false, grounded: false, pass: false }),
  ];
  const m = computeMetrics(results);

  it("computes each rate over its own denominator", () => {
    expect(m.taskAccuracy).toBe(0.5); // 4 of 8
    expect(m.kindAccuracy).toBe(0.75); // 6 of 8
    expect(m.falseActionRate).toBe(0.5); // 1 of 2 hold-back cases acted
    expect(m.overClarifyRate).toBe(0.2); // 1 of 5 ops cases asked
    expect(m.fastPathPrecision).toBe(0.5);
    expect(m.fastPathCoverage).toBe(0.25);
    expect(m.repairRate).toBe(0.1667); // 1 of 6 AI cases
    expect(m.answerGroundedness).toBe(0);
  });

  it("measures cache hits only after the first AI call", () => {
    // 5 warm AI calls after the first; only one has cache reads (the others have no usage).
    expect(m.cacheHitRate).toBe(1);
  });

  it("excludes B0 abstentions and errors", () => {
    const b0 = computeMetrics([r({ tier: "fastpath" }), r({ tier: "fastpath", abstained: true, pass: false, applied: false })]);
    expect(b0.fastPathCoverage).toBe(0.5);
    expect(b0.fastPathPrecision).toBe(1);
    const errors = computeMetrics([r({ error: "LLM_UNAVAILABLE", pass: false, applied: false, attempts: undefined })]);
    expect(errors.repairRate).toBe(0);
  });

  it("splits latency by tier, with the first AI call as cold", () => {
    const lat = latency(results);
    expect(lat.fastpath?.n).toBe(2);
    expect(lat.aiCold?.n).toBe(1);
    expect(lat.aiWarm?.n).toBe(5);
  });

  it("groups by category", () => {
    expect(byCategory(results).create).toEqual({ n: 5, pass: 3 });
  });
});
