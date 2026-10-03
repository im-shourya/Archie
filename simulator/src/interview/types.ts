/** Interview problem bank types (FR-050, docs/34 Step 2). */

export const PROBLEM_IDS = [
  "url-shortener",
  "rate-limiter",
  "chat",
  "news-feed",
  "ride-dispatch",
  "video-streaming",
] as const;
export type ProblemId = (typeof PROBLEM_IDS)[number];

export const CHECK_IDS = [
  "availability",
  "p99-read",
  "p99-write",
  "headroom",
  "spof",
  "cost",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export interface Requirements {
  dau: number;
  peakRps: number;
  readRatio: number;
  p99Ms: number;
  p99WriteMs: number;
  /** Fraction, e.g. 0.999. */
  availability: number;
  monthlyBudget: number;
}

export interface Hint {
  /** The check this question probes; the fallback picks hints for the weakest failing check. */
  check: CheckId | "general";
  question: string;
}

export interface Problem {
  id: ProblemId;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  brief: string;
  requirements: Requirements;
  hints: Hint[];
}

export interface SloCheck {
  id: CheckId;
  label: string;
  /** null = not applicable (e.g. write p99 for a read-only problem). */
  pass: boolean | null;
  actual: string;
  /** Nodes the result is about (the bottleneck, the SPOFs), for highlighting. */
  nodeIds: string[];
}
