import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, TEMPLATES, type Graph, type Op, type TemplateId } from "../graph";
import { simulate } from "./simulate";

const templateIds = Object.keys(TEMPLATES) as TemplateId[];

function withWorkload(graph: Graph, ops: Op[]): Graph {
  const r = applyBatch(graph, ops);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join("; "));
  return r.graph;
}

const workload = fc.record({
  rps: fc.integer({ min: 0, max: 2_000_000 }),
  readRatio: fc.double({ min: 0, max: 1, noNaN: true }),
  peakMultiplier: fc.double({ min: 1, max: 5, noNaN: true }),
});

describe("simulator properties", () => {
  it("never produces NaN, Infinity or out-of-range rates, for any workload and failures", () => {
    fc.assert(
      fc.property(fc.constantFrom(...templateIds), workload, fc.array(fc.nat(), { maxLength: 4 }), (id, w, failPicks) => {
        const base = buildTemplate(id);
        const fails: Op[] = [...new Set(failPicks.map((i) => base.nodes[i % base.nodes.length]!.id))].map((nodeId) => ({
          type: "fail",
          id: nodeId,
        }));
        const sim = simulate(withWorkload(base, [{ type: "setWorkload", ...w }, ...fails]));
        expect(sim.e2e.successRate).toBeGreaterThanOrEqual(0);
        expect(sim.e2e.successRate).toBeLessThanOrEqual(1 + 1e-12);
        expect(Number.isFinite(sim.e2e.throughput)).toBe(true);
        for (const m of Object.values(sim.nodes)) {
          for (const v of [m.lambdaRead, m.lambdaWrite, m.rho, m.errorRate]) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
          }
          expect(m.errorRate).toBeLessThanOrEqual(1);
          expect(m.explanation.length).toBeGreaterThan(0);
          expect(m.explanation).not.toMatch(/NaN|Infinity|undefined/);
        }
        for (const e of Object.values(sim.edges)) {
          expect(e.errorRps).toBeLessThanOrEqual(e.rps + 1e-6);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("conserves traffic at routing nodes: Σ outgoing = served incoming", () => {
    fc.assert(
      fc.property(workload, (w) => {
        const sim = simulate(withWorkload(buildTemplate("three-tier"), [{ type: "setWorkload", ...w }]));
        const lb = sim.nodes.lb!;
        const served = (lb.lambdaRead + lb.lambdaWrite) * (1 - lb.errorRate);
        expect(sim.edges["lb->api"]!.rps).toBeCloseTo(served, 1);
      }),
      { numRuns: 100 },
    );
  });

  it("utilization never decreases as traffic grows", () => {
    fc.assert(
      fc.property(fc.constantFrom(...templateIds), fc.integer({ min: 0, max: 500_000 }), fc.integer({ min: 1, max: 500_000 }), (id, rps, extra) => {
        const low = simulate(withWorkload(buildTemplate(id), [{ type: "setWorkload", rps }]));
        const high = simulate(withWorkload(buildTemplate(id), [{ type: "setWorkload", rps: rps + extra }]));
        for (const nodeId of Object.keys(low.nodes)) {
          // Saturated nodes upstream shield downstream, so compare only while upstream isn't dropping.
          if (Object.values(high.nodes).some((m) => m.status === "saturated")) return;
          expect(high.nodes[nodeId]!.rho).toBeGreaterThanOrEqual(low.nodes[nodeId]!.rho - 1e-9);
        }
      }),
      { numRuns: 100 },
    );
  });
});
