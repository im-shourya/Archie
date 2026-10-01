import type { Category } from "./cases";
import { stats, type LatencyStats } from "./bench/stats";

/** Run metrics (docs/22 · Metrics), computed from per-case results. Pure. */

export type Kind = "ops" | "clarify" | "confirm" | "answer" | "noop";

export interface CaseResult {
  id: string;
  category: Category;
  pass: boolean;
  expectedKind: Kind;
  actualKind: Kind;
  tier: "fastpath" | "ai";
  attempts?: number;
  totalMs: number;
  failedAssertions?: string[];
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  /** Ops were applied to the board. */
  applied: boolean;
  /** Answer cases: every number in the answer exists in the context. */
  grounded?: boolean;
  /** The harness threw (error code); counted as a failure. */
  error?: string;
  /** B0 only: the fast path returned null and the AI was disabled. */
  abstained?: boolean;
  /** The model that served the (last) AI call, so fallbacks are visible per case. */
  model?: string;
}

export interface Metrics {
  taskAccuracy: number;
  kindAccuracy: number;
  falseActionRate: number;
  overClarifyRate: number;
  fastPathPrecision: number;
  fastPathCoverage: number;
  repairRate: number;
  answerGroundedness?: number;
  cacheHitRate?: number;
}

const ratio = (num: number, den: number, empty = 0) => (den === 0 ? empty : Math.round((num / den) * 10_000) / 10_000);

export function computeMetrics(results: readonly CaseResult[]): Metrics {
  const n = results.length;
  const holdBack = results.filter((r) => r.expectedKind === "clarify" || r.expectedKind === "confirm" || r.expectedKind === "noop");
  const expectOps = results.filter((r) => r.expectedKind === "ops");
  const fast = results.filter((r) => r.tier === "fastpath" && !r.abstained);
  const ai = results.filter((r) => r.tier === "ai" && !r.error);
  const answers = results.filter((r) => r.grounded !== undefined);
  // The first AI call writes the cache; hits are measured on the calls after it.
  const warm = ai.slice(1).filter((r) => r.usage);
  const metrics: Metrics = {
    taskAccuracy: ratio(results.filter((r) => r.pass).length, n),
    kindAccuracy: ratio(results.filter((r) => r.actualKind === r.expectedKind).length, n),
    falseActionRate: ratio(holdBack.filter((r) => r.applied).length, holdBack.length),
    overClarifyRate: ratio(expectOps.filter((r) => r.actualKind === "clarify").length, expectOps.length),
    // Nothing handled means nothing wrong: precision is vacuously 1.
    fastPathPrecision: ratio(fast.filter((r) => r.pass).length, fast.length, 1),
    fastPathCoverage: ratio(fast.length, n),
    repairRate: ratio(ai.filter((r) => r.attempts === 2).length, ai.length),
  };
  if (answers.length) metrics.answerGroundedness = ratio(answers.filter((r) => r.grounded).length, answers.length);
  if (warm.length) metrics.cacheHitRate = ratio(warm.filter((r) => (r.usage?.cacheReadTokens ?? 0) > 0).length, warm.length);
  return metrics;
}

export function byCategory(results: readonly CaseResult[]): Record<string, { n: number; pass: number }> {
  const out: Record<string, { n: number; pass: number }> = {};
  for (const r of results) {
    const c = (out[r.category] ??= { n: 0, pass: 0 });
    c.n += 1;
    if (r.pass) c.pass += 1;
  }
  return out;
}

/** Latency per tier. AI cold = the first AI call (cache write); warm = the rest. */
export function latency(results: readonly CaseResult[]): Record<string, LatencyStats> {
  const out: Record<string, LatencyStats> = {};
  const fast = results.filter((r) => r.tier === "fastpath" && !r.abstained).map((r) => r.totalMs);
  const ai = results.filter((r) => r.tier === "ai" && !r.error).map((r) => r.totalMs);
  if (fast.length) out.fastpath = stats(fast);
  if (ai.length) out.aiCold = stats(ai.slice(0, 1));
  if (ai.length > 1) out.aiWarm = stats(ai.slice(1));
  return out;
}
