"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { AudioLines, Mic, Sparkles, Zap } from "lucide-react";
import { parseCommand, type FastPathAction } from "@archie/ai/fastpath";
import { getRepository } from "@archie/database";
import { recentNodeIds, useBoardStore } from "../store/board.store";
import { AnswerCard } from "./AnswerCard";
import { ClarifyChips } from "./ClarifyChips";
import { ConfirmDialog } from "./ConfirmDialog";
import { DegradedBanner } from "./DegradedBanner";
import styles from "./commandbar.module.css";
import { useCommand, type AiOutcome } from "./useCommand";

/** Hands-free submits once dictation has been still this long (docs/03 · F-01). */
export const SETTLE_MS = 1200;
const MIN_HANDS_FREE_WORDS = 2;
const TOAST_MS = 10_000;

const EXAMPLES = [
  "Kill Redis",
  "Five replicas of the API",
  "Send fifty thousand requests a second, ninety percent reads",
  "Shard Postgres into two",
  "Bring it back",
  "Connect the workers to search",
];

type Badge =
  | { tier: "local"; ms: number }
  | { tier: "ai"; ms: number }
  | { tier: "none" }
  | null;

interface Toast {
  id: number;
  message: string;
  undoable: boolean;
  /** Utterance to re-send from the toast's Retry button (AI errors). */
  retry?: string | null;
  requestId?: string | null;
}

