import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, emptyGraph, TEMPLATES, type Graph, type TemplateId } from "../index";
import { graphToBatches } from "./rebuild";

/** The content that matters (version and layout pins are not part of the design). */
const shape = (g: Graph) => ({
  nodes: g.nodes.map(({ pinned: _p, ...n }) => n),
  edges: g.edges,
  workload: g.workload,
});

function rebuild(g: Graph): Graph {
  let out = emptyGraph();
  for (const batch of graphToBatches(g)) {
    const r = applyBatch(out, batch);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    out = r.graph;
  }
  return out;
}

describe("graphToBatches", () => {
  it.each(Object.keys(TEMPLATES) as TemplateId[])("rebuilds the %s template exactly", (id) => {
    const g = buildTemplate(id);
    expect(shape(rebuild(g))).toEqual(shape(g));
  });

  it("keeps failed nodes, custom props, edge kinds, weights and the workload", () => {
    const r = applyBatch(buildTemplate("three-tier"), [
      { type: "fail", id: "redis" },
      { type: "updateNode", id: "api", props: { latencyMs: 40, capacityRps: 2000 } },
      { type: "setWorkload", rps: 1234, readRatio: 0.5, peakMultiplier: 3 },
      { type: "addNode", id: "kafka", kind: "queue", label: "Kafka" },
      { type: "connect", from: "api", to: "kafka", kind: "async", traffic: "write", weight: 2 },
    ]);
    if (!r.ok) throw new Error("fixture");
    expect(shape(rebuild(r.graph))).toEqual(shape(r.graph));
  });

  it("splits large boards into batches the op engine accepts (≤ 25 ops)", () => {
    let g = emptyGraph();
    for (let i = 0; i < 60; i += 20) {
      const r = applyBatch(g, Array.from({ length: 20 }, (_, j) => ({ type: "addNode", id: `s${i + j}`, kind: "service", label: `S${i + j}` })));
      if (!r.ok) throw new Error("fixture");
      g = r.graph;
    }
    const batches = graphToBatches(g);
    expect(batches.length).toBeGreaterThan(2);
    for (const b of batches) expect(b.length).toBeLessThanOrEqual(25);
    expect(shape(rebuild(g))).toEqual(shape(g));
  });

  it("returns no batches for an empty board", () => {
    expect(graphToBatches(emptyGraph())).toEqual([]);
  });
});
