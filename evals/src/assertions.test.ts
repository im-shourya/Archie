import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, type Graph, type Op } from "@archie/simulator";
import { check, grounded, type Assertion, type Outcome } from "./assertions";

const before = buildTemplate("three-tier");

function after(ops: Op[], graph: Graph = before): Graph {
  const r = applyBatch(graph, ops);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join("; "));
  return r.graph;
}

const outcome = (g: Graph = before, extra: Partial<Outcome> = {}): Outcome => ({
  before,
  after: g,
  kind: "ops",
  message: "",
  options: [],
  focusNodeIds: [],
  ...extra,
});

const withCdn = after([
  { type: "insertBetween", from: "client", to: "lb", node: { id: "cdn", kind: "cdn", label: "CDN" } },
  { type: "replicate", id: "api", replicas: 5 },
  { type: "fail", id: "redis" },
  { type: "setWorkload", rps: 1000, readRatio: 0.5 },
]);

/** [assertion, outcome where it passes, outcome where it fails] */
const CASES: [string, Assertion, Outcome, Outcome][] = [
  ["nodeExists by kind", { nodeExists: { kind: "cdn" } }, outcome(withCdn), outcome()],
  ["nodeExists with props", { nodeExists: { kind: "service", props: { replicas: 5 } } }, outcome(withCdn), outcome()],
  [
    "nodeExists by label",
    { nodeExists: { id: "api", labelIncludes: "checkout" } },
    outcome(after([{ type: "updateNode", id: "api", label: "Checkout service" }])),
    outcome(),
  ],
  ["node props", { node: "api", props: { replicas: 5 } }, outcome(withCdn), outcome()],
  ["node props (float)", { node: "redis", props: { hitRate: 0.9 } }, outcome(), outcome(after([{ type: "updateNode", id: "redis", props: { hitRate: 0.95 } }]))],
  ["edgeExists by kinds", { edgeExists: { fromKind: "client", toKind: "cdn" } }, outcome(withCdn), outcome()],
  ["edgeExists with traffic", { edgeExists: { from: "api", to: "redis", traffic: "read" } }, outcome(), outcome(after([{ type: "disconnect", from: "api", to: "redis" }]))],
  ["edgeAbsent", { edgeAbsent: { from: "client", to: "lb" } }, outcome(withCdn), outcome()],
  ["reachable through an inserted hop", { reachable: { from: "client", to: "lb" } }, outcome(withCdn), outcome(after([{ type: "disconnect", from: "client", to: "lb" }]))],
  ["nodeCount eq", { nodeCount: { kind: "sql", eq: 3 } }, outcome(), outcome(after([{ type: "removeNode", id: "pg-r2" }]))],
  ["nodeCount by role", { nodeCount: { kind: "sql", role: "replica", eq: 2 } }, outcome(), outcome(after([{ type: "removeNode", id: "pg-r1" }]))],
  ["nodeCount gte", { nodeCount: { kind: "cdn", gte: 1 } }, outcome(withCdn), outcome()],
  ["workload", { workload: { rps: 1000, readRatio: 0.5 } }, outcome(withCdn), outcome()],
  ["status", { status: { node: "redis", eq: "down" } }, outcome(withCdn), outcome()],
  ["unchanged", { unchanged: true }, outcome(), outcome(withCdn)],
  ["answerMentions (case-insensitive)", { answerMentions: ["postgres", "1.4"] }, outcome(before, { message: "Postgres is at ρ=1.40" }), outcome(before, { message: "Redis is fine" })],
  ["focusIncludes", { focusIncludes: ["pg"] }, outcome(before, { focusNodeIds: ["pg", "api"] }), outcome(before, { focusNodeIds: ["api"] })],
  ["optionsMention", { optionsMention: ["orders", "users"] }, outcome(before, { options: ["Orders DB", "Users DB"] }), outcome(before, { options: ["Orders DB"] })],
  [
    "loadDrops (cache-aside takes DB reads)",
    { loadDrops: { node: "pg", class: "read" } },
    outcome(after([{ type: "updateNode", id: "redis", props: { hitRate: 0.99 } }])),
    outcome(after([{ type: "disconnect", from: "api", to: "redis" }])),
  ],
];

describe("assertions", () => {
  it.each(CASES)("%s: passes", (_name, assertion, pass) => {
    expect(check(assertion, pass)).toBeNull();
  });

  it.each(CASES)("%s: fails with a reason", (_name, assertion, _pass, fail) => {
    expect(check(assertion, fail)).toMatch(/: .+/);
  });

  it("fails node checks on a missing node", () => {
    expect(check({ node: "ghost", props: { replicas: 1 } }, outcome())).toMatch(/missing/);
    expect(check({ status: { node: "ghost", eq: "up" } }, outcome())).toMatch(/missing/);
  });

  it("reports unknown assertion types instead of passing them", () => {
    expect(check({ bogus: 1 } as unknown as Assertion, outcome())).toMatch(/^unknown assertion/);
  });
});

describe("grounded", () => {
  const context = "<sim>success 96.3% · bottleneck pg ρ=1.40 · read p99 1,207 ms</sim>";

  it("accepts numbers from the context, with or without separators and trailing zeros", () => {
    expect(grounded("pg is at ρ=1.4 and read p99 is 1207 ms, 96.3% succeed", context)).toBe(true);
    expect(grounded("read p99 is 1,207 ms", context)).toBe(true);
    expect(grounded("no numbers at all", context)).toBe(true);
  });

  it("rejects invented numbers", () => {
    expect(grounded("pg drops 28.6% of requests", context)).toBe(false);
  });
});
