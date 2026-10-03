import { describe, expect, it, vi } from "vitest";
import { buildTemplate, PROBLEMS, sloChecks } from "@archie/simulator";
import type { Completion, CompletionRequest, LlmProvider } from "./providers/types";
import { DIMENSIONS, overallScore, repairRubric, runScore, type ScoreWire } from "./score";
import { SCORE_SYSTEM_PROMPT } from "./prompts/score";

const graph = buildTemplate("three-tier");
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

function fake(wire: ScoreWire): LlmProvider & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    name: "gemini",
    model: "fake",
    effort: "",
    calls,
    complete: vi.fn(async (req: CompletionRequest): Promise<Completion> => {
      calls.push(req);
      return { text: JSON.stringify(wire), stop: "end", model: "fake", usage, raw: null };
    }),
  };
}

const good = (score = 4) => ({
  score,
  evidence: "Thirty API replicas keep rho at 0.67 under peak load.",
  nodeIds: ["api"],
});
const full: ScoreWire = {
  rubric: DIMENSIONS.map((dimension) => ({
    dimension,
    ...good(dimension === "availability" ? 2 : 4),
  })),
  summary: "Strong read path. Fix the single Redis.",
};
const request = {
  problemId: "url-shortener",
  graph,
  transcript: [{ role: "candidate", text: "I added a cache." }],
};

describe("interview score (FR-053, docs/34 Step 4)", () => {
  it("returns checks from the simulator, five rubric rows in order, and overall computed in code", async () => {
    const provider = fake(full);
    const card = await runScore(request, { provider });
    expect(card.checks).toEqual(sloChecks(graph, PROBLEMS["url-shortener"]));
    expect(card.rubric.map((r) => r.dimension)).toEqual([...DIMENSIONS]);
    expect(card.overall).toBe(3.6); // (4 + 2 + 4 + 4 + 4) / 5
    expect(card.summary).toBe("Strong read path. Fix the single Redis.");
    expect(provider.calls[0]!.output?.name).toBe("scorecard");
    expect(provider.calls[0]!.system).toBe(SCORE_SYSTEM_PROMPT);
  });

  it("a missing dimension becomes 3 and unsupported; duplicates keep the first", () => {
    const rubric = repairRubric(
      [
        { dimension: "scalability", ...good(5) },
        { dimension: "scalability", ...good(1) },
      ],
      graph,
    );
    expect(rubric).toHaveLength(5);
    expect(rubric[0]).toMatchObject({ dimension: "scalability", score: 5, unsupported: false });
    expect(rubric.slice(1).every((r) => r.score === 3 && r.unsupported)).toBe(true);
  });

  it("clamps out-of-range scores to 1–5", () => {
    const rubric = repairRubric(
      [
        { dimension: "scalability", ...good(7) },
        { dimension: "availability", ...good(-2) },
      ],
      graph,
    );
    expect(rubric[0]!.score).toBe(5);
    expect(rubric[1]!.score).toBe(1);
  });

  it("no evidence, or no real node for a board dimension, → 3 and unsupported", () => {
    const rubric = repairRubric(
      [
        { dimension: "scalability", score: 5, evidence: "Great.", nodeIds: ["api"] },
        {
          dimension: "availability",
          score: 5,
          evidence: "Redundant everywhere, nothing can fail at all.",
          nodeIds: ["ghost"],
        },
        {
          dimension: "communication",
          score: 5,
          evidence: "Explained every choice clearly and concisely.",
          nodeIds: [],
        },
      ],
      graph,
    );
    expect(rubric[0]).toMatchObject({ score: 3, unsupported: true });
    expect(rubric[1]).toMatchObject({ score: 3, unsupported: true, nodeIds: [] });
    expect(rubric[4]).toMatchObject({ dimension: "communication", score: 5, unsupported: false });
  });

  it("overall is the rounded mean", () => {
    const rubric = DIMENSIONS.map((dimension, i) => ({
      dimension,
      score: [5, 4, 4, 3, 3][i]!,
      evidence: "",
      nodeIds: [],
      unsupported: false,
    }));
    expect(overallScore(rubric)).toBe(3.8);
  });

  it("validates the request before any model call", async () => {
    const provider = fake(full);
    await expect(
      runScore({ ...request, graph: { nodes: "x" } }, { provider }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(provider.calls).toHaveLength(0);
  });
});
