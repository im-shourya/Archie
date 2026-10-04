import { z } from "zod";
import {
  GraphSchema,
  PROBLEM_IDS,
  PROBLEMS,
  type Graph,
  type ProblemId,
  type SloCheck,
} from "@archie/simulator";
import { getProvider, isConfigured, keyEnv } from "./client";
import {
  interviewContext,
  TranscriptTurnSchema,
  transcriptBlock,
  MAX_TRANSCRIPT_TURNS,
} from "./interview";
import { SCORE_SYSTEM_PROMPT } from "./prompts/score";
import { HarnessError, StructuredSession, type RunOptions } from "./structured";

/**
 * /api/interview/score (FR-053, docs/34 Step 4). The model writes the rubric; code recomputes the
 * checks, repairs the rubric (all five dimensions, scores 1–5, evidence required) and computes
 * the overall score, so the headline number can't be inflated.
 */

export const DIMENSIONS = [
  "scalability",
  "availability",
  "data-modelling",
  "trade-offs",
  "communication",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const UNSUPPORTED_SCORE = 3;
const MIN_EVIDENCE_CHARS = 20;

export const ScoreRequestSchema = z.strictObject({
  problemId: z.enum(PROBLEM_IDS),
  graph: GraphSchema,
  transcript: z.array(TranscriptTurnSchema).max(MAX_TRANSCRIPT_TURNS),
});

export const ScoreWireSchema = z.strictObject({
  rubric: z.array(
    z.strictObject({
      dimension: z.enum(DIMENSIONS),
      score: z.number(),
      evidence: z.string(),
      nodeIds: z.array(z.string()),
    }),
  ),
  summary: z.string(),
});
export type ScoreWire = z.infer<typeof ScoreWireSchema>;

export interface RubricItem {
  dimension: Dimension;
  score: number;
  evidence: string;
  nodeIds: string[];
  /** True when the model gave no usable evidence: the score was set to 3. */
  unsupported: boolean;
}

export interface Scorecard {
  problemId: ProblemId;
  checks: SloCheck[];
  rubric: RubricItem[];
  /** Mean of the five rubric scores, computed in code. */
  overall: number;
  summary: string;
  model: string | null;
  timings: { contextMs: number; llmMs: number; totalMs: number };
}

const SCORE_OUTPUT = { name: "scorecard", schema: ScoreWireSchema };
const ms = (start: number) => Math.round((performance.now() - start) * 10) / 10;

/** Repair the model's rubric: one item per dimension, in order, scores 1–5, evidence or 3. */
export function repairRubric(wire: ScoreWire["rubric"], graph: Graph): RubricItem[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return DIMENSIONS.map((dimension) => {
    const item = wire.find((r) => r.dimension === dimension);
    if (!item)
      return { dimension, score: UNSUPPORTED_SCORE, evidence: "", nodeIds: [], unsupported: true };
    const nodeIds = [...new Set(item.nodeIds.filter((id) => ids.has(id)))].slice(0, 6);
    const evidence = item.evidence.trim().replace(/\s+/g, " ").slice(0, 300);
    // Communication is judged from the transcript; every other dimension must cite the board.
    const supported =
      evidence.length >= MIN_EVIDENCE_CHARS &&
      (dimension === "communication" || nodeIds.length > 0);
    if (!supported)
      return { dimension, score: UNSUPPORTED_SCORE, evidence, nodeIds, unsupported: true };
    const score = Math.min(
      5,
      Math.max(1, Math.round(Number.isFinite(item.score) ? item.score : UNSUPPORTED_SCORE)),
    );
    return { dimension, score, evidence, nodeIds, unsupported: false };
  });
}

export function overallScore(rubric: readonly RubricItem[]): number {
  return Math.round((rubric.reduce((sum, r) => sum + r.score, 0) / rubric.length) * 10) / 10;
}

export async function runScore(input: unknown, options: RunOptions = {}): Promise<Scorecard> {
  const t0 = performance.now();
  const parsed = ScoreRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HarnessError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "invalid request",
      { cause: parsed.error },
    );
  }
  const req = parsed.data;
  const problem = PROBLEMS[req.problemId];
  const tCtx = performance.now();
  const { checks, board } = interviewContext(req.graph, problem);
  const userMessage = [board, transcriptBlock(req.transcript)].join("\n");
  const contextMs = ms(tCtx);

  if (!options.provider && !isConfigured()) {
    throw new HarnessError(
      "LLM_UNAVAILABLE",
      `The AI isn't configured on this server (${keyEnv()} is not set).`,
    );
  }
  const session = new StructuredSession({
    ...options,
    provider: options.provider ?? getProvider(),
    system: SCORE_SYSTEM_PROMPT,
    output: SCORE_OUTPUT,
  });
  try {
    const { data } = await session.call([{ role: "user", text: userMessage }]);
    const rubric = repairRubric(data.rubric, req.graph);
    const { llmMs, model } = session.stats();
    return {
      problemId: req.problemId,
      checks,
      rubric,
      overall: overallScore(rubric),
      summary: data.summary.trim().slice(0, 600),
      model,
      timings: { contextMs, llmMs, totalMs: ms(t0) },
    };
  } finally {
    session.close();
  }
}
