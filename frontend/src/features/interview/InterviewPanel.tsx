"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleMinus,
  CircleX,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Graph, Problem, SloCheck } from "@archie/simulator";
import { compact } from "@/lib/format";
import { isTyping } from "@/lib/keyboard";
import { useBoardStore } from "../store/board.store";
import { INTERVIEW_TURN_CAP, type InterviewState, type Turn } from "./state";
import { useInterview } from "./useInterview";
import { passing } from "./useSloChecks";
import { useTts } from "./useTts";
import styles from "./interview.module.css";

/**
 * Interview panel (F-10, UF-10, docs/design §5.2–§5.5): problem card, live SLO checklist
 * (computed), the interviewer's question (AI-marked or "from the problem"), the answer box and
 * the transcript. The command bar keeps editing the board; only the answer box talks to the
 * interviewer.
 */

interface Props {
  graph: Graph;
  problem: Problem;
  interview: InterviewState;
  checks: SloCheck[];
  pending: boolean;
}

const pct = (f: number) => `${String(Math.round(f * 100_000) / 1000)}%`;

function ProblemCard({
  problem,
  open,
  onToggle,
}: {
  problem: Problem;
  open: boolean;
  onToggle(): void;
}) {
  const r = problem.requirements;
  return (
    <section className={styles.problem} aria-label="Problem">
      <button type="button" className={styles.disclosure} aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span className={styles.problemTitle}>{problem.title}</span>
      </button>
      {open && (
        <div className={styles.problemBody}>
          <p className={styles.brief}>{problem.brief}</p>
          <dl className={styles.reqs}>
            <div>
              <dt>Peak</dt>
              <dd>{compact(r.peakRps)} rps</dd>
            </div>
            <div>
              <dt>Reads</dt>
              <dd>{Math.round(r.readRatio * 100)}%</dd>
            </div>
            <div>
              <dt>Read p99</dt>
              <dd>{r.p99Ms} ms</dd>
            </div>
            <div>
              <dt>Write p99</dt>
              <dd>{r.p99WriteMs} ms</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{pct(r.availability)}</dd>
            </div>
            <div>
              <dt>Budget</dt>
              <dd>${compact(r.monthlyBudget)}/mo</dd>
            </div>
          </dl>
          <p className={styles.note}>
            Checks run at the problem’s peak ({compact(r.peakRps)} rps), whatever the board’s
            workload.
          </p>
        </div>
      )}
    </section>
  );
}

const ICON = { pass: CircleCheck, fail: CircleX, na: CircleMinus };

