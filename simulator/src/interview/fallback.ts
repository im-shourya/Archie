import type { CheckId, Problem, SloCheck } from "./types";

/**
 * Deterministic interviewer questions (docs/34 Steps 3 and 6). Used by the server when a model
 * question isn't grounded, and by the browser for the first question and when the AI is
 * unavailable ("offline question"). Pure, so both ask exactly the same thing.
 */

/** Order in which failing checks are probed: the most fundamental first. */
export const PROBE_ORDER: CheckId[] = [
  "availability",
  "headroom",
  "spof",
  "p99-read",
  "p99-write",
  "cost",
];

/** The next unused hint for the weakest failing check (or a general one): no model call. */
export function fallbackQuestion(
  problem: Problem,
  checks: readonly SloCheck[],
  transcript: readonly { role: "interviewer" | "candidate"; text: string }[],
): { question: string; focusNodeIds: string[] } {
  const asked = new Set(transcript.filter((t) => t.role === "interviewer").map((t) => t.text));
  const failing = PROBE_ORDER.filter((id) => checks.find((c) => c.id === id)?.pass === false);
  const order: (CheckId | "general")[] = [
    ...failing,
    "general",
    ...PROBE_ORDER.filter((id) => !failing.includes(id)),
  ];
  for (const check of order) {
    const hint = problem.hints.find((h) => h.check === check && !asked.has(h.question));
    if (hint) {
      const focus = check === "general" ? [] : (checks.find((c) => c.id === check)?.nodeIds ?? []);
      return { question: hint.question, focusNodeIds: focus };
    }
  }
  return { question: problem.hints[0]!.question, focusNodeIds: [] };
}
