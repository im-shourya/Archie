import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, emptyGraph, type Graph, type Op } from "../graph";
import { simulate } from "./simulate";

/**
 * Golden tests: hand-computed numbers from docs/10 (traffic) and docs/11 (failures).
 * If one of these changes, the docs change in the same PR.
 */

function edit(graph: Graph, ops: Op[]): Graph {
  const r = applyBatch(graph, ops);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join("\n"));
  return r.graph;
}

function build(ops: Op[]): Graph {
  return edit(emptyGraph(), ops);
}

const threeTier = buildTemplate("three-tier"); // 50,000 rps, 90% reads

describe("three-tier-50k (docs/10 worked example)", () => {
  const sim = simulate(threeTier);
  const n = (id: string) => sim.nodes[id]!;

  it("splits the workload into 45,000 reads/s and 5,000 writes/s at the client", () => {
    expect(n("client")).toMatchObject({ lambdaRead: 45_000, lambdaWrite: 5_000 });
  });

  it("lb: 50,000 rps on 2 × 50,000 → ρ = 0.50, healthy", () => {
    expect(n("lb").rho).toBeCloseTo(0.5, 6);
    expect(n("lb").status).toBe("healthy");
  });

  it("api: 50,000 rps on 30 × 2,000 → ρ = 0.833, warm, W = 20 / (1 − ρ) = 120 ms", () => {
    expect(n("api").rho).toBeCloseTo(50_000 / 60_000, 6);
    expect(n("api").status).toBe("warm");
    expect(n("api").meanMs).toBeCloseTo(120, 6);
  });

  it("redis (cache-aside): receives all 45,000 reads, ρ = 0.45", () => {
    expect(n("redis")).toMatchObject({ lambdaRead: 45_000, lambdaWrite: 0, status: "healthy" });
    expect(n("redis").rho).toBeCloseTo(0.45, 6);
  });

  it("pg: misses 4,500 ÷ 3 = 1,500 reads + 5,000 writes → ρ = 1.40, saturated, e = 28.6%", () => {
    expect(n("pg").lambdaRead).toBeCloseTo(1_500, 6);
    expect(n("pg").lambdaWrite).toBeCloseTo(5_000, 6);
    expect(n("pg").rho).toBeCloseTo(1.4, 6);
    expect(n("pg").status).toBe("saturated");
    expect(n("pg").errorRate).toBeCloseTo(1 - 1 / 1.4, 6);
    expect(n("pg").meanMs).toBeNull();
  });

  it("replicas: 1,500 reads each, no writes, ρ = 0.15", () => {
    for (const id of ["pg-r1", "pg-r2"]) {
      expect(n(id)).toMatchObject({ lambdaRead: 1_500, lambdaWrite: 0, status: "healthy" });
      expect(n(id).rho).toBeCloseTo(0.15, 6);
    }
  });

  it("success = 0.9 × (0.9 + 0.1 × (1 − ⅓ × 2/7)) + 0.1 × (1 − 2/7) = 96.29%", () => {
    const e = 1 - 1 / 1.4;
    const expected = 0.9 * (0.9 + 0.1 * (1 - e / 3)) + 0.1 * (1 - e);
    expect(sim.e2e.successRate).toBeCloseTo(expected, 9);
    expect(sim.e2e.throughput).toBeCloseTo(50_000 * expected, 6);
  });

  it("names pg as the bottleneck with the numbers in the explanation", () => {
    expect(sim.bottleneck?.id).toBe("pg");
    expect(sim.bottleneck?.rho).toBeCloseTo(1.4, 6);
    expect(sim.bottleneck?.explanation).toBe(
      "1,500 reads/s + 5,000 writes/s on 1 shard (capacity 10,000 reads / 4,000 writes per shard) → ρ = 1.40 → 28.6% of its requests dropped. Consider: shard the database, or reduce writes.",
    );
  });

  it("records edge traffic and the share that fails downstream", () => {
    expect(sim.edges["client->lb"]!.rps).toBeCloseTo(50_000, 6);
    expect(sim.edges["api->redis"]!.rps).toBeCloseTo(45_000, 6);
    expect(sim.edges["api->pg"]!.rps).toBeCloseTo(9_500, 6); // 4,500 reads + 5,000 writes to the cluster
    expect(sim.edges["pg->pg-r1"]!.rps).toBeCloseTo(1_500, 6);
    const e = 1 - 1 / 1.4;
    // Of the 9,500 sent to the cluster: 1,500 reads + 5,000 writes land on pg and fail with e.
    expect(sim.edges["api->pg"]!.errorRps).toBeCloseTo((1_500 + 5_000) * e, 2); // output rounded to 3 dp
    expect(sim.edges["api->redis"]!.errorRps).toBeCloseTo(0, 9);
  });

  it("estimates monthly cost from the catalog: Σ replicas × shards × cost", () => {
    // lb 2×20 + api 30×70 + redis 1×120 + pg 1×400 + 2 replicas × 400
    expect(sim.costMonthly).toBe(40 + 2_100 + 120 + 400 + 800);
  });

  it("produces finite latency percentiles, reads faster than writes", () => {
    const { read, write } = sim.e2e;
    for (const p of [read.p50, read.p95, read.p99, write.p50, write.p95, write.p99]) {
      expect(p).not.toBeNull();
      expect(Number.isFinite(p!)).toBe(true);
    }
    expect(read.p50!).toBeLessThan(read.p99!);
    expect(read.p50!).toBeLessThan(write.p50!);
  });
});

