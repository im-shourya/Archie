import { effectiveProps, type Graph } from "../graph";
import { explain } from "./explain";
import { buildModel } from "./model";
import { monteCarlo } from "./montecarlo";
import { propagate } from "./propagate";
import { reliability } from "./reliability";
import { fnv1a, mulberry32 } from "./rng";
import type { EdgeMetrics, NodeMetrics, SimResult } from "./types";

/**
 * simulate(graph) → SimResult (docs/09). Deterministic: no clock, no Math.random; the
 * Monte Carlo seed is derived from the graph's simulation-relevant content.
 */

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;

export function seedFor(graph: Graph): number {
  return fnv1a(
    JSON.stringify({
      n: graph.nodes.map((n) => [n.id, n.kind, n.props, n.status]),
      e: graph.edges,
      w: graph.workload,
    }),
  );
}

export function simulate(graph: Graph): SimResult {
  const model = buildModel(graph);
  const prop = propagate(model);
  const rel = reliability(model, prop);
  const seed = seedFor(graph);

  const nodes: Record<string, NodeMetrics> = {};
  for (const node of graph.nodes) {
    const a = prop.arrivals.get(node.id)!;
    const q = prop.queueing.get(node.id)!;
    const metrics: NodeMetrics = {
      lambdaRead: round(a.read),
      lambdaWrite: round(a.write),
      rho: q.rho,
      meanMs: q.meanMs === null ? null : round(q.meanMs, 2),
      errorRate: q.errorRate,
      status: q.status,
      explanation: explain(model, prop, node.id),
    };
    if (prop.backlog.has(node.id)) metrics.backlogGrowth = round(prop.backlog.get(node.id)!);
    const primary = model.clusterOf.get(node.id);
    if (primary && model.clusters.get(primary)?.promoted === node.id) metrics.promotedFrom = primary;
    nodes[node.id] = metrics;
  }

  const edges: Record<string, EdgeMetrics> = {};
  for (const edge of graph.edges) {
    const load = prop.edgeLoad.get(edge.id)!;
    edges[edge.id] = {
      rps: round(load.read + load.write),
      errorRps: round(load.read * rel.edgeFail(edge, "read") + load.write * rel.edgeFail(edge, "write")),
    };
  }

  const clients = graph.nodes.filter((n) => n.kind === "client" && n.status === "up");
  const total = prop.injected.read + prop.injected.write;
  const { readRatio } = graph.workload;
  let successRate = 1;
  if (clients.length > 0 && total > 0) {
    successRate =
      clients.reduce(
        (s, c) => s + readRatio * (1 - rel.nodeFail(c.id, "read")) + (1 - readRatio) * (1 - rel.nodeFail(c.id, "write")),
        0,
      ) / clients.length;
  }

  let bottleneck: SimResult["bottleneck"] = null;
  for (const id of model.order) {
    const m = nodes[id]!;
    const node = model.byId.get(id)!;
    if (node.kind === "client" || node.status === "down" || m.status === "idle") continue;
    if (m.rho >= 0.7 && (!bottleneck || m.rho > bottleneck.rho)) bottleneck = { id, rho: m.rho, explanation: m.explanation };
  }

  const costMonthly = graph.nodes.reduce((sum, n) => {
    const p = effectiveProps(n);
    return sum + p.replicas * p.shards * p.costPerReplica;
  }, 0);

  const latency = monteCarlo(model, prop, mulberry32(seed));

  return {
    nodes,
    edges,
    e2e: { read: latency.read, write: latency.write, successRate, throughput: total * successRate },
    bottleneck,
    costMonthly,
    warnings: model.warnings,
    seed,
  };
}
