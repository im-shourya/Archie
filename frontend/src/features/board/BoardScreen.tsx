"use client";

import Link from "next/link";
import { ArrowLeft, Flag, Redo2, Undo2 } from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";
import { percent } from "@/lib/format";
import { isTyping } from "@/lib/keyboard";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { PROBLEMS, TEMPLATES, type Graph, type Problem, type ProblemId, type TemplateId } from "@archie/simulator";
import { CommandBar } from "../commandbar/CommandBar";
import { Inspector } from "../inspector/Inspector";
import { MetricsPanel } from "../metrics/MetricsPanel";
import { useBoardStore } from "../store/board.store";
import { Canvas } from "./Canvas";
import { BottomSheet, type Snap } from "./BottomSheet";
import { EventLog } from "./EventLog";
import { useCompactLayout } from "./useCompactLayout";
import { useFit } from "./useFit";
import { useSimulation } from "./useSimulation";
import { useSpofScan } from "./useSpofScan";
import { readInterview, type InterviewState } from "../interview/state";
import { passing, useSloChecks } from "../interview/useSloChecks";

// Interview UI loads only on interview boards (NFR-015).
const InterviewPanel = dynamic(() => import("../interview/InterviewPanel").then((m) => m.InterviewPanel), { ssr: false });
import styles from "./board.module.css";

/** Board shortcuts (docs/05 · Keyboard). Lives inside the provider to read the selection. */
function BoardKeyboard() {
  const { getNodes } = useReactFlow();
  const fit = useFit();
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
        void fit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [getNodes, fit, undo, redo, apply]);

  return null;
}

