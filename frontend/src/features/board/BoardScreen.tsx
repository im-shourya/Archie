"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { TEMPLATES, type TemplateId } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";
import { Canvas } from "./Canvas";
import { EventLog } from "./EventLog";
import styles from "./board.module.css";

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Board shortcuts (docs/05 · Keyboard). Lives inside the provider to read the selection. */
function BoardKeyboard() {
  const { getNodes, fitView } = useReactFlow();
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);
  const apply = useBoardStore((s) => s.apply);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        const ids = getNodes().filter((n) => n.selected).map((n) => n.id);
        if (ids.length === 0) return;
        e.preventDefault();
        apply(
          ids.map((id) => ({ type: "removeNode", id })),
          { utterance: null, source: "inspector" },
        );
      } else if (!mod && e.key.toLowerCase() === "f") {
        void fitView({ padding: 0.2, duration: 250 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [getNodes, fitView, undo, redo, apply]);

  return null;
}

function EmptyBoard() {
  const apply = useBoardStore((s) => s.apply);
  const insert = (id: TemplateId) => apply(TEMPLATES[id].ops, { utterance: null, source: "template" });
  return (
    <div className={styles.empty}>
      <h2>Describe your system</h2>
      <p className={styles.muted}>
        Voice commands arrive in Phase 2. Try saying things like{" "}
        <em>“users hit a load balancer in front of three API servers”</em>. For now, start from a template:
      </p>
      <div className={styles.emptyActions}>
        {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
          <button key={id} type="button" className={styles.button} onClick={() => insert(id)}>
            Insert {TEMPLATES[id].name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BoardScreen({ id }: { id: string }) {
  const { status, board, events, persistent, load, undo, redo, rename } = useBoardStore();
  const canUndo = useBoardStore((s) => s.undoStack.length > 0);
  const canRedo = useBoardStore((s) => s.redoStack.length > 0);

  useEffect(() => {
    void load(id);
  }, [id, load]);

  if (status === "missing") {
    return (
      <main className={styles.message}>
        <h1>Board not found</h1>
        <p className={styles.muted}>It may have been deleted, or it lives in another browser.</p>
        <Link href="/" className={styles.button}>
          Back home
        </Link>
      </main>
    );
  }

  if (status !== "ready" || !board) {
    return (
      <main className={styles.message} aria-busy="true">
        <p className={styles.muted}>Loading board…</p>
      </main>
    );
  }

  return (
    <ReactFlowProvider>
      <BoardKeyboard />
      <div className={styles.screen}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.brand} aria-label="Archie home">
            ◂ Archie
          </Link>
          <input
            key={board.name}
            className={styles.name}
            defaultValue={board.name}
            aria-label="Board name"
            maxLength={80}
            onBlur={(e) => rename(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <div className={styles.topActions}>
            <button type="button" className={styles.iconButton} onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
              ↶
            </button>
            <button type="button" className={styles.iconButton} onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
              ↷
            </button>
          </div>
        </header>
        {!persistent && (
          <p className={styles.banner} role="status">
            This browser won’t save boards. Use Export (coming soon) to keep your work.
          </p>
        )}
        <main className={styles.main}>
          <section className={styles.canvas} aria-label="Board">
            {board.graph.nodes.length === 0 ? <EmptyBoard /> : <Canvas graph={board.graph} />}
          </section>
          <aside className={styles.panel} aria-label="Side panel">
            <h2 className={styles.panelTitle}>History</h2>
            <EventLog events={events} />
          </aside>
        </main>
      </div>
    </ReactFlowProvider>
  );
}
