import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, emptyGraph, type Graph } from "@archie/simulator";
import { parseCommand } from "./parse";
import { resolveRef } from "./resolve";

const threeTier = buildTemplate("three-tier");
const chat = buildTemplate("chat");

/** three-tier + a second database: references to "the database" become ambiguous. */
const twoDbs: Graph = (() => {
  const r = applyBatch(threeTier, [
    { type: "addNode", id: "orders-db", kind: "sql", label: "Orders DB" },
    { type: "connect", from: "api", to: "orders-db" },
  ]);
  if (!r.ok) throw new Error("fixture");
  return r.graph;
})();

function ops(utterance: string, graph: Graph = threeTier, ctx = {}) {
  const result = parseCommand(utterance, graph, ctx);
  if (!result || result.kind !== "ops") throw new Error(`expected ops for "${utterance}", got ${JSON.stringify(result)}`);
  return result.ops;
}

describe("parseCommand: understood commands", () => {
  it.each<[string, unknown[]]>([
    ["kill redis", [{ type: "fail", id: "redis" }]],
    ["Take down the cache.", [{ type: "fail", id: "redis" }]],
    ["take redis down", [{ type: "fail", id: "redis" }]],
    ["kill postgres", [{ type: "fail", id: "pg" }]],
    ["kill the database", [{ type: "fail", id: "pg" }]],
    ["kill postgres replica one", [{ type: "fail", id: "pg-r1" }]],
    ["kill pg-r2", [{ type: "fail", id: "pg-r2" }]],
    ["kill the load balancer", [{ type: "fail", id: "lb" }]],
    ["recover redis", [{ type: "recover", id: "redis" }]],
    ["bring redis back", [{ type: "recover", id: "redis" }]],
    ["delete the cache", [{ type: "removeNode", id: "redis" }]],
    ["Five replicas of the API.", [{ type: "replicate", id: "api", replicas: 5 }]],
    ["scale the api to forty", [{ type: "replicate", id: "api", replicas: 40 }]],
    ["give the api 12 servers", [{ type: "replicate", id: "api", replicas: 12 }]],
    ["thirty api servers", [{ type: "replicate", id: "api", replicas: 30 }]],
    ["shard postgres into two", [{ type: "updateNode", id: "pg", props: { shards: 2 } }]],
    ["set redis hit rate to 95 percent", [{ type: "updateNode", id: "redis", props: { hitRate: 0.95 } }]],
    ["disconnect the api from redis", [{ type: "disconnect", from: "api", to: "redis" }]],
    ["disconnect redis from the api", [{ type: "disconnect", from: "api", to: "redis" }]],
    [
      "Send fifty thousand requests a second, ninety percent reads.",
      [{ type: "setWorkload", rps: 50000, readRatio: 0.9 }],
    ],
    ["send 50k rps", [{ type: "setWorkload", rps: 50000 }]],
    ["set the traffic to one point two million requests per second", [{ type: "setWorkload", rps: 1200000 }]],
    ["ninety five percent reads", [{ type: "setWorkload", readRatio: 0.95 }]],
    ["twenty percent writes", [{ type: "setWorkload", readRatio: 0.8 }]],
    ["peak is three x", [{ type: "setWorkload", peakMultiplier: 3 }]],
  ])("%s", (utterance, expected) => {
    expect(ops(utterance)).toEqual(expected);
  });

  it("connects nodes, with read/write traffic from the verb", () => {
    expect(ops("connect the fan-out workers to presence", chat)).toEqual([
      { type: "connect", from: "fanout", to: "presence" },
    ]);
    expect(ops("fanout reads from presence", chat)).toEqual([
      { type: "connect", from: "fanout", to: "presence", traffic: "read" },
    ]);
  });

  it("resolves pronouns from the selection, then from the last change", () => {
    expect(ops("kill it", threeTier, { selection: ["api"] })).toEqual([{ type: "fail", id: "api" }]);
    expect(ops("bring it back", threeTier, { recent: ["redis"] })).toEqual([{ type: "recover", id: "redis" }]);
  });

  it("returns UI actions", () => {
    expect(parseCommand("undo", threeTier)).toMatchObject({ kind: "action", action: "undo" });
    expect(parseCommand("Undo that.", threeTier)).toMatchObject({ kind: "action", action: "undo" });
    expect(parseCommand("redo", threeTier)).toMatchObject({ kind: "action", action: "redo" });
    expect(parseCommand("fit the view", threeTier)).toMatchObject({ kind: "action", action: "fit" });
    expect(parseCommand("zoom in", threeTier)).toMatchObject({ kind: "action", action: "zoomIn" });
  });

  it("writes a human summary for the toast", () => {
    expect(parseCommand("five replicas of the api", threeTier)).toMatchObject({ summary: "Scaled API to 5 replicas" });
    expect(parseCommand("send 50k rps 90% reads", threeTier)).toMatchObject({ summary: "Workload: 50,000 rps · 90% reads" });
  });
});

describe("parseCommand: returns null instead of guessing (docs/13 §4)", () => {
  it.each<[string, Graph, object?]>([
    // Ambiguous references
    ["kill the database", twoDbs],
    ["connect the api to the database", twoDbs],
    ["kill it", threeTier, {}],
    ["kill it", threeTier, { selection: ["api", "redis"] }],
    ["kill the replica", threeTier],
    // Unknown references
    ["kill mongo", threeTier],
    ["delete the search cluster", threeTier],
    // Compound commands (two things at once go to the AI)
    ["kill redis and postgres", threeTier],
    ["kill redis and then bring it back", threeTier],
    ["five replicas of the api and shard postgres", threeTier],
    // Leftover words / not a pattern
    ["kill redis because it is slow", threeTier],
    ["add a cache in front of postgres", threeTier],
    ["users hit a load balancer in front of three api servers", emptyGraph()],
    ["why is the database slow", threeTier],
    ["what's the weather in goa", threeTier],
    ["", threeTier],
    ["   ", threeTier],
    // Valid shape but invalid ops (bounds / kind rules / duplicates)
    ["five thousand replicas of the api", threeTier],
    ["shard the api into two", threeTier],
    ["set the api hit rate to 50 percent", threeTier],
    ["connect the api to redis", threeTier],
    ["send 50 billion rps", threeTier],
    ["kill redis", emptyGraph()],
  ])("%s", (utterance, graph, ctx = {}) => {
    expect(parseCommand(utterance, graph, ctx)).toBeNull();
  });
});

describe("resolveRef", () => {
  it("treats a SQL primary and its replicas as one cluster unless 'replica' is said", () => {
    expect(resolveRef("postgres", threeTier)).toMatchObject({ kind: "ok", node: { id: "pg" } });
    const replica = resolveRef("postgres replica", threeTier);
    expect(replica.kind).toBe("ambiguous");
  });

  it("reports ambiguity with the candidates", () => {
    const r = resolveRef("the database", twoDbs);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.candidates.map((n) => n.id).sort()).toEqual(["orders-db", "pg"]);
  });
});