function EmptyBoard() {
  const apply = useBoardStore((s) => s.apply);
  const insert = (id: TemplateId) => apply(TEMPLATES[id].ops, { utterance: null, source: "template" });
  return (
    <div className={styles.empty}>
      <h2>Describe your system</h2>
      <p className={styles.muted}>
        Describing whole systems out loud (<em>“users hit a load balancer in front of three API
        servers”</em>) arrives with the AI. For now, start from a template, then change it by voice:
        <em> “kill Redis”</em>, <em>“five replicas of the API”</em>.
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

type PanelTab = "interview" | "metrics" | "inspector" | "history";

const TAB_LABEL: Record<PanelTab, string> = {
  interview: "Interview",
  metrics: "Metrics",
  inspector: "Inspector",
  history: "History",
};
const DESIGN_TABS: PanelTab[] = ["metrics", "inspector", "history"];
const INTERVIEW_TABS: PanelTab[] = ["interview", "metrics", "inspector", "history"];

function PanelTabs({ tabs, tab, onChange }: { tabs: PanelTab[]; tab: PanelTab; onChange: (t: PanelTab) => void }) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Side panel">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          id={`tab-${t}`}
          aria-selected={tab === t}
          aria-controls="side-panel-body"
          className={styles.tab}
          onClick={() => onChange(t)}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

/** True while the last user input was the keyboard (so a selection can move focus, but a click doesn't). */
function useLastInputWasKeyboard() {
  const keyboard = useRef(false);
  useEffect(() => {
    const onKey = () => (keyboard.current = true);
    const onPointer = () => (keyboard.current = false);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  return keyboard;
}

interface BoardProps {
  graph: Graph;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  /** Interview mode: the problem and the board's interview state. */
  problem: Problem | null;
  interview: InterviewState | null;
}

/** Canvas + side panel; the simulation runs on every change. Interview boards use it even when empty. */
function SimulatedBoard({ graph, tab, onTab, problem, interview }: BoardProps) {
  const { sim, baseline } = useSimulation(graph);
  const scan = useSpofScan(graph);
  const slo = useSloChecks(graph, problem);
  const selection = useBoardStore((s) => s.selection);
  const events = useBoardStore((s) => s.events);
  const selected = selection.length === 1 ? graph.nodes.find((n) => n.id === selection[0]) : undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  const keyboard = useLastInputWasKeyboard();

  // Selecting one component opens the Inspector (FR-016); by keyboard, focus follows it.
  const selectedId = selected?.id;
  const pendingFocus = useRef(false);
  const { compact } = useCompactLayout();
  const [snap, setSnap] = useState<Snap>("peek");
  useEffect(() => {
    if (!selectedId) return;
    onTab("inspector");
    setSnap((s) => (s === "peek" ? "half" : s));
    pendingFocus.current = keyboard.current;
  }, [selectedId, onTab, keyboard]);
  // Runs after the Inspector has mounted (the tab switch is a separate render).
  useEffect(() => {
    if (tab !== "inspector" || !pendingFocus.current || !heading.current) return;
    pendingFocus.current = false;
    heading.current.focus();
  });

  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const body = (
    <>
      <PanelTabs tabs={problem ? INTERVIEW_TABS : DESIGN_TABS} tab={tab} onChange={onTab} />
      <div id="side-panel-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "interview" && problem && interview && (
          <InterviewPanel graph={graph} problem={problem} interview={interview} checks={slo.checks} pending={slo.pending} />
        )}
        {tab === "metrics" && <MetricsPanel graph={graph} sim={sim} baseline={baseline} scan={scan} />}
        {tab === "inspector" &&
          (selected ? (
            <Inspector
              ref={heading}
              graph={graph}
              sim={sim}
              node={selected}
              scan={scan}
              onEscape={() =>
                document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(selected.id)}"]`)?.focus()
              }
            />
          ) : (
            <p className={styles.muted}>Select a component on the canvas to inspect and edit it.</p>
          ))}
        {tab === "history" && <EventLog events={events} />}
      </div>
    </>
  );

  return (
    <>
      <section className={styles.canvas} aria-label="Board">
        <Canvas graph={graph} sim={sim} spofs={scan.spofs} />
        {graph.nodes.length === 0 && (
          <p className={styles.canvasHint}>
            Design by voice: <em>“users hit a load balancer in front of three API servers and Postgres”</em>
          </p>
        )}
      </section>
      {compact ? (
        <BottomSheet
          snap={snap}
          onSnap={setSnap}
          peek={
            problem ? (
              slo.checks.every((c) => c.pass !== false) ? (
                <>
                  <strong>All SLOs passing</strong> · Finish when ready
                </>
              ) : (
                <>
                  <strong>
                    SLOs {passing(slo.checks)} of {slo.checks.length} passing
                  </strong>{" "}
                  · next: {slo.checks.find((c) => c.pass === false)?.label}
                </>
              )
            ) : sim.bottleneck ? (
              <>
                <strong>Bottleneck</strong> · {label(sim.bottleneck.id)} · ρ {sim.bottleneck.rho.toFixed(2)}
              </>
            ) : (
              <>
                <strong>Success {percent(sim.e2e.successRate)}</strong> · no bottleneck
              </>
            )
          }
        >
          {body}
        </BottomSheet>
      ) : (
        <aside className={styles.panel} aria-label="Side panel">
          {body}
        </aside>
      )}
    </>
  );
}

export function BoardScreen({ id }: { id: string }) {
  const [tab, setTab] = useState<PanelTab>("metrics");
  const { status, board, events, persistent, load, undo, redo, rename } = useBoardStore();
  const requestFinish = useBoardStore((s) => s.requestFinish);
  const canUndo = useBoardStore((s) => s.undoStack.length > 0);
  const canRedo = useBoardStore((s) => s.redoStack.length > 0);

  useEffect(() => {
    void load(id);
  }, [id, load]);

  const problem = board?.mode === "interview" && board.problemId ? (PROBLEMS[board.problemId as ProblemId] ?? null) : null;
  const interview = problem ? readInterview(board?.interview) : null;
  // Interview boards open on the Interview tab.
  const boardId = board?.id;
  const interviewMode = !!problem;
  useEffect(() => {
    if (boardId) setTab(interviewMode ? "interview" : "metrics");
  }, [boardId, interviewMode]);

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
      <div className={styles.screen} data-screen>
        <header className={styles.topbar}>
          <Link href="/" className={styles.brand} aria-label="Archie home">
            <ArrowLeft size={16} aria-hidden />
            <LogoMark size={20} />
            <span>Archie</span>
          </Link>
          {problem && <span className={styles.modeTag}>Interview ·</span>}
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
            {problem && (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setTab("interview");
                  requestFinish();
                }}
              >
                <Flag size={16} aria-hidden /> Finish
              </button>
            )}
            <button type="button" className={styles.iconButton} onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
              <Undo2 size={16} aria-hidden />
            </button>
            <button type="button" className={styles.iconButton} onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
              <Redo2 size={16} aria-hidden />
            </button>
          </div>
        </header>
        {!persistent && (
          <p className={styles.banner} role="status">
            This browser won’t save boards. Use Export (coming soon) to keep your work.
          </p>
        )}
        <main className={styles.main}>
          {board.graph.nodes.length === 0 && !problem ? (
            <>
              <section className={styles.canvas} aria-label="Board">
                <EmptyBoard />
              </section>
              <aside className={styles.panel} aria-label="Side panel">
                <h2 className={styles.panelTitle}>History</h2>
                <EventLog events={events} />
              </aside>
            </>
          ) : (
            <SimulatedBoard graph={board.graph} tab={tab} onTab={setTab} problem={problem} interview={interview} />
          )}
        </main>
        <CommandBar />
      </div>
    </ReactFlowProvider>
  );
}
