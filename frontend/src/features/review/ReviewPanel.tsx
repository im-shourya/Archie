"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Cloud, Info, Warning, WarningOctagon, Wrench, X } from "@phosphor-icons/react/dist/ssr";
import { ruleFindings, type Finding, type Graph, type Problem } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";
import styles from "./review.module.css";

/**
 * Design review (FR-054, UF-11, docs/design §5.7). Rule findings are computed here at once (pure,
 * from the simulator); the server adds AI findings when it can. Apply fix runs the ops through
 * the store's apply (validated, undoable, logged as "review fix").
 */

const SEVERITY = {
  high: { icon: WarningOctagon, label: "HIGH" },
  medium: { icon: Warning, label: "MEDIUM" },
  low: { icon: Info, label: "LOW" },
} as const;

function accessCode(): string | null {
  try {
    return sessionStorage.getItem("archie.accessCode");
  } catch {
    return null;
  }
}

type AiState = "loading" | "ready" | "unavailable";

export function ReviewPanel({ graph, problem }: { graph: Graph; problem: Problem | null }) {
  const apply = useBoardStore((s) => s.apply);
  const undo = useBoardStore((s) => s.undo);
  const notify = useBoardStore((s) => s.notify);
  const close = useBoardStore((s) => s.setReviewOpen);
  // Findings for the board as it was when Review opened; applying fixes doesn't reshuffle the list.
  const [findings, setFindings] = useState<Finding[]>(() =>
    ruleFindings(graph, problem?.requirements).slice(0, 6),
  );
  const [ai, setAi] = useState<AiState>(graph.nodes.length ? "loading" : "ready");
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewed = useRef(graph);

  useEffect(() => heading.current?.focus(), []);

  useEffect(() => {
    const board = reviewed.current;
    if (board.nodes.length === 0) return;
    const controller = new AbortController();
    const code = accessCode();
    void fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(code ? { "X-Archie-Code": code } : {}) },
      body: JSON.stringify({ graph: board, ...(problem ? { problemId: problem.id } : {}) }),
      signal: controller.signal,
    })
      .then((res) =>
        res.ok ? (res.json() as Promise<{ findings: Finding[]; aiAvailable: boolean }>) : null,
      )
      .then((data) => {
        if (!data) return setAi("unavailable");
        setFindings(data.findings);
        setAi(data.aiAvailable ? "ready" : "unavailable");
      })
      .catch(() => !controller.signal.aborted && setAi("unavailable"));
    return () => controller.abort();
  }, [problem]);

  function applyFix(finding: Finding) {
    if (!finding.fix) return;
    const result = apply(finding.fix.ops, { utterance: null, source: "review-fix" });
    if (!result.ok) {
      setError(
        `That fix no longer applies to the board: ${result.errors[0]?.message ?? "invalid"}`,
      );
      return;
    }
    setError(null);
    setResolved((r) => new Set(r).add(finding.id));
    notify(`Applied: ${finding.fix.summary}`, true);
  }

  const highOpen = findings.filter((f) => f.severity === "high" && !resolved.has(f.id)).length;
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <section className={styles.review} aria-labelledby="review-title" data-testid="review">
      <div className={styles.head}>
        <h3 id="review-title" ref={heading} tabIndex={-1} className={styles.title}>
          Review
        </h3>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Close review"
          onClick={() => close(false)}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className={styles.meta} aria-live="polite">
        {findings.length === 0
          ? "No findings."
          : [
              `${findings.length} finding${findings.length === 1 ? "" : "s"}`,
              highOpen > 0 ? `${highOpen} high` : null,
              resolved.size > 0 ? `${resolved.size} resolved` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {findings.length === 0 && ai !== "loading" && (
        <p className={styles.empty}>
          No findings. This design has no SPOFs, no hot components and fits the budget.
        </p>
      )}

      <ul className={styles.list}>
        {findings.map((f) => {
          if (resolved.has(f.id)) {
            return (
              <li key={f.id} className={styles.resolved} data-testid={`finding-${f.id}`}>
                <CheckCircle size={16} aria-hidden /> Resolved: {f.title}
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => {
                    undo();
                    setResolved((r) => {
                      const next = new Set(r);
                      next.delete(f.id);
                      return next;
                    });
                  }}
                >
                  Undo
                </button>
              </li>
            );
          }
          return <FindingCard key={f.id} finding={f} labelOf={label} onApply={() => applyFix(f)} />;
        })}
      </ul>

      {ai === "loading" && <p className={styles.thinking}>AI is reviewing…</p>}
      {ai === "unavailable" && (
        <p className={styles.meta}>AI review unavailable: showing rule-based findings only.</p>
      )}
    </section>
  );
}

/** One finding (docs/design §5.7). Exported for the /design style guide. */
export function FindingCard({
  finding: f,
  labelOf,
  onApply,
}: {
  finding: Finding;
  labelOf(id: string): string;
  onApply?(): void;
}) {
  const setFocus = useBoardStore((s) => s.setFocus);
  const { icon: Icon, label: severity } = SEVERITY[f.severity];
  return (
    <li className={styles.card} data-severity={f.severity} data-testid={`finding-${f.id}`}>
      <div className={styles.cardHead}>
        <span className={styles.severity}>
          <Icon size={14} weight="bold" aria-hidden /> {severity}
        </span>
        {f.source === "ai" && (
          <span className={styles.ai}>
            <Cloud size={12} weight="bold" aria-hidden /> AI
          </span>
        )}
      </div>
      <p className={styles.cardTitle}>{f.title}</p>
      <p className={styles.detail}>{f.detail}</p>
      <div className={styles.cardFoot}>
        <div className={styles.chips}>
          {f.nodeIds.map((id) => (
            <button
              key={id}
              type="button"
              className={styles.chip}
              onMouseEnter={() => setFocus([id])}
              onMouseLeave={() => setFocus([])}
              onFocus={() => setFocus([id])}
              onBlur={() => setFocus([])}
            >
              {labelOf(id)}
            </button>
          ))}
        </div>
        {f.fix && onApply && (
          <button type="button" className={styles.fix} onClick={onApply} title={f.fix.summary}>
            <Wrench size={14} aria-hidden /> Apply fix
          </button>
        )}
      </div>
    </li>
  );
}
