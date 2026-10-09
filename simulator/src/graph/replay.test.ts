import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, emptyGraph, TEMPLATES, type BoardEvent, type Graph, type Op } from "./index";
import { replay, sameDesign } from "./replay";

let n = 0;
const ev = (source: BoardEvent["source"], ops: Op[] = [], utterance: string | null = null): BoardEvent => ({
  id: `e${++n}`,
  at: n,
  utterance,
  source,
  ops,
  versionAfter: n,
});
const after = (g: Graph, ops: Op[]) => {
  const r = applyBatch(g, ops);
  if (!r.ok) throw new Error("fixture");
  return r.graph;
};

describe("replay (FR-044)", () => {
  const template = ev("template", TEMPLATES["three-tier"].ops);
  const kill = ev("fastpath", [{ type: "fail", id: "redis" }], "kill redis");
  const scale = ev("ai", [{ type: "replicate", id: "api", replicas: 50 }], "fifty api servers");

  it("starts empty and rebuilds every step", () => {
    const r = replay([template, kill, scale]);
    expect(r.steps).toHaveLength(4);
    expect(sameDesign(r.steps[0]!, emptyGraph())).toBe(true);
    expect(sameDesign(r.steps[1]!, buildTemplate("three-tier"))).toBe(true);
    expect(r.steps[2]!.nodes.find((x) => x.id === "redis")!.status).toBe("down");
    expect(r.steps[3]!.nodes.find((x) => x.id === "api")!.props.replicas).toBe(50);
    expect(r.stoppedAt).toBeNull();
  });

  it("mirrors the store's undo and redo stacks", () => {
    const r = replay([template, kill, ev("undo"), ev("redo"), ev("undo"), scale, ev("redo")]);
    const three = buildTemplate("three-tier");
    expect(sameDesign(r.steps[3]!, three)).toBe(true); // undo the kill
    expect(r.steps[4]!.nodes.find((x) => x.id === "redis")!.status).toBe("down"); // redo it
    expect(sameDesign(r.steps[5]!, three)).toBe(true); // undo again
    const scaled = after(three, scale.ops);
    expect(sameDesign(r.steps[6]!, scaled)).toBe(true);
    // A new change clears the redo stack, so the last redo changes nothing.
    expect(sameDesign(r.steps[7]!, scaled)).toBe(true);
  });

  it("stops where the log can't be replayed (trimmed history) and says where", () => {
    const r = replay([kill, scale]); // starts mid-history: redis doesn't exist on an empty board
    expect(r.stoppedAt).toBe(0);
    expect(r.steps).toHaveLength(1);
  });

  it("sameDesign ignores the version and layout pins", () => {
    const g = buildTemplate("three-tier");
    const pinned = { ...g, version: 99, nodes: g.nodes.map((x) => ({ ...x, pinned: { x: 1, y: 2 } })) };
    expect(sameDesign(g, pinned)).toBe(true);
    expect(sameDesign(g, after(g, [{ type: "fail", id: "redis" }]))).toBe(false);
  });
});
