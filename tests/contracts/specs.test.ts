import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, GraphSchema, OpSchema, simulate } from "@archie/simulator";

/** JSON Schemas in specs/ and Zod schemas in code must agree (docs/21 · contracts). */

const load = (path: string) => JSON.parse(readFileSync(new URL(`../../specs/${path}`, import.meta.url), "utf8"));

const graphSchema = load("graph-schema.json");
const commandSchema = load("command-schema.json");
const fixture = load("fixtures/three-tier.graph.json");
const simulationSchema = load("simulation-schema.json");

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(graphSchema);
ajv.addSchema(commandSchema);
const jsonGraph = ajv.getSchema(graphSchema.$id)!;
const jsonOp = ajv.getSchema(`${commandSchema.$id}#/$defs/Op`)!;
const jsonSim = ajv.compile(simulationSchema);

const validGraph = { nodes: [], edges: [], workload: { rps: 0, readRatio: 0.5, peakMultiplier: 1 }, version: 0 };
const node = (overrides: object) => ({
  id: "api", kind: "service", label: "API", props: { replicas: 1 }, status: "up", ...overrides,
});

const graphSamples: [string, unknown][] = [
  ["empty graph", validGraph],
  ["fixture", fixture],
  ["bad id", { ...validGraph, nodes: [node({ id: "Bad Id" })] }],
  ["zero replicas", { ...validGraph, nodes: [node({ props: { replicas: 0 } })] }],
  ["unknown kind", { ...validGraph, nodes: [node({ kind: "mainframe" })] }],
  ["unknown prop", { ...validGraph, nodes: [node({ props: { replicas: 1, magic: true } })] }],
  ["read ratio > 1", { ...validGraph, workload: { rps: 0, readRatio: 2, peakMultiplier: 1 } }],
  ["peak < 1", { ...validGraph, workload: { rps: 0, readRatio: 0.5, peakMultiplier: 0.5 } }],
  ["missing version", { nodes: [], edges: [], workload: validGraph.workload }],
];

const opSamples: [string, unknown][] = [
  ["addNode", { type: "addNode", kind: "cache", label: "Redis", props: { hitRate: 0.9 } }],
  ["updateNode with null reset", { type: "updateNode", id: "api", props: { capacityRps: null } }],
  ["insertBetween", { type: "insertBetween", from: "a", to: "b", node: { kind: "queue", label: "Kafka" } }],
  ["setWorkload", { type: "setWorkload", rps: 1000 }],
  ["unknown type", { type: "teleport", id: "a" }],
  ["extra field", { type: "fail", id: "a", force: true }],
  ["replicas too high", { type: "replicate", id: "a", replicas: 5000 }],
  ["bad edge kind", { type: "connect", from: "a", to: "b", kind: "wormhole" }],
];

describe("specs ↔ Zod contracts", () => {
  it.each(graphSamples)("graph: %s → JSON Schema and Zod agree", (_name, sample) => {
    expect(GraphSchema.safeParse(sample).success).toBe(jsonGraph(sample));
  });

  it.each(opSamples)("op: %s → JSON Schema and Zod agree", (_name, sample) => {
    expect(OpSchema.safeParse(sample).success).toBe(jsonOp(sample));
  });

  it("the three-tier template equals the committed fixture", () => {
    const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    const template = buildTemplate("three-tier");
    expect(sortById(template.nodes)).toEqual(sortById(fixture.nodes));
    expect(sortById(template.edges)).toEqual(sortById(fixture.edges));
    expect(template.workload).toEqual(fixture.workload);
  });
});

describe("SimResult ↔ specs/simulation-schema.json", () => {
  const scenarios: [string, unknown[]][] = [
    ["three-tier at 50k", []],
    ["cache down", [{ type: "fail", id: "redis" }]],
    ["primary failover", [{ type: "fail", id: "pg" }]],
    ["no traffic", [{ type: "setWorkload", rps: 0 }]],
  ];
  it.each(scenarios)("%s validates against the schema", (_name, ops) => {
    const base = buildTemplate("three-tier");
    const graph = ops.length ? (applyBatch(base, ops) as { ok: true; graph: typeof base }).graph : base;
    const result = simulate(graph);
    const valid = jsonSim(result);
    expect(jsonSim.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });
});
