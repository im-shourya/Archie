import { describe, expect, it } from "vitest";
import { buildTemplate, validateBatch } from "@archie/simulator";
import { CommandRequestSchema, CommandResultSchema, toOps, WireResultSchema, type WireOp } from "./schemas";

const NULLS: WireOp = {
  type: "",
  id: null,
  kind: null,
  label: null,
  props: null,
  from: null,
  to: null,
  traffic: null,
  weight: null,
  replicas: null,
  node: null,
  rps: null,
  readRatio: null,
  peakMultiplier: null,
};
const PROPS_NULL = {
  replicas: null,
  shards: null,
  capacityRps: null,
  readCapacity: null,
  writeCapacity: null,
  latencyMs: null,
  hitRate: null,
  role: null,
  failover: null,
  costPerReplica: null,
};
const wire = (op: Partial<WireOp>): WireOp => ({ ...NULLS, ...op });

describe("toOps", () => {
  it("drops nulls and keeps only fields the op type accepts", () => {
    expect(
      toOps([
        wire({ type: "addNode", id: "redis", kind: "cache", label: "Redis", props: { ...PROPS_NULL, hitRate: 0.9 } }),
        wire({ type: "connect", from: "api", to: "redis", traffic: "read", replicas: 4 }),
        wire({ type: "replicate", id: "api", replicas: 5, label: "ignored" }),
        wire({ type: "setWorkload", rps: 1000 }),
      ]),
    ).toEqual([
      { type: "addNode", id: "redis", kind: "cache", label: "Redis", props: { hitRate: 0.9 } },
      { type: "connect", from: "api", to: "redis", traffic: "read" },
      { type: "replicate", id: "api", replicas: 5 },
      { type: "setWorkload", rps: 1000 },
    ]);
  });

  it("omits an all-null props object", () => {
    expect(toOps([wire({ type: "updateNode", id: "api", label: "API", props: PROPS_NULL })])).toEqual([
      { type: "updateNode", id: "api", label: "API" },
    ]);
  });

  it("converts the nested node of insertBetween", () => {
    const [op] = toOps([
      wire({
        type: "insertBetween",
        from: "api",
        to: "pg",
        node: { id: "kafka", kind: "queue", label: "Kafka", props: null },
      }),
    ]);
    expect(op).toEqual({ type: "insertBetween", from: "api", to: "pg", node: { id: "kafka", kind: "queue", label: "Kafka" } });
    expect(validateBatch(buildTemplate("three-tier"), [op])).toEqual([]);
  });

  it("leaves unknown op types for validation to report", () => {
    const ops = toOps([wire({ type: "teleport", id: "api" })]);
    const errors = validateBatch(buildTemplate("three-tier"), ops);
    expect(errors[0]?.code).toBe("INVALID_OP");
  });

  it("produces ops that validate against the graph", () => {
    const ops = toOps([
      wire({ type: "addNode", id: "redis-2", kind: "cache", label: "Redis 2" }),
      wire({ type: "connect", from: "api", to: "redis-2", kind: "call", traffic: "read" }),
    ]);
    expect(validateBatch(buildTemplate("three-tier"), ops)).toEqual([]);
  });
});

describe("schemas", () => {
  it("WireResultSchema accepts a lenient model output", () => {
    const parsed = WireResultSchema.safeParse({
      kind: "clarify",
      ops: [],
      message: "Which database?",
      options: ["orders", "users"],
      focusNodeIds: ["not-a-real-node", "Bad Id"],
    });
    expect(parsed.success).toBe(true);
  });

  it("CommandResultSchema enforces the spec limits", () => {
    const base = { kind: "noop", ops: [], message: "ok", options: [], focusNodeIds: [] };
    expect(CommandResultSchema.safeParse(base).success).toBe(true);
    expect(CommandResultSchema.safeParse({ ...base, message: "x".repeat(601) }).success).toBe(false);
    expect(CommandResultSchema.safeParse({ ...base, options: ["a", "b", "c", "d", "e"] }).success).toBe(false);
    expect(CommandResultSchema.safeParse({ ...base, options: ["x".repeat(41)] }).success).toBe(false);
  });

  it("CommandRequestSchema bounds the utterance and history", () => {
    const graph = buildTemplate("three-tier");
    const ok = { utterance: "add a cache", graph, baseVersion: 0 };
    expect(CommandRequestSchema.safeParse(ok).success).toBe(true);
    expect(CommandRequestSchema.safeParse({ ...ok, utterance: "   " }).success).toBe(false);
    expect(CommandRequestSchema.safeParse({ ...ok, utterance: "x".repeat(4001) }).success).toBe(false);
    expect(CommandRequestSchema.safeParse({ ...ok, history: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false);
    expect(CommandRequestSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });

  it("CommandRequestSchema bounds the conversation", () => {
    const graph = buildTemplate("three-tier");
    const ok = { utterance: "and search?", graph, baseVersion: 0 };
    const turn = { role: "assistant", text: "Redis is at ρ 0.42." };
    expect(CommandRequestSchema.safeParse({ ...ok, conversation: [turn] }).success).toBe(true);
    expect(CommandRequestSchema.safeParse({ ...ok, conversation: Array(11).fill(turn) }).success).toBe(false);
    expect(CommandRequestSchema.safeParse({ ...ok, conversation: [{ ...turn, text: "x".repeat(601) }] }).success).toBe(false);
    expect(CommandRequestSchema.safeParse({ ...ok, conversation: [{ ...turn, role: "system" }] }).success).toBe(false);
  });
});
