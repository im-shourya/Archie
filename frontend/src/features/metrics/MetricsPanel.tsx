"use client";

import type { Graph, SimResult } from "@archie/simulator";
import { compact, ms, percent, usd } from "@/lib/format";
import styles from "./metrics.module.css";

interface Props {
  graph: Graph;
  sim: SimResult;
  baseline: SimResult | null;
}

const HOT = new Set(["hot", "saturated"]);

function Delta({ before, after, unit }: { before: string; after: string; unit?: string }) {
  return (
    <span className={styles.delta}>
      {before} → <strong>{after}</strong>
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

export function MetricsPanel({ graph, sim, baseline }: Props) {
  const { workload } = graph;
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const down = graph.nodes.filter((n) => n.status === "down");
  const newlyHot = baseline
    ? Object.entries(sim.nodes)
        .filter(([id, m]) => HOT.has(m.status) && !HOT.has(baseline.nodes[id]?.status ?? ""))
        .map(([id]) => label(id))
    : [];

  return (
    <div className={styles.panel} data-testid="metrics">
      <section aria-labelledby="m-workload">
        <h3 id="m-workload" className={styles.heading}>
          Workload
        </h3>
        <p className={styles.workload}>
          {compact(workload.rps)} rps · {Math.round(workload.readRatio * 100)}% reads
          {workload.peakMultiplier !== 1 ? ` · peak ×${workload.peakMultiplier}` : ""}
        </p>
        <p className={styles.hint}>Change it by voice: “send 20k rps, 80% reads”.</p>
      </section>

      <section aria-labelledby="m-results">
        <h3 id="m-results" className={styles.heading}>
          Results
        </h3>
        <dl className={styles.stats}>
          <div>
            <dt>Success</dt>
            <dd data-testid="success-rate" data-bad={sim.e2e.successRate < 0.99 ? "true" : undefined}>
              {percent(sim.e2e.successRate)}
            </dd>
          </div>
          <div>
            <dt>Throughput</dt>
            <dd>{compact(sim.e2e.throughput)} rps</dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>{usd(sim.costMonthly)}/mo</dd>
          </div>
        </dl>
        <table className={styles.latency}>
          <caption className={styles.srOnly}>End-to-end latency</caption>
          <thead>
            <tr>
              <th scope="col">Latency</th>
              <th scope="col">p50</th>
              <th scope="col">p95</th>
              <th scope="col">p99</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Reads</th>
              <td>{ms(sim.e2e.read.p50)}</td>
              <td>{ms(sim.e2e.read.p95)}</td>
              <td data-testid="read-p99">{ms(sim.e2e.read.p99)}</td>
            </tr>
            <tr>
              <th scope="row">Writes</th>
              <td>{ms(sim.e2e.write.p50)}</td>
              <td>{ms(sim.e2e.write.p95)}</td>
              <td>{ms(sim.e2e.write.p99)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {baseline && down.length > 0 && (
        <section aria-labelledby="m-blast" className={styles.blast}>
          <h3 id="m-blast" className={styles.heading}>
            Blast radius · {down.map((n) => n.label).join(", ")} down
          </h3>
          <ul className={styles.list}>
            <li>
              Success <Delta before={percent(baseline.e2e.successRate)} after={percent(sim.e2e.successRate)} />
            </li>
            <li>
              Read p99 <Delta before={ms(baseline.e2e.read.p99)} after={ms(sim.e2e.read.p99)} />
            </li>
            {newlyHot.length > 0 && <li>Now hot: {newlyHot.join(", ")}</li>}
          </ul>
        </section>
      )}

      <section aria-labelledby="m-bottleneck">
        <h3 id="m-bottleneck" className={styles.heading}>
          Bottleneck
        </h3>
        {sim.bottleneck ? (
          <p className={styles.explain}>
            <strong>{label(sim.bottleneck.id)}</strong> · ρ {sim.bottleneck.rho.toFixed(2)}
            <br />
            {sim.bottleneck.explanation}
          </p>
        ) : (
          <p className={styles.hint}>None: every component has at least 30% headroom.</p>
        )}
      </section>

      {sim.warnings.length > 0 && (
        <section aria-labelledby="m-warnings">
          <h3 id="m-warnings" className={styles.heading}>
            Notes
          </h3>
          <ul className={styles.list}>
            {sim.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
