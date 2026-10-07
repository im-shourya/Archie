import type { SloCheck } from "@archie/simulator";

/**
 * Interview state kept on the board document (docs/17: board.interview), so an interview survives
 * reload. The database stores it as unknown; readInterview() is the one place that trusts it.
 */

/** AI questions per interview (docs/34 · Quota budget). The first question is a free hint. */
export const INTERVIEW_TURN_CAP = 8;

export interface Turn {
  role: "interviewer" | "candidate";
  text: string;
  at: number;
  /** Interviewer turns: where the question came from. */
  source?: "ai" | "hint" | "offline";
  focusNodeIds?: string[];
}

export interface RubricItem {
  dimension: "scalability" | "availability" | "data-modelling" | "trade-offs" | "communication";
  score: number;
  evidence: string;
  nodeIds: string[];
  unsupported: boolean;
}

export interface Scorecard {
  checks: SloCheck[];
  rubric: RubricItem[];
  overall: number;
  summary: string;
  at: number;
}

export interface InterviewState {
  startedAt: number;
  transcript: Turn[];
  /** AI turns used, against INTERVIEW_TURN_CAP. */
  turnsUsed: number;
  scorecard: Scorecard | null;
}

export function readInterview(raw: unknown): InterviewState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<InterviewState>;
  if (typeof r.startedAt !== "number" || !Array.isArray(r.transcript)) return null;
  const transcript = r.transcript.filter(
    (t): t is Turn =>
      !!t && (t.role === "interviewer" || t.role === "candidate") && typeof t.text === "string",
  );
  return {
    startedAt: r.startedAt,
    transcript,
    turnsUsed: typeof r.turnsUsed === "number" ? r.turnsUsed : 0,
    scorecard: r.scorecard && typeof r.scorecard === "object" ? (r.scorecard as Scorecard) : null,
  };
}