describe("three-tier-sharded: 'shard Postgres into two'", () => {
  const sim = simulate(edit(threeTier, [{ type: "updateNode", id: "pg", props: { shards: 2 } }]));

  it("pg: 1,500/20,000 + 5,000/8,000 = 0.70 → warm, no errors", () => {
    expect(sim.nodes.pg!.rho).toBeCloseTo(0.7, 9);
    expect(sim.nodes.pg!.status).toBe("warm");
    expect(sim.nodes.pg!.errorRate).toBe(0);
  });

  it("success returns to 100%; the bottleneck moves to the API (ρ 0.83)", () => {
    expect(sim.e2e.successRate).toBeCloseTo(1, 12);
    expect(sim.bottleneck?.id).toBe("api");
  });
});

describe("write-queue (docs/10 queue example)", () => {
  const graph = build([
    { type: "addNode", id: "client", kind: "client", label: "Users" },
    { type: "addNode", id: "api", kind: "service", label: "API", props: { replicas: 5 } },
    { type: "addNode", id: "kafka", kind: "queue", label: "Kafka" },
    { type: "addNode", id: "writer", kind: "worker", label: "Writer", props: { replicas: 4 } },
    { type: "addNode", id: "pg", kind: "sql", label: "Postgres" },
    { type: "connect", from: "client", to: "api" },
    { type: "connect", from: "api", to: "kafka", kind: "async", traffic: "write" },
    { type: "connect", from: "kafka", to: "writer", kind: "async" },
    { type: "connect", from: "writer", to: "pg", traffic: "write" },
    { type: "setWorkload", rps: 5_000, readRatio: 0 },
  ]);
  const sim = simulate(graph);

  it("drain = min(5,000, 4 × 500) = 2,000 → backlog grows by 3,000 msg/s", () => {
    expect(sim.nodes.kafka!.backlogGrowth).toBeCloseTo(3_000, 6);
    expect(sim.nodes.writer!.lambdaWrite).toBeCloseTo(2_000, 6);
    expect(sim.nodes.pg!.lambdaWrite).toBeCloseTo(2_000, 6);
  });

  it("explains the backlog and how many consumers to add", () => {
    expect(sim.nodes.kafka!.explanation).toBe(
      "Consumers drain 2,000/s of 5,000/s, so the backlog grows by 3,000 msg/s. Add 6 more Writer replicas.",
    );
  });

  it("consumers draining at exactly full capacity say so instead of '0% dropped'", () => {
    expect(sim.nodes.writer!.status).toBe("saturated");
    expect(sim.nodes.writer!.errorRate).toBe(0);
    expect(sim.nodes.writer!.explanation).toBe(
      "2,000 rps on 4 × 500 rps → ρ = 1.00: running at full capacity with no headroom. Consider: add replicas.",
    );
  });

  it("producers still succeed: the async work isn't on the request path", () => {
    expect(sim.e2e.successRate).toBeCloseTo(1, 12);
  });
});

