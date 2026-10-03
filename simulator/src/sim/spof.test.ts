import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyBatch, emptyGraph, TEMPLATES, type Graph, type TemplateId } from "../graph";
import { simulate } from "./simulate";
import { loseOneInstance, SPOF_DROP, spofScan, successRate } from "./spof";

function template(id: TemplateId): Graph {
  const result = applyBatch(emptyGraph(), TEMPLATES[id].ops);
  if (!result.ok) throw new Error(`template ${id} failed`);
  return result.graph;
}

const ids = (graph: Graph) =>
  spofScan(graph)
    .spofs.map((s) => s.id)
    .sort();

describe("successRate", () => {
  it("matches simulate() exactly, without the Monte Carlo", () => {
    for (const id of Object.keys(TEMPLATES) as TemplateId[]) {
      const graph = template(id);
      expect(successRate(graph)).toBe(simulate(graph).e2e.successRate);
    }
  });
});

describe("spofScan (FR-027, docs/34 Step 1)", () => {
  it("three-tier: only Redis; two LBs, 30 API servers and Postgres with failover survive one loss", () => {
    const scan = spofScan(template("three-tier"));
    expect(scan.spofs.map((s) => s.id)).toEqual(["redis"]);
    expect(scan.spofs[0]!.successRate).toBeCloseTo(0.546, 2);
    expect(scan.baseline).toBeCloseTo(0.963, 3);
  });

  it("a cluster is a SPOF when losing one replica overloads the rest (N+1)", () => {
    // Chat runs 8 chat-service replicas near capacity: losing one costs ~6.7 points.
    expect(ids(template("chat"))).toContain("chat");
    const g = applyBatch(template("chat"), [{ type: "replicate", id: "chat", replicas: 12 }]);
    if (!g.ok) throw new Error("op failed");
    expect(ids(g.graph)).not.toContain("chat");
  });

  it("losing one instance: a replica of a cluster, or the whole single-instance component", () => {
    const graph = template("three-tier");
    const api = graph.nodes.find((n) => n.id === "api")!;
    const redis = graph.nodes.find((n) => n.id === "redis")!;
    expect(loseOneInstance(api)).toMatchObject({ status: "up", props: { replicas: 29 } });
    expect(loseOneInstance(redis)).toMatchObject({ status: "down", props: { replicas: 1 } });
  });

  it("Postgres without failover becomes a SPOF", () => {
    const g = applyBatch(template("three-tier"), [
      { type: "updateNode", id: "pg", props: { failover: false } },
    ]);
    if (!g.ok) throw new Error("op failed");
    expect(ids(g.graph)).toContain("pg");
  });

  it("URL shortener: the single CDN, LB and datastore; 10 API servers and the cache are not", () => {
    expect(ids(template("url-shortener"))).toEqual(["cdn", "links", "lb"].sort());
  });

  it("chat: gateway, chat service, Kafka and the message store; fan-out and presence are not", () => {
    expect(ids(template("chat"))).toEqual(["chat", "gateway", "kafka", "messages"]);
  });

  it("never lists clients or components that are already down", () => {
    const g = applyBatch(template("three-tier"), [{ type: "fail", id: "redis" }]);
    if (!g.ok) throw new Error("op failed");
    const found = ids(g.graph);
    expect(found).not.toContain("client");
    expect(found).not.toContain("redis");
  });

  it("an empty board, or one without clients, has no SPOFs", () => {
    expect(spofScan(emptyGraph()).spofs).toEqual([]);
    const g = applyBatch(emptyGraph(), [
      { type: "addNode", id: "api", kind: "service", label: "API" },
    ]);
    if (!g.ok) throw new Error("op failed");
    expect(spofScan(g.graph).spofs).toEqual([]);
  });

  it("two parallel paths at every tier: no SPOFs", () => {
    const g = applyBatch(emptyGraph(), [
      { type: "addNode", id: "client", kind: "client", label: "Users" },
      { type: "addNode", id: "lb-a", kind: "lb", label: "LB A" },
      { type: "addNode", id: "lb-b", kind: "lb", label: "LB B" },
      { type: "addNode", id: "api-a", kind: "service", label: "API A", props: { replicas: 10 } },
      { type: "addNode", id: "api-b", kind: "service", label: "API B", props: { replicas: 10 } },
      { type: "connect", from: "client", to: "lb-a" },
      { type: "connect", from: "client", to: "lb-b" },
      { type: "connect", from: "lb-a", to: "api-a" },
      { type: "connect", from: "lb-a", to: "api-b" },
      { type: "connect", from: "lb-b", to: "api-a" },
      { type: "connect", from: "lb-b", to: "api-b" },
      { type: "setWorkload", rps: 2_000, readRatio: 0.9 },
    ]);
    if (!g.ok) throw new Error(g.errors.map((e) => e.message).join("; "));
    expect(spofScan(g.graph).spofs).toEqual([]);
  });

  it("property: reported SPOFs lose ≥ 5 points when one instance fails, every other up node less", () => {
    const graphs = (Object.keys(TEMPLATES) as TemplateId[]).map(template);
    fc.assert(
      fc.property(
        fc.constantFrom(...graphs),
        fc.integer({ min: 1_000, max: 120_000 }),
        fc.double({ min: 0.5, max: 0.99, noNaN: true }),
        (base, rps, readRatio) => {
          const g = applyBatch(base, [{ type: "setWorkload", rps, readRatio }]);
          if (!g.ok) return;
          const scan = spofScan(g.graph);
          const reported = new Set(scan.spofs.map((s) => s.id));
          for (const node of g.graph.nodes) {
            if (node.kind === "client" || node.status === "down") continue;
            const op =
              node.props.replicas > 1
                ? { type: "replicate", id: node.id, replicas: node.props.replicas - 1 }
                : { type: "fail", id: node.id };
            const failed = applyBatch(g.graph, [op]);
            if (!failed.ok) continue;
            const drop = scan.baseline - successRate(failed.graph);
            expect(reported.has(node.id)).toBe(drop >= SPOF_DROP - 1e-12);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
