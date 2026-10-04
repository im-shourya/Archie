"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { parseCommand, type FastPathAction } from "@archie/ai/fastpath";
import { getRepository } from "@archie/database";
import { recentNodeIds, useBoardStore } from "../store/board.store";
import styles from "./commandbar.module.css";

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
  | { tier: "none" }
  | null;

interface Toast {
  id: number;
  message: string;
  undoable: boolean;
}

function formatMs(ms: number): string {
  if (ms < 0.1) return "<0.1 ms";
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export function CommandBar() {
  const graph = useBoardStore((s) => s.board?.graph);
  const events = useBoardStore((s) => s.events);
  const apply = useBoardStore((s) => s.apply);
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);
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
      const result = parseCommand(utterance, graph, { selection, recent: recentNodeIds(events) });

      if (!result) {
        setBadge({ tier: "none" });
        setHint("I couldn’t match that to a command yet. Try “kill redis” or “five replicas of the API”. Full descriptions arrive with the AI in Phase 4.");
        return;
      }

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
    [graph, events, apply, getNodes, runAction],
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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleHandsFree]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(text);
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
          </div>
        )}
        {hint && <p className={styles.hint}>{hint}</p>}
      </div>
      <div className={styles.bar}>
        <span className={styles.mic} aria-hidden>
          🎙
        </span>
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
        <span className={styles.badge} data-tier={badge?.tier ?? "idle"} data-testid="latency-badge">
          {badge?.tier === "local" && `⚡ local · ${formatMs(badge.ms)}`}
          {badge?.tier === "none" && "— not understood"}
        </span>
        <button
          type="button"
          className={styles.handsFree}
          aria-pressed={handsFree}
          onClick={toggleHandsFree}
          title="Hands-free: send automatically when you stop talking (H)"
        >
          ⌁ Hands-free
        </button>
      </div>
    </footer>
  );
}
