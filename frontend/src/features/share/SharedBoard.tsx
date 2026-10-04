"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import { decodeShare, type SharedBoard as Shared } from "@archie/database";
import { LogoMark } from "@/components/brand/LogoMark";
import { createBoardFromGraph } from "@/lib/boards";
import { percent } from "@/lib/format";
import { MetricsPanel } from "../metrics/MetricsPanel";
import { BottomSheet, type Snap } from "../board/BottomSheet";
import { Canvas } from "../board/Canvas";
import { useCompactLayout } from "../board/useCompactLayout";
import { useSimulation } from "../board/useSimulation";
import { useSpofScan } from "../board/useSpofScan";
import styles from "../board/board.module.css";

/**
 * Read-only shared board (UF-12, FR-042). The design is decoded from the URL hash in the browser
 * (ADR-010), validated (T-06), simulated live, and can be saved as a new board with Duplicate.
 */

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; board: Shared };

function SharedView({ board }: { board: Shared }) {
  const router = useRouter();
  const { sim, baseline } = useSimulation(board.graph);
  const scan = useSpofScan(board.graph);
  const { compact } = useCompactLayout();
  const [snap, setSnap] = useState<Snap>("peek");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = (id: string) => board.graph.nodes.find((n) => n.id === id)?.label ?? id;

  async function duplicate() {
    setSaving(true);
    try {
      router.push(`/b/${await createBoardFromGraph(board.name, board.graph)}`);
    } catch (err) {
      console.error(err);
      setError("Couldn’t save a copy in this browser.");
      setSaving(false);
    }
  }

  const metrics = <MetricsPanel graph={board.graph} sim={sim} baseline={baseline} scan={scan} />;
  return (
    <ReactFlowProvider>
      <div className={styles.screen} data-screen>
        <header className={styles.topbar}>
          <Link href="/" className={styles.brand} aria-label="Archie home">
            <ArrowLeft size={16} aria-hidden />
            <LogoMark size={20} />
            <span>Archie</span>
          </Link>
          <h1 className={styles.sharedName}>{board.name}</h1>
          <div className={styles.topActions}>
            <button type="button" className={styles.textButton} onClick={duplicate} disabled={saving}>
              <Copy size={16} aria-hidden /> {saving ? "Saving…" : "Duplicate"}
            </button>
          </div>
        </header>
        <p className={styles.banner} role="status">
          {error ?? "Shared board · read-only. Duplicate it to edit, talk to it and keep it in your browser."}
        </p>
        <main className={styles.main}>
          <section className={styles.canvas} aria-label="Board">
            <Canvas graph={board.graph} sim={sim} spofs={scan.spofs} readOnly />
          </section>
          {compact ? (
            <BottomSheet
              snap={snap}
              onSnap={setSnap}
              peek={
                sim.bottleneck ? (
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
              {metrics}
            </BottomSheet>
          ) : (
            <aside className={styles.panel} aria-label="Side panel">
              <h2 className={styles.panelTitle}>Metrics</h2>
              {metrics}
            </aside>
          )}
        </main>
      </div>
    </ReactFlowProvider>
  );
}

export function SharedBoard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const read = () => {
      const decoded = decodeShare(window.location.hash);
      setState(decoded.ok ? { status: "ok", board: decoded.value } : { status: "error", message: decoded.error });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (state.status === "loading") {
    return (
      <main className={styles.message} aria-busy="true">
        <p className={styles.muted}>Opening shared board…</p>
      </main>
    );
  }
  if (state.status === "error") {
    // EF-05: never throws, never echoes the link back.
    return (
      <main className={styles.message}>
        <h1>This link is broken or from a newer version</h1>
        <p className={styles.muted}>{state.message} Ask for a new link, or open the board’s JSON export instead.</p>
        <Link href="/" className={styles.button}>
          Go home
        </Link>
      </main>
    );
  }
  return <SharedView board={state.board} />;
}
