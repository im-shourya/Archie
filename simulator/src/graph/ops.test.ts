import { describe, expect, it } from "vitest";
import { applyBatch, MAX_OPS_PER_BATCH, validateBatch, type Op, type OpErrorCode } from "./ops";
import { buildTemplate } from "./templates";
import { emptyGraph, type Graph } from "./types";

function apply(graph: Graph, ops: unknown[]): Graph {
  const result = applyBatch(graph, ops);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("\n"));
  return result.graph;
}

function errorCodes(graph: Graph, ops: unknown[]): OpErrorCode[] {
  const result = applyBatch(graph, ops);
  if (result.ok) throw new Error("expected the batch to fail");
  return result.errors.map((e) => e.code);
}

const base = () =>
  apply(emptyGraph(), [
    { type: "addNode", id: "client", kind: "client", label: "Users" },
    { type: "addNode", id: "api", kind: "service", label: "API" },
    { type: "addNode", id: "db", kind: "sql", label: "Postgres" },
    { type: "connect", from: "client", to: "api" },
    { type: "connect", from: "api", to: "db" },
  ]);

describe("applyBatch: success paths", () => {
  it("adds nodes with catalog initial props and derives ids from labels", () => {
    const g = apply(emptyGraph(), [
      { type: "addNode", kind: "sql", label: "Postgres (primary)" },
      { type: "addNode", kind: "cache", label: "Redis" },
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(["postgres-primary", "redis"]);
    expect(g.nodes[0]!.props).toEqual({ replicas: 1, shards: 1, role: "primary", failover: false });
    expect(g.nodes[1]!.props).toEqual({ replicas: 1, hitRate: 0.9 });
    expect(g.nodes.every((n) => n.status === "up")).toBe(true);
  });

  it("de-duplicates derived ids", () => {
    const g = apply(emptyGraph(), [
      { type: "addNode", kind: "service", label: "API" },
      { type: "addNode", kind: "service", label: "API" },
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(["api", "api-2"]);
  });

  it("lets later ops reference nodes created earlier in the same batch", () => {
    const g = apply(emptyGraph(), [
      { type: "addNode", id: "a", kind: "service", label: "A" },
      { type: "addNode", id: "b", kind: "cache", label: "B" },
      { type: "connect", from: "a", to: "b", traffic: "read" },
      { type: "replicate", id: "a", replicas: 4 },
    ]);
    expect(g.edges).toEqual([{ id: "a->b", from: "a", to: "b", kind: "call", traffic: "read" }]);
    expect(g.nodes[0]!.props.replicas).toBe(4);
  });

  it("increments the version and never mutates the input graph", () => {
    const g = base();
    const snapshot = JSON.parse(JSON.stringify(g)) as Graph;
    const next = apply(g, [{ type: "updateNode", id: "api", props: { replicas: 3 } }]);
    expect(next.version).toBe(g.version + 1);
    expect(g).toEqual(snapshot);
  });

  it("removeNode also removes incident edges", () => {
    const g = apply(base(), [{ type: "removeNode", id: "api" }]);
    expect(g.nodes.map((n) => n.id)).toEqual(["client", "db"]);
    expect(g.edges).toEqual([]);
  });

  it("updateNode merges props and null resets a prop to the catalog default", () => {
    let g = apply(base(), [{ type: "updateNode", id: "api", label: "Checkout", props: { capacityRps: 5000 } }]);
    expect(g.nodes[1]).toMatchObject({ label: "Checkout", props: { replicas: 1, capacityRps: 5000 } });
    g = apply(g, [{ type: "updateNode", id: "api", props: { capacityRps: null } }]);
    expect(g.nodes[1]!.props).toEqual({ replicas: 1 });
  });

  it("insertBetween splices a node into an edge, keeping the edge kind and traffic", () => {
    const g = apply(base(), [
      { type: "insertBetween", from: "api", to: "db", node: { id: "kafka", kind: "queue", label: "Kafka" } },
    ]);
    expect(g.edges.map((e) => e.id).sort()).toEqual(["api->kafka", "client->api", "kafka->db"]);
    expect(g.edges.find((e) => e.id === "kafka->db")).toMatchObject({ kind: "call", traffic: "all" });
  });

  it("setWorkload merges, fail/recover toggle status, disconnect removes the edge", () => {
    let g = apply(base(), [
      { type: "setWorkload", rps: 50_000 },
      { type: "fail", id: "db" },
      { type: "disconnect", from: "client", to: "api" },
    ]);
    expect(g.workload).toEqual({ rps: 50_000, readRatio: 0.9, peakMultiplier: 1 });
    expect(g.nodes.find((n) => n.id === "db")!.status).toBe("down");
    expect(g.edges.map((e) => e.id)).toEqual(["api->db"]);
    g = apply(g, [{ type: "recover", id: "db" }]);
    expect(g.nodes.find((n) => n.id === "db")!.status).toBe("up");
  });

  it("reports which nodes changed", () => {
    const result = applyBatch(base(), [
      { type: "replicate", id: "api", replicas: 5 },
      { type: "addNode", id: "redis", kind: "cache", label: "Redis" },
    ]);
    expect(result.ok && result.changedNodeIds.sort()).toEqual(["api", "redis"]);
  });

  it("allows async edges to close a loop", () => {
    const g = apply(base(), [{ type: "connect", from: "db", to: "client", kind: "async" }]);
    expect(g.edges).toHaveLength(3);
  });

  it("accepts a sql primary → replica replication edge", () => {
    const g = apply(base(), [
      { type: "addNode", id: "db-r1", kind: "sql", label: "Replica", props: { role: "replica" } },
      { type: "connect", from: "db", to: "db-r1", kind: "replication", traffic: "write" },
    ]);
    expect(g.nodes.find((n) => n.id === "db-r1")!.props).toEqual({ replicas: 1, role: "replica" });
  });
});

describe("applyBatch: errors (docs/08)", () => {
  it("is atomic: one bad op means nothing is applied", () => {
    const g = base();
    const result = applyBatch(g, [
      { type: "replicate", id: "api", replicas: 5 },
      { type: "removeNode", id: "ghost" },
    ]);
    expect(result.ok).toBe(false);
    expect(g.nodes.find((n) => n.id === "api")!.props.replicas).toBe(1);
  });

  it("returns every error, not just the first", () => {
    const result = applyBatch(base(), [
      { type: "removeNode", id: "ghost" },
      { type: "fail", id: "phantom" },
    ]);
    expect(result.ok ? [] : result.errors.map((e) => e.opIndex)).toEqual([0, 1]);
  });

  it("explains unknown nodes with the list of existing ones (repair-prompt friendly)", () => {
    const result = applyBatch(base(), [{ type: "connect", from: "api", to: "postgres" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ code: "UNKNOWN_NODE", nodeId: "postgres" });
      expect(result.errors[0]!.message).toContain('"db"');
    }
  });

  it.each<[string, unknown[], OpErrorCode]>([
    ["EMPTY_BATCH", [], "EMPTY_BATCH"],
    ["UNKNOWN_NODE", [{ type: "removeNode", id: "ghost" }], "UNKNOWN_NODE"],
    ["DUPLICATE_ID", [{ type: "addNode", id: "api", kind: "service", label: "API" }], "DUPLICATE_ID"],
    ["DUPLICATE_EDGE", [{ type: "connect", from: "api", to: "db" }], "DUPLICATE_EDGE"],
    ["UNKNOWN_EDGE", [{ type: "disconnect", from: "db", to: "api" }], "UNKNOWN_EDGE"],
    ["BAD_KIND (unknown kind)", [{ type: "addNode", kind: "mainframe", label: "X" }], "BAD_KIND"],
    ["BAD_KIND (prop not allowed)", [{ type: "updateNode", id: "api", props: { hitRate: 0.5 } }], "BAD_KIND"],
    ["BAD_EDGE (self loop)", [{ type: "connect", from: "api", to: "api" }], "BAD_EDGE"],
    [
      "BAD_EDGE (replication from a service)",
      [{ type: "connect", from: "client", to: "db", kind: "replication" }],
      "BAD_EDGE",
    ],
    ["OUT_OF_BOUNDS (replicas)", [{ type: "replicate", id: "api", replicas: 5000 }], "OUT_OF_BOUNDS"],
    ["OUT_OF_BOUNDS (hit rate)", [{ type: "addNode", kind: "cache", label: "C", props: { hitRate: 2 } }], "OUT_OF_BOUNDS"],
    ["OUT_OF_BOUNDS (rps)", [{ type: "setWorkload", rps: 1e9 }], "OUT_OF_BOUNDS"],
    ["CYCLE", [{ type: "connect", from: "db", to: "client" }], "CYCLE"],
    ["INVALID_OP (unknown type)", [{ type: "teleport", id: "api" }], "INVALID_OP"],
    ["INVALID_OP (bad id)", [{ type: "fail", id: "Not A Slug" }], "INVALID_OP"],
  ])("%s", (_name, ops, code) => {
    expect(errorCodes(base(), ops)).toContain(code);
  });

  it("TOO_MANY_OPS above the batch limit", () => {
    const ops: Op[] = Array.from({ length: MAX_OPS_PER_BATCH + 1 }, (_, i) => ({
      type: "addNode",
      kind: "service",
      label: `S${i}`,
    }));
    expect(errorCodes(emptyGraph(), ops)).toEqual(["TOO_MANY_OPS"]);
  });

  it("OUT_OF_BOUNDS when the board would exceed 200 nodes", () => {
    let g = emptyGraph();
    for (let batch = 0; batch < 8; batch++) {
      g = apply(
        g,
        Array.from({ length: 25 }, (_, i) => ({ type: "addNode", kind: "service", label: `s${batch}-${i}` })),
      );
    }
    expect(g.nodes).toHaveLength(200);
    expect(errorCodes(g, [{ type: "addNode", kind: "service", label: "one more" }])).toEqual([
      "OUT_OF_BOUNDS",
    ]);
  });

  it("validateBatch returns the same errors without applying", () => {
    expect(validateBatch(base(), [{ type: "fail", id: "api" }])).toEqual([]);
    expect(validateBatch(base(), [{ type: "fail", id: "nope" }])[0]!.code).toBe("UNKNOWN_NODE");
  });
});

describe("templates", () => {
  it.each(["three-tier", "url-shortener", "chat"] as const)("%s builds into a valid graph", (id) => {
    const g = buildTemplate(id);
    expect(g.version).toBe(0);
    expect(g.nodes.length).toBeGreaterThan(3);
  });
});

describe("uniqueLabel", () => {
  it("numbers a label already on the board, ignoring case", async () => {
    const { uniqueLabel } = await import("./ids");
    expect(uniqueLabel("Cache", ["API"])).toBe("Cache");
    expect(uniqueLabel("Redis", ["redis", "Redis 2"])).toBe("Redis 3");
  });
});
