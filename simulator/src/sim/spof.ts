import type { ArchNode, Graph } from "../graph";
import { buildModel } from "./model";
import { propagate } from "./propagate";
import { reliability } from "./reliability";

/**
 * SPOF scan (FR-027, docs/11, docs/34 Step 1). A single failure is losing **one instance**, as in
 * the failure model ("kill one API server" = replicas − 1): a component with replicas ≥ 2 loses a
 * replica; a single-instance component goes down entirely (SQL failover still applies). It is a
 * single point of failure when that loses at least SPOF_DROP (5%) of the requests that succeed
 * today: (baseline − after) / baseline. Relative, not "below 99%": on an overloaded board every
 * failure lands below 99%. Proportional, not 5 points: a hopeless board at 1% success would
 * otherwise never show a SPOF. Per instance, not per component: compute nodes call every dependency (docs/10), so a
 * whole-component outage of a 3-broker Kafka would always count, which no design could avoid.
 */
export const SPOF_DROP = 0.05;

export interface Spof {
  id: string;
  /** Success rate after losing one instance. */
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
    const failed: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === node.id ? loseOneInstance(n) : n)),
    };
    const rate = successRate(failed);
    runs += 1;
    const drop = baseline - rate;
    if (baseline > 0 && drop / baseline >= SPOF_DROP - 1e-12)
      spofs.push({ id: node.id, successRate: rate, drop });
  }
  spofs.sort((a, b) => b.drop - a.drop || a.id.localeCompare(b.id));
  return { baseline, spofs, runs };
}

/** One instance fails: a replica of a cluster, or the whole component when it has only one. */
export function loseOneInstance(node: ArchNode): ArchNode {
  return node.props.replicas > 1
    ? { ...node, props: { ...node.props, replicas: node.props.replicas - 1 } }
    : { ...node, status: "down" };
}
