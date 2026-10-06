"use client";

import Link from "next/link";
import { Copy, RotateCcw, Sparkles } from "lucide-react";
import type { Graph, Problem, SloCheck } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";
import { SloChecklist } from "./InterviewPanel";
import type { RubricItem, Scorecard as ScorecardData } from "./state";
import styles from "./interview.module.css";

/**
 * Scorecard (FR-053, docs/design §5.6). Checks are computed by the simulator; the rubric is the
 * AI's judgment with evidence (marked); the overall score is the mean, computed in code.
 */

const DIMENSION_LABEL: Record<RubricItem["dimension"], string> = {
  scalability: "Scalability",
  availability: "Availability",
  "data-modelling": "Data modelling",
  "trade-offs": "Trade-offs",
  communication: "Communication",
};

function Bar({ item }: { item: RubricItem }) {
  return (
    <span
      className={styles.bar}
      role="meter"
      aria-valuemin={1}
      aria-valuemax={5}
      aria-valuenow={item.score}
      aria-label={`${DIMENSION_LABEL[item.dimension]} ${item.score} of 5${item.unsupported ? ", not enough evidence" : ""}`}
      data-unsupported={item.unsupported || undefined}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={styles.segment} data-filled={n <= item.score || undefined} />
      ))}
    </span>
  );
}

export function toMarkdown(
  problem: Problem,
  card: ScorecardData,
  checks: readonly SloCheck[],
): string {
  const lines = [
    `# Scorecard · ${problem.title}`,
    "",
    `**Overall ${card.overall.toFixed(1)} / 5** · ${checks.filter((c) => c.pass !== false).length} of ${checks.length} SLOs passed`,
    "",
    "## SLO checks (computed by the simulator)",
    ...checks.map(
      (c) => `- ${c.pass === null ? "–" : c.pass ? "✅" : "❌"} ${c.label}: ${c.actual}`,
    ),
    "",
    "## Rubric (AI, with evidence)",
    ...card.rubric.map(
      (r) =>
        `- **${DIMENSION_LABEL[r.dimension]} ${r.score}/5**${r.unsupported ? " (not enough evidence)" : ""}: ${r.evidence}`,
    ),
    "",
    "## Summary",
    card.summary,
  ];
  return lines.join("\n");
}

interface Props {
  graph: Graph;
  problem: Problem;
  /** Saved scorecard, or null while scoring / when the rubric failed. */
  card: ScorecardData | null;
  /** Live checks: shown immediately, even before (or without) the rubric. */
  checks: SloCheck[];
  state: "scoring" | "error" | "done";
  onRetry(): void;
  onResume(): void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

export function Scorecard({
  graph,
  problem,
  card,
  checks,
  state,
  onRetry,
  onResume,
  headingRef,
}: Props) {
  const notify = useBoardStore((s) => s.notify);
  const setFocus = useBoardStore((s) => s.setFocus);
  const shown = card?.checks ?? checks;
  const passed = shown.filter((c) => c.pass !== false).length;
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <section className={styles.panel} aria-labelledby="scorecard-title" data-testid="scorecard">
      <h3 id="scorecard-title" ref={headingRef} tabIndex={-1} className={styles.scoreTitle}>
        Scorecard · {problem.title.replace(/^Design (a |an )?/, "")}
      </h3>
      <div className={styles.overall}>
        <span className={styles.overallScore} data-testid="overall">
          {card ? card.overall.toFixed(1) : "–"}
          <span className={styles.outOf}> / 5</span>
        </span>
        <span className={styles.note}>
          {passed} of {shown.length} SLOs passed
          <br />
          Average of the five rubric scores
        </span>
      </div>

      <SloChecklist checks={shown} pending={false} />

      <section className={styles.rubric} aria-labelledby="rubric-heading">
        <h3 id="rubric-heading" className={styles.heading}>
          <Sparkles size={12} strokeWidth={2} aria-hidden className={styles.aiIcon} /> AI · Rubric
        </h3>
        {state === "scoring" && <p className={styles.thinking}>scoring…</p>}
        {state === "error" && (
          <p className={styles.error} role="alert">
            Rubric unavailable.{" "}
            <button type="button" className={styles.linkButton} onClick={onRetry}>
              Retry
            </button>
          </p>
        )}
        {card && (
          <ol className={styles.rubricList}>
            {card.rubric.map((item) => (
              <li key={item.dimension} data-testid={`rubric-${item.dimension}`}>
                <div className={styles.rubricHead}>
                  <span>{DIMENSION_LABEL[item.dimension]}</span>
                  <Bar item={item} />
                  <span className={styles.rubricScore}>{item.score}</span>
                </div>
                {item.unsupported ? (
                  <p className={styles.note}>not enough evidence</p>
                ) : (
                  <p className={styles.evidence}>{item.evidence}</p>
                )}
                {!item.unsupported && item.nodeIds.length > 0 && (
                  <div className={styles.chips}>
                    {item.nodeIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={styles.chip}
                        onMouseEnter={() => setFocus([id])}
                        onMouseLeave={() => setFocus([])}
                        onFocus={() => setFocus([id])}
                        onBlur={() => setFocus([])}
                      >
                        {label(id)}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {card && (
        <section aria-labelledby="summary-heading">
          <h3 id="summary-heading" className={styles.heading}>
            Summary
          </h3>
          <p className={styles.evidence}>{card.summary}</p>
        </section>
      )}

      <div className={styles.answerActions}>
        {card && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(toMarkdown(problem, card, shown))
                .then(() => notify("Scorecard copied", false))
                .catch(() => notify("Couldn’t copy the scorecard", false));
            }}
          >
            <Copy size={16} aria-hidden /> Copy as Markdown
          </button>
        )}
        <Link href="/interview" className={styles.secondary}>
          <RotateCcw size={16} aria-hidden /> Practice again
        </Link>
        <button type="button" className={styles.linkButton} onClick={onResume}>
          Resume editing
        </button>
      </div>
    </section>
  );
}
