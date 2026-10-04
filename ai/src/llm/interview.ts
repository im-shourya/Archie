import { z } from "zod";
import {
  atPeak,
  CHECK_IDS,
  fallbackQuestion,
  GraphSchema,
  PROBLEM_IDS,
  PROBLEMS,
  simulate,
  sloChecks,
  spofScan,
  type Graph,
  type Problem,
  type SloCheck,
} from "@archie/simulator";

export { fallbackQuestion };
import { getProvider, isConfigured, keyEnv } from "./client";
import { escapeText, graphDsl, simSummary } from "./context";
import { INTERVIEW_SYSTEM_PROMPT } from "./prompts/interview";
import { HarnessError, StructuredSession, type RunOptions } from "./structured";

/**
 * /api/interview/turn (FR-052, docs/34 Step 3). The simulator computes the checks; the model only
 * asks one question. A question that isn't grounded in a real node or a failing check is replaced
 * by the problem's next deterministic hint (no second model call).
 */

export const MAX_TRANSCRIPT_TURNS = 20;
export const MAX_TURN_CHARS = 1000;
export const MAX_QUESTION_CHARS = 400;
/** Candidate answers needed before the panel suggests finishing (with every check passing). */
export const DONE_AFTER_ANSWERS = 3;

export const TranscriptTurnSchema = z.strictObject({
  role: z.enum(["interviewer", "candidate"]),
  text: z.string().trim().min(1).max(MAX_TURN_CHARS),
});
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;

export const InterviewTurnRequestSchema = z.strictObject({
  problemId: z.enum(PROBLEM_IDS),
  graph: GraphSchema,
  transcript: z.array(TranscriptTurnSchema).max(MAX_TRANSCRIPT_TURNS),
  changes: z.array(z.string().max(200)).max(10).optional(),
});
export type InterviewTurnRequest = z.infer<typeof InterviewTurnRequestSchema>;

/** What the model fills. Strict: every field required (Groq strict mode). */
export const InterviewTurnWireSchema = z.strictObject({
  question: z.string(),
  focusNodeIds: z.array(z.string()),
  targetsCheck: z.enum(CHECK_IDS).nullable(),
});
export type InterviewTurnWire = z.infer<typeof InterviewTurnWireSchema>;

export interface InterviewTurnResponse {
  question: string;
  focusNodeIds: string[];
  checks: SloCheck[];
  /** "ai": the model's grounded question. "fallback": a deterministic hint (ungrounded or AI unavailable). */
  source: "ai" | "fallback";
  done: boolean;
  model: string | null;
  timings: { contextMs: number; llmMs: number; totalMs: number };
}

const INTERVIEW_OUTPUT = { name: "interview_turn", schema: InterviewTurnWireSchema };

const ms = (start: number) => Math.round((performance.now() - start) * 10) / 10;

export function problemBlock(problem: Problem): string {
  const r = problem.requirements;
  return [
    `<problem>${escapeText(problem.title)}: ${escapeText(problem.brief)}</problem>`,
    `<requirements>peak ${r.peakRps} rps · ${Math.round(r.readRatio * 100)}% reads · read p99 ≤ ${r.p99Ms} ms · write p99 ≤ ${r.p99WriteMs} ms · availability ${r.availability * 100}% · budget $${r.monthlyBudget}/mo</requirements>`,
  ].join("\n");
}

export function checksBlock(checks: readonly SloCheck[]): string {
  const lines = checks.map(
    (c) =>
      `${c.id}: ${c.pass === null ? "n/a" : c.pass ? "PASS" : "FAIL"} · ${c.label} · actual ${c.actual}`,
  );
  return `<checks>\n${lines.join("\n")}\n</checks>`;
}

export function transcriptBlock(transcript: readonly TranscriptTurn[]): string {
  if (transcript.length === 0) return "<transcript>(empty)</transcript>";
  return `<transcript>\n${transcript.map((t) => `${t.role}: ${escapeText(t.text)}`).join("\n")}\n</transcript>`;
}

/** The board at the problem's peak, with checks and SPOFs: the shared context for turn and score. */
export function interviewContext(graph: Graph, problem: Problem) {
  const peak = atPeak(graph, problem);
  const sim = peak.nodes.length > 0 ? simulate(peak) : null;
  const scan = spofScan(peak);
  const checks = sloChecks(graph, problem);
  const label = (id: string) => peak.nodes.find((n) => n.id === id)?.label ?? id;
  const spofs =
    scan.spofs.length === 0
      ? "<spofs>none</spofs>"
      : `<spofs>${scan.spofs.map((s) => `${s.id} (${escapeText(label(s.id))}): success → ${(s.successRate * 100).toFixed(1)}% if one instance fails`).join("; ")}</spofs>`;
  const board = [
    problemBlock(problem),
    `<graph>\n${graphDsl(peak, sim)}\n</graph>`,
    `<sim>${sim ? simSummary(sim) : "empty board"}</sim>`,
    checksBlock(checks),
    spofs,
  ].join("\n");
  return { peak, sim, checks, board };
}

/** Keep only grounded output (docs/14): real node ids, a check that is actually failing. */
export function groundTurn(
  wire: InterviewTurnWire,
  graph: Graph,
  checks: readonly SloCheck[],
): { question: string; focusNodeIds: string[] } | null {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const focus = [...new Set(wire.focusNodeIds.filter((id) => ids.has(id)))].slice(0, 6);
  const target = wire.targetsCheck ? checks.find((c) => c.id === wire.targetsCheck) : undefined;
  const question = wire.question.trim().replace(/\s+/g, " ");
  if (!question || question.length > MAX_QUESTION_CHARS) return null;
  // On an empty board there is nothing to cite: a general question is fine.
  if (focus.length === 0 && target?.pass !== false && graph.nodes.length > 0) return null;
  return { question, focusNodeIds: focus };
}

export function isDone(
  checks: readonly SloCheck[],
  transcript: readonly TranscriptTurn[],
): boolean {
  const answers = transcript.filter((t) => t.role === "candidate").length;
  return answers >= DONE_AFTER_ANSWERS && checks.every((c) => c.pass !== false);
}

export async function runInterviewTurn(
  input: unknown,
  options: RunOptions = {},
): Promise<InterviewTurnResponse> {
  const t0 = performance.now();
  const parsed = InterviewTurnRequestSchema.safeParse(input);
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
  const changes = req.changes?.length
    ? `<changes>${req.changes.map(escapeText).join(" · ")}</changes>`
    : "<changes>none</changes>";
  const userMessage = [board, changes, transcriptBlock(req.transcript)].join("\n");
  const contextMs = ms(tCtx);
  const done = isDone(checks, req.transcript);

  if (!options.provider && !isConfigured()) {
    throw new HarnessError(
      "LLM_UNAVAILABLE",
      `The AI isn't configured on this server (${keyEnv()} is not set).`,
    );
  }
  const session = new StructuredSession({
    ...options,
    provider: options.provider ?? getProvider(),
    system: INTERVIEW_SYSTEM_PROMPT,
    output: INTERVIEW_OUTPUT,
  });
  try {
    const { data } = await session.call([{ role: "user", text: userMessage }]);
    const grounded = groundTurn(data, req.graph, checks);
    const turn = grounded ?? fallbackQuestion(problem, checks, req.transcript);
    const { llmMs, model } = session.stats();
    return {
      ...turn,
      checks,
      source: grounded ? "ai" : "fallback",
      done,
      model,
      timings: { contextMs, llmMs, totalMs: ms(t0) },
    };
  } finally {
    session.close();
  }
}