describe("failures (docs/11)", () => {
  it("cache-down: reads fall through to the database cluster", () => {
    const sim = simulate(edit(threeTier, [{ type: "fail", id: "redis" }]));
    expect(sim.nodes.redis!.status).toBe("down");
    expect(sim.nodes.redis!.lambdaRead).toBe(0);
    // 45,000 reads ÷ 3 pool members = 15,000 each
    expect(sim.nodes.pg!.lambdaRead).toBeCloseTo(15_000, 6);
    expect(sim.nodes["pg-r1"]!.lambdaRead).toBeCloseTo(15_000, 6);
    expect(sim.nodes["pg-r1"]!.status).toBe("saturated");
    expect(sim.nodes.redis!.explanation).toBe(
      "Cache down: API sends all 45,000 reads/s to Postgres (primary) instead of about 4,500.",
    );
  });

  it("primary-failover: the first healthy replica is promoted and takes the writes", () => {
    const g = edit(threeTier, [
      { type: "setWorkload", rps: 10_000 },
      { type: "fail", id: "pg" },
    ]);
    const sim = simulate(g);
    // 9,000 reads → 900 misses → pool [pg-r1, pg-r2] = 450 each; 1,000 writes → pg-r1
    expect(sim.nodes["pg-r1"]).toMatchObject({ lambdaRead: 450, lambdaWrite: 1_000, promotedFrom: "pg" });
    expect(sim.nodes["pg-r2"]).toMatchObject({ lambdaRead: 450, lambdaWrite: 0 });
    expect(sim.nodes.pg!.explanation).toBe("Primary down: Postgres replica 1 promoted. Writes now go to Postgres replica 1.");
    expect(sim.e2e.successRate).toBeCloseTo(1, 12);
  });

  it("primary down without failover: writes fail, reads continue on replicas", () => {
    const g = edit(threeTier, [
      { type: "setWorkload", rps: 10_000 },
      { type: "updateNode", id: "pg", props: { failover: false } },
      { type: "fail", id: "pg" },
    ]);
    const sim = simulate(g);
    expect(sim.e2e.successRate).toBeCloseTo(0.9, 12); // every read succeeds, every write fails
    expect(sim.nodes.pg!.explanation).toBe("Primary down, no failover: writes fail; reads are served by 2 replicas.");
  });

  it("lb-reroute: a down target's share moves to the healthy targets", () => {
    const g = build([
      { type: "addNode", id: "client", kind: "client", label: "Users" },
      { type: "addNode", id: "lb", kind: "lb", label: "LB" },
      { type: "addNode", id: "api-a", kind: "service", label: "API A", props: { replicas: 5 } },
      { type: "addNode", id: "api-b", kind: "service", label: "API B", props: { replicas: 5 } },
      { type: "connect", from: "client", to: "lb" },
      { type: "connect", from: "lb", to: "api-a" },
      { type: "connect", from: "lb", to: "api-b" },
      { type: "setWorkload", rps: 8_000, readRatio: 0.5 },
    ]);
    expect(simulate(g).nodes["api-b"]!.lambdaRead + simulate(g).nodes["api-b"]!.lambdaWrite).toBeCloseTo(4_000, 6);
    const down = simulate(edit(g, [{ type: "fail", id: "api-a" }]));
    expect(down.nodes["api-b"]!.lambdaRead + down.nodes["api-b"]!.lambdaWrite).toBeCloseTo(8_000, 6);
    expect(down.nodes["api-a"]!.explanation).toBe("Down: traffic rerouted to 1 healthy target.");
    expect(down.e2e.successRate).toBeCloseTo(1, 12);
  });

  it("only target down: requests through that branch fail", () => {
    const g = edit(threeTier, [{ type: "fail", id: "api" }]);
    const sim = simulate(g);
    expect(sim.e2e.successRate).toBe(0);
    expect(sim.nodes.api!.explanation).toBe("Down: no healthy target, so 50,000 rps fail at Load balancer.");
  });
});

describe("determinism and edge cases", () => {
  it("same graph → identical result (seeded Monte Carlo)", () => {
    expect(simulate(threeTier)).toEqual(simulate(structuredCloneGraph(threeTier)));
  });

  it("empty graph: no traffic, a warning, no crash", () => {
    const sim = simulate(emptyGraph());
    expect(sim.bottleneck).toBeNull();
    expect(sim.warnings).toContain("Add a client (users) so traffic has somewhere to start.");
    expect(sim.e2e.read.p50).toBeNull();
  });

  it("idle components are marked idle", () => {
    const g = edit(threeTier, [{ type: "addNode", id: "search", kind: "search", label: "Search" }]);
    expect(simulate(g).nodes.search!.status).toBe("idle");
  });
});

function structuredCloneGraph(g: Graph): Graph {
  return JSON.parse(JSON.stringify(g)) as Graph;
}
