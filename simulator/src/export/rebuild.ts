import { emptyGraph, MAX_OPS_PER_BATCH, type Graph, type Op } from "../graph";

/**
 * The ops that build `graph` from an empty board, in batches the op engine accepts. Duplicating
 * a shared board and importing a JSON export log these, so History and replay start from them.
 * Layout pins are not ops (docs/08) and are not included.
 */
export function graphToBatches(graph: Graph): Op[][] {
  const ops: Op[] = [
    ...graph.nodes.map((n): Op => ({ type: "addNode", id: n.id, kind: n.kind, label: n.label, props: { ...n.props } })),
    ...graph.edges.map(
      (e): Op => ({ type: "connect", from: e.from, to: e.to, kind: e.kind, traffic: e.traffic, ...(e.weight !== undefined ? { weight: e.weight } : {}) }),
    ),
    ...graph.nodes.filter((n) => n.status === "down").map((n): Op => ({ type: "fail", id: n.id })),
  ];
  const w = graph.workload;
  const d = emptyGraph().workload;
  if (w.rps !== d.rps || w.readRatio !== d.readRatio || w.peakMultiplier !== d.peakMultiplier) {
    ops.push({ type: "setWorkload", rps: w.rps, readRatio: w.readRatio, peakMultiplier: w.peakMultiplier });
  }
  const batches: Op[][] = [];
  for (let i = 0; i < ops.length; i += MAX_OPS_PER_BATCH) batches.push(ops.slice(i, i + MAX_OPS_PER_BATCH));
  return batches;
}
