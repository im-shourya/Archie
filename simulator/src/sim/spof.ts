import type { Graph } from "../graph";
import { buildModel } from "./model";
import { propagate } from "./propagate";
import { reliability } from "./reliability";

/**
 * SPOF scan (FR-027, docs/11, docs/34 Step 1). A component is a single point of failure when
 * failing the whole component (the `fail` op) costs at least SPOF_DROP of end-to-end success
 * relative to the current board. Relative, not "below 99%": on an overloaded board every
 * failure lands below 99%, while only real path breaks lose more than a point or so.
 */
export const SPOF_DROP = 0.05;

export interface Spof {
  id: string;
  /** Success rate with this component down. */
  successRate: number;
  /** baseline − successRate. */
  drop: number;
}

export interface SpofScan {
  baseline: number;
  spofs: Spof[];
  /** Number of what-if simulations run. */
  runs: number;
}

/**
 * Exact end-to-end success rate (ADR-013), without the latency Monte Carlo. simulate() uses the
 * same function, so the scan and the metrics panel always agree.
 */
export function successRate(graph: Graph): number {
  const model = buildModel(graph);
  const prop = propagate(model);
  return successFrom(graph, prop, reliability(model, prop));
}

/** The success formula itself, shared with simulate() (which has prop/rel already). */
export function successFrom(
  graph: Graph,
  prop: ReturnType<typeof propagate>,
  rel: ReturnType<typeof reliability>,
): number {
  const clients = graph.nodes.filter((n) => n.kind === "client" && n.status === "up");
  const total = prop.injected.read + prop.injected.write;
  if (clients.length === 0 || total <= 0) return 1;
  const { readRatio } = graph.workload;
  return (
    clients.reduce(
      (s, c) =>
        s +
        readRatio * (1 - rel.nodeFail(c.id, "read")) +
        (1 - readRatio) * (1 - rel.nodeFail(c.id, "write")),
      0,
    ) / clients.length
  );
}

export function spofScan(graph: Graph): SpofScan {
  const hasClients = graph.nodes.some((n) => n.kind === "client" && n.status === "up");
  if (!hasClients) return { baseline: 1, spofs: [], runs: 0 };
  const baseline = successRate(graph);
  const spofs: Spof[] = [];
  let runs = 0;
  for (const node of graph.nodes) {
    if (node.kind === "client" || node.status === "down") continue;
    // Same effect as the `fail` op: the whole component goes down.
    const failed: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === node.id ? { ...n, status: "down" } : n)),
    };
    const rate = successRate(failed);
    runs += 1;
    const drop = baseline - rate;
    if (drop >= SPOF_DROP - 1e-12) spofs.push({ id: node.id, successRate: rate, drop });
  }
  spofs.sort((a, b) => b.drop - a.drop || a.id.localeCompare(b.id));
  return { baseline, spofs, runs };
}
