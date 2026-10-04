"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pause, Play, SkipBack, SkipForward } from "@phosphor-icons/react/dist/ssr";
import { ReactFlowProvider } from "@xyflow/react";
import { replay, sameDesign, type BoardEvent } from "@archie/simulator";
import { getRepository, type Board } from "@archie/database";
import { LogoMark } from "@/components/brand/LogoMark";
import { percent } from "@/lib/format";
import { BottomSheet, type Snap } from "../board/BottomSheet";
import { Canvas } from "../board/Canvas";
import { describeEvent } from "../board/EventLog";
import { useCompactLayout } from "../board/useCompactLayout";
import { useSimulation } from "../board/useSimulation";
import { useSpofScan } from "../board/useSpofScan";
import { flushWrites } from "../store/board.store";
import styles from "../board/board.module.css";
import replayStyles from "./replay.module.css";

/** Session replay (FR-044, UF-13): scrub or play through the board's change log, read-only. */

const PLAY_MS = 1_200;

type Loaded = { status: "loading" } | { status: "missing" } | { status: "ready"; board: Board; events: BoardEvent[] };

function ReplayView({ board, events }: { board: Board; events: BoardEvent[] }) {
  const { steps, stoppedAt } = useMemo(() => replay(events), [events]);
  const last = steps.length - 1;
  const [step, setStep] = useState(last);
  const [playing, setPlaying] = useState(false);
  const graph = steps[step]!;
  const { sim } = useSimulation(graph);
  const scan = useSpofScan(graph);
  const { compact } = useCompactLayout();
  const [snap, setSnap] = useState<Snap>("peek");
  const matches = stoppedAt === null && sameDesign(steps[last]!, board.graph);
  const label = (i: number) => (i === 0 ? "Empty board" : describeEvent(events[i - 1]!));

  useEffect(() => {
    if (!playing) return;
    if (step >= last) return setPlaying(false);
    const timer = setTimeout(() => setStep((s) => Math.min(last, s + 1)), PLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, step, last]);

  const status = graph.nodes.length
    ? `Success ${percent(sim.e2e.successRate)}${sim.bottleneck ? ` · bottleneck ${graph.nodes.find((n) => n.id === sim.bottleneck!.id)?.label ?? sim.bottleneck.id} ρ ${sim.bottleneck.rho.toFixed(2)}` : ""}`
    : "No components yet";

  const controls = (
    <div className={replayStyles.controls}>
      <button type="button" className={styles.iconButton} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label="Previous step">
        <SkipBack size={16} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.textButton}
        onClick={() => {
          if (!playing && step >= last) setStep(0);
          setPlaying((p) => !p);
        }}
      >
        {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />} {playing ? "Pause" : "Play"}
      </button>
      <button type="button" className={styles.iconButton} onClick={() => setStep((s) => Math.min(last, s + 1))} disabled={step === last} aria-label="Next step">
        <SkipForward size={16} aria-hidden />
      </button>
      <span className={replayStyles.position} aria-live="polite">
        Step {step} of {last}
      </span>
    </div>
  );

  const panel = (
    <>
      {!compact && controls}
      <input
        type="range"
        className={replayStyles.scrubber}
        min={0}
        max={last}
        value={step}
        onChange={(e) => {
          setPlaying(false);
          setStep(Number(e.currentTarget.value));
        }}
        aria-label="Replay step"
        aria-valuetext={`Step ${step} of ${last}: ${label(step)}`}
      />
      <p className={replayStyles.status}>{status}</p>
      {!matches && (
        <p className={replayStyles.note} role="note" data-testid="replay-note">
          {stoppedAt !== null
            ? `The oldest changes were trimmed from the log, so replay covers the first ${stoppedAt} of ${events.length}.`
            : "The replay ends differently from the saved board: some changes happened outside the log."}
        </p>
      )}
      <ol className={replayStyles.steps} aria-label="Changes">
        {steps.map((_, i) => (
          <li key={i}>
            <button
              type="button"
              className={replayStyles.stepButton}
              aria-current={i === step ? "step" : undefined}
              onClick={() => {
                setPlaying(false);
                setStep(i);
              }}
            >
              <span className={replayStyles.stepIndex}>{i}</span> {label(i)}
            </button>
          </li>
        ))}
      </ol>
    </>
  );

  return (
    <ReactFlowProvider>
      <div className={styles.screen} data-screen>
        <header className={styles.topbar}>
          <Link href={`/b/${board.id}`} className={styles.brand} aria-label="Exit replay, back to the board">
            <ArrowLeft size={16} aria-hidden />
            <LogoMark size={20} />
            <span>Board</span>
          </Link>
          <h1 className={styles.sharedName}>Replay · {board.name}</h1>
        </header>
        <main className={styles.main}>
          <section className={styles.canvas} aria-label="Board at this step">
            <Canvas graph={graph} sim={sim} spofs={scan.spofs} readOnly />
          </section>
          {compact ? (
            <BottomSheet snap={snap} onSnap={setSnap} peek={controls}>
              {panel}
            </BottomSheet>
          ) : (
            <aside className={styles.panel} aria-label="Replay controls">
              <h2 className={styles.panelTitle}>Replay</h2>
              {panel}
            </aside>
          )}
        </main>
      </div>
    </ReactFlowProvider>
  );
}

export function ReplayScreen({ id }: { id: string }) {
  const [state, setState] = useState<Loaded>({ status: "loading" });
  useEffect(() => {
    let live = true;
    void (async () => {
      // A change made just before opening replay may still be in its debounced save.
      await flushWrites();
      const repo = await getRepository();
      const [board, events] = await Promise.all([repo.getBoard(id), repo.listEvents(id)]);
      if (live) setState(board ? { status: "ready", board, events } : { status: "missing" });
    })();
    return () => {
      live = false;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <main className={styles.message} aria-busy="true">
        <p className={styles.muted}>Loading replay…</p>
      </main>
    );
  }
  if (state.status === "missing") {
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
  return <ReplayView board={state.board} events={state.events} />;
}