export function SloChecklist({
  checks,
  pending,
}: {
  checks: readonly SloCheck[];
  pending: boolean;
}) {
  const setFocus = useBoardStore((s) => s.setFocus);
  return (
    <section className={styles.checks} aria-labelledby="slo-heading">
      <div className={styles.checksHead}>
        <h3 id="slo-heading" className={styles.heading}>
          SLOs
        </h3>
        <span className={styles.count} data-testid="slo-count">
          {pending ? "checking…" : `${passing(checks)} of ${checks.length} passing`}
        </span>
      </div>
      <ul className={styles.checkList}>
        {checks.map((c) => {
          const state = c.pass === null ? "na" : c.pass ? "pass" : "fail";
          const Icon = ICON[state];
          return (
            <li
              key={c.id}
              className={styles.check}
              data-state={state}
              data-testid={`check-${c.id}`}
              aria-label={`${c.label}: ${state === "na" ? "not applicable" : state === "pass" ? "passing" : "failing"}, ${c.actual}`}
              onMouseEnter={() => c.nodeIds.length && setFocus(c.nodeIds)}
              onMouseLeave={() => setFocus([])}
            >
              <Icon size={16} strokeWidth={2} aria-hidden className={styles.checkIcon} />
              <span className={styles.checkLabel}>{c.label}</span>
              <span className={styles.checkActual}>{c.actual}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Announce check flips politely, throttled, summarised when several flip at once (docs/design §5.4). */
function useCheckAnnouncements(checks: readonly SloCheck[], pending: boolean): string {
  const previous = useRef<Map<string, boolean | null> | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (pending) return;
    const now = new Map(checks.map((c) => [c.id, c.pass]));
    const before = previous.current;
    previous.current = now;
    if (!before) return;
    const flipped = checks.filter(
      (c) => before.has(c.id) && before.get(c.id) !== c.pass && c.pass !== null,
    );
    if (flipped.length === 0) return;
    const text =
      flipped.length === 1
        ? `${flipped[0]!.label} now ${flipped[0]!.pass ? "passing" : "failing"}`
        : `${flipped.length} checks changed: ${flipped.filter((c) => c.pass).length} passing, ${flipped.filter((c) => !c.pass).length} failing`;
    const id = setTimeout(() => setMessage(text), 300);
    return () => clearTimeout(id);
  }, [checks, pending]);
  return message;
}

function Chips({ ids, graph }: { ids: readonly string[]; graph: Graph }) {
  const setFocus = useBoardStore((s) => s.setFocus);
  const nodes = ids.map((id) => graph.nodes.find((n) => n.id === id)).filter((n) => !!n);
  if (nodes.length === 0) return null;
  return (
    <div className={styles.chips}>
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          className={styles.chip}
          onMouseEnter={() => setFocus([n.id])}
          onMouseLeave={() => setFocus([])}
          onFocus={() => setFocus([n.id])}
          onBlur={() => setFocus([])}
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}

function Provenance({ turn }: { turn: Turn }) {
  if (turn.source === "ai") {
    return (
      <span className={styles.provenance}>
        <Sparkles size={12} strokeWidth={2} aria-hidden className={styles.aiIcon} /> AI ·
        Interviewer
      </span>
    );
  }
  return (
    <span className={styles.provenance}>
      <BookOpen size={12} strokeWidth={2} aria-hidden /> Interviewer · from the problem
      {turn.source === "offline" && <span className={styles.offline}> · offline question</span>}
    </span>
  );
}

export function InterviewPanel({ graph, problem, interview, checks, pending }: Props) {
  const { ask, askNext, answer } = useInterview(problem, checks);
  const tts = useTts();
  const [text, setText] = useState("");
  const [problemOpen, setProblemOpen] = useState(interview.transcript.length <= 1);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const announcement = useCheckAnnouncements(checks, pending);

  const question = [...interview.transcript].reverse().find((t) => t.role === "interviewer");
  const answers = interview.transcript.filter((t) => t.role === "candidate").length;
  const capReached = interview.turnsUsed >= INTERVIEW_TURN_CAP;
  const thinking = ask.phase === "thinking";
  const allPass = !pending && checks.every((c) => c.pass !== false);

  // Read each new question aloud once: only questions asked after the panel opened, so a reload
  // (no user gesture yet) stays silent.
  const [openedAt] = useState(() => Date.now());
  const spoken = useRef<number | null>(null);
  useEffect(() => {
    if (!question || question.at < openedAt || spoken.current === question.at) return;
    spoken.current = question.at;
    tts.speak(question.text);
  }, [question, openedAt, tts]);

  // Shortcuts (docs/design §7.1): A focuses the answer box, N asks the next question.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        answerRef.current?.focus();
      } else if (e.key.toLowerCase() === "n" && !thinking && !capReached) {
        e.preventDefault();
        tts.cancel();
        void askNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askNext, thinking, capReached, tts]);

  function send() {
    const value = text.trim();
    if (!value || thinking) return;
    setText("");
    setProblemOpen(false);
    tts.cancel();
    void answer(value);
  }

  return (
    <div className={styles.panel} data-testid="interview">
      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
      <ProblemCard
        problem={problem}
        open={problemOpen}
        onToggle={() => setProblemOpen((o) => !o)}
      />
      <SloChecklist checks={checks} pending={pending} />

      {allPass && answers >= 3 && (
        <p className={styles.done} role="status">
          All SLOs pass. Finish to get your scorecard.
        </p>
      )}

      {question && (
        <section
          className={styles.turn}
          aria-label="Interviewer"
          data-thinking={thinking || undefined}
        >
          <div className={styles.turnHead}>
            <Provenance turn={question} />
            {tts.supported && (
              <button
                type="button"
                className={styles.iconButton}
                aria-pressed={tts.enabled}
                aria-label="Read questions aloud"
                title="Read questions aloud"
                onClick={tts.toggle}
              >
                {tts.enabled ? (
                  <Volume2 size={16} aria-hidden />
                ) : (
                  <VolumeX size={16} aria-hidden />
                )}
              </button>
            )}
          </div>
          <p className={styles.question} aria-live="polite" data-testid="question">
            {question.text}
          </p>
          <Chips ids={question.focusNodeIds ?? []} graph={graph} />
          {thinking && (
            <p className={styles.thinking}>{ask.slow ? "still thinking…" : "thinking…"}</p>
          )}
        </section>
      )}

      <div className={styles.answer}>
        <label htmlFor="interview-answer" className={styles.srOnly}>
          Your answer
        </label>
        <textarea
          id="interview-answer"
          ref={answerRef}
          className={styles.answerInput}
          rows={2}
          value={text}
          placeholder="Answer out loud with Wispr Flow, or type"
          onFocus={tts.cancel}
          onChange={(e) => {
            tts.cancel();
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
        />
        <div className={styles.answerActions}>
          <button
            type="button"
            className={styles.primary}
            onClick={send}
            disabled={!text.trim() || thinking}
          >
            Send
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              tts.cancel();
              void askNext();
            }}
            disabled={thinking || capReached}
          >
            <SkipForward size={16} aria-hidden /> Next question
          </button>
        </div>
        {capReached && (
          <p className={styles.note}>That’s all the questions. Finish when you’re ready.</p>
        )}
      </div>

      <section className={styles.transcript} aria-label="Transcript">
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={transcriptOpen}
          onClick={() => setTranscriptOpen((o) => !o)}
        >
          {transcriptOpen ? (
            <ChevronDown size={16} aria-hidden />
          ) : (
            <ChevronRight size={16} aria-hidden />
          )}
          Transcript ({interview.transcript.length})
        </button>
        {transcriptOpen && (
          <ol className={styles.transcriptList}>
            {interview.transcript.map((t) => (
              <li key={`${t.at}-${t.role}`}>
                <span className={styles.speaker}>
                  {t.role === "interviewer" ? "Interviewer" : "You"}
                </span>
                {t.text}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
