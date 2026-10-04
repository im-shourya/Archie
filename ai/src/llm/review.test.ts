import { describe, expect, it, vi } from "vitest";
import { buildTemplate, emptyGraph, ruleFindings } from "@archie/simulator";
import {
  ProviderError,
  type Completion,
  type CompletionRequest,
  type LlmProvider,
} from "./providers/types";
import { runReview, validateAiFindings, type ReviewWire } from "./review";
import type { WireOp } from "./schemas";

const graph = buildTemplate("three-tier");
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

function fake(
  reply: () => Completion | Promise<Completion>,
): LlmProvider & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    name: "gemini",
    model: "fake",
    effort: "",
    calls,
    complete: vi.fn(async (req: CompletionRequest) => (calls.push(req), reply())),
  };
}
const says = (wire: ReviewWire): Completion => ({
  text: JSON.stringify(wire),
  stop: "end",
  model: "fake",
  usage,
  raw: null,
});

const nullOp = {
  id: null,
  kind: null,
  label: null,
  props: null,
  from: null,
  to: null,
  traffic: null,
  weight: null,
  replicas: null,
  node: null,
  rps: null,
  readRatio: null,
  peakMultiplier: null,
};
const wireOp = (op: Partial<WireOp>): WireOp => ({ ...nullOp, type: "noop", ...op }) as WireOp;

describe("review (FR-054, docs/34 Step 5)", () => {
  it("returns rule findings plus validated AI findings, sorted and capped", async () => {
    const provider = fake(() =>
      says({
        findings: [
          {
            severity: "medium",
            nodeIds: ["api", "pg"],
            title: "Synchronous writes couple API to Postgres",
            detail: "Every write waits on Postgres.",
            fix: null,
          },
          {
            severity: "low",
            nodeIds: ["lb"],
            title: "One more load balancer",
            detail: "Two LBs at 50k rps leave no headroom during a deploy.",
            fix: {
              summary: "Run 3 LBs",
              ops: [wireOp({ type: "replicate", id: "lb", replicas: 3 })],
            },
          },
        ],
      }),
    );
    const res = await runReview({ graph }, { provider });
    expect(res.aiAvailable).toBe(true);
    const sources = res.findings.map((f) => f.source);
    expect(sources).toContain("rule");
    expect(sources).toContain("ai");
    expect(res.findings.length).toBeLessThanOrEqual(6);
    const rank = { high: 0, medium: 1, low: 2 };
    const ranks = res.findings.map((f) => rank[f.severity]);
    expect(ranks).toEqual([...ranks].sort());
    expect(res.findings.find((f) => f.title === "One more load balancer")?.fix?.ops).toEqual([
      { type: "replicate", id: "lb", replicas: 3 },
    ]);
    expect(provider.calls[0]!.output?.name).toBe("review_result");
    expect(provider.calls[0]!.turns[0]!.text).toContain("<rules>");
  });

  it("drops an AI fix that fails validation but keeps the finding; drops findings with no real nodes", () => {
    const findings = validateAiFindings(
      [
        {
          severity: "high",
          nodeIds: ["api"],
          title: "Bad fix",
          detail: "Replicas out of bounds.",
          fix: { summary: "x", ops: [wireOp({ type: "replicate", id: "api", replicas: 5000 })] },
        },
        {
          severity: "high",
          nodeIds: ["ghost"],
          title: "Ghost",
          detail: "Not on the board.",
          fix: null,
        },
      ],
      graph,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ title: "Bad fix", fix: null, source: "ai" });
  });

  it("an AI finding on the same nodes as a rule finding is dropped (rules win)", async () => {
    const provider = fake(() =>
      says({
        findings: [
          {
            severity: "high",
            nodeIds: ["redis"],
            title: "Redis again",
            detail: "Same as the rule.",
            fix: null,
          },
        ],
      }),
    );
    const res = await runReview({ graph }, { provider });
    expect(res.findings.filter((f) => f.nodeIds.join() === "redis").map((f) => f.source)).toEqual([
      "rule",
    ]);
  });

  it("with the AI out of quota or down, returns the rule findings with aiAvailable: false", async () => {
    for (const kind of ["quota_day", "overloaded", "connection"] as const) {
      const provider = fake(() => {
        throw new ProviderError(kind);
      });
      const res = await runReview({ graph }, { provider });
      expect(res.aiAvailable).toBe(false);
      expect(res.findings.map((f) => f.id)).toEqual(
        ruleFindings(graph)
          .map((f) => f.id)
          .slice(0, 6),
      );
    }
  });

  it("an empty board makes no model call", async () => {
    const provider = fake(() => says({ findings: [] }));
    const res = await runReview({ graph: emptyGraph() }, { provider });
    expect(res.findings).toEqual([]);
    expect(provider.calls).toHaveLength(0);
  });

  it("validates the request", async () => {
    await expect(
      runReview({ graph, problemId: "chess" }, { provider: fake(() => says({ findings: [] })) }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
