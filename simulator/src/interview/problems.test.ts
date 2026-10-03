import { describe, expect, it } from "vitest";
import { applyBatch, emptyGraph, MAX_OPS_PER_BATCH, type Graph, type Op } from "../graph";
import { atPeak, sloChecks } from "./checks";
import { PROBLEM_LIST, PROBLEMS } from "./problems";
import { REFERENCE_DESIGNS } from "./references";
import { CHECK_IDS, PROBLEM_IDS, type ProblemId } from "./types";

/** Golden tests (docs/34 Step 2): every problem is solvable, and the checks are computed. */

function build(ops: Op[], base: Graph = emptyGraph()): Graph {
  let graph = base;
  for (let i = 0; i < ops.length; i += MAX_OPS_PER_BATCH) {
    const result = applyBatch(graph, ops.slice(i, i + MAX_OPS_PER_BATCH));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
    graph = result.graph;
  }
  return graph;
}

const naive: Op[] = [
  { type: "addNode", id: "client", kind: "client", label: "Users" },
  { type: "addNode", id: "api", kind: "service", label: "API" },
  { type: "addNode", id: "db", kind: "sql", label: "DB" },
  { type: "connect", from: "client", to: "api" },
  { type: "connect", from: "api", to: "db" },
];

describe("problem bank (FR-050)", () => {
  it("has the six problems, ordered easy → hard, each with a brief and ≥ 6 tagged hints", () => {
    expect(PROBLEM_LIST.map((p) => p.id)).toEqual([...PROBLEM_IDS]);
    const rank = { easy: 0, medium: 1, hard: 2 };
    const ranks = PROBLEM_LIST.map((p) => rank[p.difficulty]);
    expect(ranks).toEqual([...ranks].sort());
    for (const p of PROBLEM_LIST) {
      expect(p.brief.length).toBeGreaterThan(40);
      expect(p.hints.length).toBeGreaterThanOrEqual(6);
      expect(p.hints[0]!.check).toBe("general");
      // Every check has at least one hint, so the fallback always has a question for it.
      for (const id of CHECK_IDS)
        expect(
          p.hints.some((h) => h.check === id),
          `${p.id} ${id}`,
        ).toBe(true);
    }
  });

  it("requirements are sane and the write target is never stricter than the read target", () => {
    for (const p of PROBLEM_LIST) {
      const r = p.requirements;
      expect(r.peakRps).toBeGreaterThan(0);
      expect(r.readRatio).toBeGreaterThan(0);
      expect(r.readRatio).toBeLessThan(1);
      expect(r.availability).toBeGreaterThanOrEqual(0.999);
      expect(r.p99WriteMs).toBeGreaterThanOrEqual(r.p99Ms);
      expect(r.monthlyBudget).toBeGreaterThan(0);
    }
  });
});

describe("sloChecks (FR-051)", () => {
  it.each(PROBLEM_IDS.map((id) => [id]))("%s: the reference design passes every check", (id) => {
    const graph = build(REFERENCE_DESIGNS[id as ProblemId]);
    const checks = sloChecks(graph, PROBLEMS[id as ProblemId]);
    expect(checks.map((c) => c.id)).toEqual([...CHECK_IDS]);
    expect(
      checks.filter((c) => c.pass === false),
      JSON.stringify(checks, null, 1),
    ).toEqual([]);
  });

  it.each(PROBLEM_IDS.map((id) => [id]))("%s: the reference fits in one batch", (id) => {
    expect(REFERENCE_DESIGNS[id as ProblemId].length).toBeLessThanOrEqual(MAX_OPS_PER_BATCH);
  });

  it.each(PROBLEM_IDS.map((id) => [id]))("%s: an empty board fails every check", (id) => {
    const checks = sloChecks(emptyGraph(), PROBLEMS[id as ProblemId]);
    expect(checks.every((c) => c.pass === false)).toBe(true);
    expect(checks.every((c) => c.actual === "no clients yet")).toBe(true);
  });

  it.each(PROBLEM_IDS.map((id) => [id]))(
    "%s: a naive one-box design fails headroom and SPOF",
    (id) => {
      const checks = sloChecks(build(naive), PROBLEMS[id as ProblemId]);
      const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
      expect(byId.headroom!.pass).toBe(false);
      expect(byId.spof!.pass).toBe(false);
      expect(byId.spof!.nodeIds.length).toBeGreaterThan(0);
    },
  );

  it("checks run at the problem's peak, whatever the board's workload", () => {
    const p = PROBLEMS["url-shortener"];
    const reference = build(REFERENCE_DESIGNS["url-shortener"]);
    const idle = build([{ type: "setWorkload", rps: 10, readRatio: 0.5 }], reference);
    expect(sloChecks(idle, p)).toEqual(sloChecks(reference, p));
    expect(atPeak(idle, p).workload).toEqual({
      rps: p.requirements.peakRps,
      readRatio: p.requirements.readRatio,
      peakMultiplier: 1,
    });
    // A naive design can't pass by lowering the load.
    const cheat = build([{ type: "setWorkload", rps: 10 }], build(naive));
    expect(sloChecks(cheat, p).find((c) => c.id === "headroom")!.pass).toBe(false);
  });

  it("labels and actuals are stable and readable", () => {
    const checks = sloChecks(build(REFERENCE_DESIGNS["url-shortener"]), PROBLEMS["url-shortener"]);
    expect(checks.map((c) => c.label)).toEqual([
      "Success ≥ 99.9% at peak",
      "Read p99 ≤ 200 ms",
      "Write p99 ≤ 300 ms",
      "Every component below ρ 0.9",
      "Survives any single failure",
      "Under $2,500/mo",
    ]);
    expect(checks.find((c) => c.id === "cost")!.actual).toBe("$1,740/mo");
  });

  it("the SPOF check names the SPOFs and points at them", () => {
    const checks = sloChecks(build(naive), PROBLEMS.chat);
    const spof = checks.find((c) => c.id === "spof")!;
    expect(spof.actual).toMatch(/are SPOFs$/);
    expect(spof.nodeIds).toEqual(expect.arrayContaining(["api", "db"]));
  });
});
