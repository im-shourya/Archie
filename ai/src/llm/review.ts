import { z } from "zod";
import {
  GraphSchema,
  mergeFindings,
  PROBLEM_IDS,
  PROBLEMS,
  ruleFindings,
  simulate,
  spofScan,
  validateBatch,
  type Finding,
  type Graph,
  type Op,
  type Severity,
} from "@archie/simulator";
import { getProvider, isConfigured } from "./client";
import { escapeText, graphDsl, simSummary } from "./context";
import { problemBlock } from "./interview";
import { REVIEW_SYSTEM_PROMPT } from "./prompts/review";
import { toOps, WireOpSchema } from "./schemas";
import {
  HarnessError,
  StructuredSession,
  type HarnessErrorCode,
  type RunOptions,
} from "./structured";

/**
 * /api/review (FR-054, docs/34 Step 5). Rule findings (deterministic, from the simulator) always
 * come back; the model may add up to 4 more. Every AI fix goes through validateBatch, and an
 * invalid fix is dropped while its finding stays. With the AI unavailable, the rules alone are
 * returned with aiAvailable: false, so Review keeps working in degraded mode.
 */

export const MAX_AI_FINDINGS = 4;

export const ReviewRequestSchema = z.strictObject({
  graph: GraphSchema,
  problemId: z.enum(PROBLEM_IDS).optional(),
});

export const ReviewWireSchema = z.strictObject({
  findings: z.array(
    z.strictObject({
      severity: z.enum(["high", "medium", "low"]),
      nodeIds: z.array(z.string()),
      title: z.string(),
      detail: z.string(),
      fix: z.strictObject({ summary: z.string(), ops: z.array(WireOpSchema) }).nullable(),
    }),
  ),
});
export type ReviewWire = z.infer<typeof ReviewWireSchema>;

export interface ReviewResponse {
  findings: Finding[];
  aiAvailable: boolean;
  model: string | null;
  timings: { contextMs: number; llmMs: number; totalMs: number };
}

const REVIEW_OUTPUT = { name: "review_result", schema: ReviewWireSchema };
/** Failures that mean "no AI right now" rather than a bad request: degrade to rules only. */
const DEGRADE: ReadonlySet<HarnessErrorCode> = new Set([
  "LLM_UNAVAILABLE",
  "LLM_UPSTREAM",
  "RATE_LIMITED",
  "DAILY_CAP_REACHED",
  "LLM_REFUSED",
]);
const ms = (start: number) => Math.round((performance.now() - start) * 10) / 10;

/** AI findings → validated findings: real node ids, bounded text, fixes that pass validateBatch. */
export function validateAiFindings(wire: ReviewWire["findings"], graph: Graph): Finding[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const out: Finding[] = [];
  for (const [i, f] of wire.entries()) {
    const nodeIds = [...new Set(f.nodeIds.filter((id) => ids.has(id)))];
    const title = f.title.trim().slice(0, 80);
    const detail = f.detail.trim().replace(/\s+/g, " ").slice(0, 300);
    if (nodeIds.length === 0 || !title || !detail) continue;
    let fix: Finding["fix"] = null;
    if (f.fix && f.fix.ops.length > 0) {
      const ops = toOps(f.fix.ops);
      // Validated against this graph, so the wire ops are real Ops.
      if (validateBatch(graph, ops).length === 0)
        fix = { summary: f.fix.summary.trim().slice(0, 120), ops: ops as Op[] };
    }
    out.push({
      id: `ai:${i}`,
      severity: f.severity as Severity,
      nodeIds,
      title,
      detail,
      fix,
      source: "ai",
    });
    if (out.length >= MAX_AI_FINDINGS) break;
  }
  return out;
}

export async function runReview(input: unknown, options: RunOptions = {}): Promise<ReviewResponse> {
  const t0 = performance.now();
  const parsed = ReviewRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HarnessError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "invalid request",
      { cause: parsed.error },
    );
  }
  const { graph, problemId } = parsed.data;
  const problem = problemId ? PROBLEMS[problemId] : undefined;

  const tCtx = performance.now();
  const sim = simulate(graph);
  const rules = ruleFindings(graph, problem?.requirements, sim);
  const contextMs = ms(tCtx);
  const rulesOnly = (): ReviewResponse => ({
    findings: mergeFindings(rules, []),
    aiAvailable: false,
    model: null,
    timings: { contextMs, llmMs: 0, totalMs: ms(t0) },
  });
  if (graph.nodes.length === 0) return { ...rulesOnly(), aiAvailable: true };
  if (!options.provider && !isConfigured()) return rulesOnly();

  const scan = spofScan(graph);
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const userMessage = [
    ...(problem ? [problemBlock(problem)] : []),
    `<graph>\n${graphDsl(graph, sim)}\n</graph>`,
    `<sim>${simSummary(sim)}</sim>`,
    `<spofs>${scan.spofs.length ? scan.spofs.map((s) => `${s.id} (${escapeText(label(s.id))})`).join(", ") : "none"}</spofs>`,
    `<rules>\n${rules.length ? rules.map((f) => `- [${f.severity}] ${escapeText(f.title)}: ${escapeText(f.detail)}`).join("\n") : "(none)"}\n</rules>`,
  ].join("\n");

  const session = new StructuredSession({
    ...options,
    provider: options.provider ?? getProvider(),
    system: REVIEW_SYSTEM_PROMPT,
    output: REVIEW_OUTPUT,
  });
  try {
    const { data } = await session.call([{ role: "user", text: userMessage }]);
    const { llmMs, model } = session.stats();
    return {
      findings: mergeFindings(rules, validateAiFindings(data.findings, graph)),
      aiAvailable: true,
      model,
      timings: { contextMs, llmMs, totalMs: ms(t0) },
    };
  } catch (err) {
    if (err instanceof HarnessError && DEGRADE.has(err.code)) return rulesOnly();
    throw err;
  } finally {
    session.close();
  }
}