function formatMs(ms: number): string {
  if (ms < 0.1) return "<0.1 ms";
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** A typed or spoken answer to a clarifying question: "2", or (part of) one option's text. */
export function matchOption(text: string, options: readonly string[]): string | null {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (/^[1-4]$/.test(t)) return options[Number(t) - 1] ?? null;
  const exact = options.find((o) => o.toLowerCase() === t);
  if (exact) return exact;
  const partial = options.filter((o) => o.toLowerCase().includes(t) || t.includes(o.toLowerCase()));
  return t.length >= 2 && partial.length === 1 ? partial[0]! : null;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export function CommandBar() {
  const graph = useBoardStore((s) => s.board?.graph);
  const events = useBoardStore((s) => s.events);
  const apply = useBoardStore((s) => s.apply);
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);
  const notice = useBoardStore((s) => s.notice);
  const { getNodes, fitView, zoomIn, zoomOut } = useReactFlow();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [badge, setBadge] = useState<Badge>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const [armed, setArmed] = useState(false);
  /** Text the user cancelled auto-submit for (Escape). Typing anything new re-arms. */
  const [pausedText, setPausedText] = useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [exampleIndex, setExampleIndex] = useState(0);
  /** The utterance being handled by the AI, so a late result only clears the bar if it's unchanged. */
  const submitted = useRef("");

  const onOutcome = useCallback((outcome: AiOutcome) => {
    const id = Date.now();
    switch (outcome.type) {
      case "applied":
        setBadge({ tier: "ai", ms: outcome.ms });
        setText((t) => (t.trim() === submitted.current ? "" : t));
        setToast({ id, message: outcome.message, undoable: true });
        return;
      case "noop":
        setBadge(null);
        setToast({ id, message: outcome.message, undoable: false });
        return;
      case "stale":
        setBadge(null);
        setToast({ id, message: "The board changed while I was thinking. Please say that again.", undoable: false });
        return;
      case "error":
        setBadge({ tier: "none" });
        setToast({ id, message: outcome.message, undoable: false, retry: outcome.retry, requestId: outcome.requestId });
    }
  }, []);
  const ai = useCommand(onOutcome);

  const history = useMemo(
    () => events.map((e) => e.utterance).filter((u): u is string => !!u),
    [events],
  );

  useEffect(() => {
    void getRepository()
      .then((repo) => repo.getSetting("handsFree"))
      .then(setHandsFree);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setExampleIndex((i) => (i + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(id);
  }, []);

  // Edits made elsewhere (the Inspector) report through the same toast, with Undo.
  useEffect(() => {
    if (notice) setToast({ id: notice.id, message: notice.message, undoable: notice.undoable });
  }, [notice]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const toggleHandsFree = useCallback(() => {
    setHandsFree((on) => {
      void getRepository().then((repo) => repo.setSetting("handsFree", !on));
      return !on;
    });
  }, []);

  const runAction = useCallback(
    (action: FastPathAction) => {
      if (action === "undo") return undo();
      if (action === "redo") return redo();
      if (action === "fit") void fitView({ padding: 0.2, duration: 250 });
      if (action === "zoomIn") void zoomIn({ duration: 200 });
      if (action === "zoomOut") void zoomOut({ duration: 200 });
      return true;
    },
    [undo, redo, fitView, zoomIn, zoomOut],
  );

  const submit = useCallback(
    (raw: string) => {
      const utterance = raw.trim();
      if (!utterance || !graph) return;
      setArmed(false);
      setHistoryIndex(null);
      const started = performance.now();
      const selection = getNodes().filter((n) => n.selected).map((n) => n.id);

      // An answer to the open clarifying question (docs/13 §6).
      if (ai.state.phase === "clarify") {
        const choice = matchOption(utterance, ai.state.options);
        if (choice) {
          setHint(null);
          ai.choose(choice, { selection, history });
          return;
        }
      }

      const result = parseCommand(utterance, graph, { selection, recent: recentNodeIds(events) });

      if (!result) {
        // Tier 2: the AI, unless it's unavailable (docs/15 · Degraded mode).
        if (ai.degraded) {
          setBadge({ tier: "none" });
          setHint("I need the AI for that one. Try a simpler command like “kill redis”.");
          return;
        }
        setHint(null);
        submitted.current = utterance;
        void ai.run(utterance, { selection, history });
        return;
      }

      // A local command supersedes any pending AI question or answer.
      if (ai.state.phase !== "idle" && ai.state.phase !== "thinking") ai.cancel();

      if (result.kind === "action") {
        const ok = runAction(result.action);
        setBadge({ tier: "local", ms: performance.now() - started });
        setHint(null);
        setText("");
        setToast({ id: Date.now(), message: ok ? result.summary : `Nothing to ${result.action}`, undoable: false });
        return;
      }

      const applied = apply(result.ops, { utterance, source: "fastpath" });
      const ms = performance.now() - started;
      if (!applied.ok) {
        // Should be impossible: parseCommand validated the ops against this graph.
        setBadge({ tier: "none" });
        setHint("That change isn’t valid for this board.");
        return;
      }
      setBadge({ tier: "local", ms });
      setHint(null);
      setText("");
      setToast({ id: Date.now(), message: result.summary, undoable: true });
    },
    [graph, events, apply, getNodes, runAction, ai, history],
  );

  // Hands-free: submit once the dictated text stops changing (docs/03 · F-01).
  useEffect(() => {
    if (!handsFree || wordCount(text) < MIN_HANDS_FREE_WORDS || text === pausedText) {
      setArmed(false);
      return;
    }
    setArmed(true);
    const id = setTimeout(() => submit(text), SETTLE_MS);
    return () => clearTimeout(id);
  }, [text, handsFree, pausedText, submit]);

  // Global shortcuts: "/" or ⌘K focuses the bar, H toggles hands-free.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        toggleHandsFree();
      } else if (ai.state.phase === "clarify" && /^[1-4]$/.test(e.key)) {
        const choice = ai.state.options[Number(e.key) - 1];
        if (!choice) return;
        e.preventDefault();
        ai.choose(choice, { selection: getNodes().filter((n) => n.selected).map((n) => n.id), history });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleHandsFree, ai, getNodes, history]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(text);
    } else if (ai.state.phase === "clarify" && text === "" && /^[1-4]$/.test(e.key)) {
      const choice = ai.state.options[Number(e.key) - 1];
      if (!choice) return;
      e.preventDefault();
      ai.choose(choice, { selection: getNodes().filter((n) => n.selected).map((n) => n.id), history });
    } else if (e.key === "Escape" && ai.state.phase !== "idle") {
      ai.cancel();
    } else if (e.key === "Escape") {
      if (armed) setPausedText(text);
      else e.currentTarget.blur();
    } else if (e.key === "ArrowUp" && !text.includes("\n") && history.length > 0) {
      e.preventDefault();
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setText(history[next]!);
    } else if (e.key === "ArrowDown" && historyIndex !== null) {
      e.preventDefault();
      const next = historyIndex + 1;
      setHistoryIndex(next >= history.length ? null : next);
      setText(next >= history.length ? "" : history[next]!);
    }
  }

  return (
    <footer className={styles.wrap}>
      <div className={styles.live} aria-live="polite">
        {ai.degraded && <DegradedBanner />}
        {ai.state.phase === "clarify" && (
          <ClarifyChips
            message={ai.state.message}
            options={ai.state.options}
            onChoose={(option) => ai.choose(option, { selection: getNodes().filter((n) => n.selected).map((n) => n.id), history })}
            onDismiss={ai.cancel}
          />
        )}
        {ai.state.phase === "answer" && (
          <AnswerCard message={ai.state.message} focus={ai.state.focus} onHighlight={ai.setFocus} onDismiss={ai.cancel} />
        )}
        {toast && (
          <div className={styles.toast} key={toast.id} role="status">
            <span>{toast.message}</span>
            {toast.undoable && (
              <button
                type="button"
                className={styles.toastButton}
                onClick={() => {
                  undo();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
            {toast.retry && (
              <button
                type="button"
                className={styles.toastButton}
                onClick={() => {
                  const retry = toast.retry!;
                  setToast(null);
                  submitted.current = retry;
                  void ai.run(retry, { selection: getNodes().filter((n) => n.selected).map((n) => n.id), history });
                }}
              >
                Retry
              </button>
            )}
            {toast.requestId && <span className={styles.requestId}>ref {toast.requestId.slice(0, 8)}</span>}
          </div>
        )}
        {hint && <p className={styles.hint}>{hint}</p>}
      </div>
      <div className={styles.bar}>
        <Mic className={styles.mic} size={18} strokeWidth={1.75} aria-hidden />
        <textarea
          ref={inputRef}
          className={styles.input}
          value={text}
          rows={1}
          placeholder={`Try: “${EXAMPLES[exampleIndex]}”`}
          aria-label="Command"
          aria-describedby="command-help"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setHistoryIndex(null);
            if (hint) setHint(null);
          }}
          onKeyDown={onKeyDown}
        />
        <span id="command-help" className={styles.srOnly}>
          Enter to run. Press slash or Command K to focus, H to toggle hands-free.
        </span>
        {armed && <span key={text} className={styles.ring} aria-label="Sending when you stop talking" role="img" />}
        <span
          className={styles.badge}
          data-tier={ai.state.phase === "thinking" ? "thinking" : (badge?.tier ?? "idle")}
          data-testid="latency-badge"
        >
          {ai.state.phase === "thinking" && (ai.state.slow ? "still thinking…" : "thinking…")}
          {ai.state.phase !== "thinking" && badge?.tier === "ai" && (
            <>
              <Sparkles size={12} strokeWidth={2} aria-hidden /> AI · {formatSeconds(badge.ms)}
            </>
          )}
          {ai.state.phase !== "thinking" && badge?.tier === "local" && (
            <>
              <Zap size={12} strokeWidth={2} aria-hidden /> local · {formatMs(badge.ms)}
            </>
          )}
          {ai.state.phase !== "thinking" && badge?.tier === "none" && "— not understood"}
        </span>
        <button
          type="button"
          className={styles.handsFree}
          aria-pressed={handsFree}
          onClick={toggleHandsFree}
          title="Hands-free: send automatically when you stop talking (H)"
        >
          <AudioLines size={14} strokeWidth={2} aria-hidden /> Hands-free
        </button>
      </div>
      {ai.state.phase === "confirm" && (
        <ConfirmDialog message={ai.state.message} count={ai.state.ops.length} onConfirm={ai.confirm} onCancel={ai.cancel} />
      )}
    </footer>
  );
}
