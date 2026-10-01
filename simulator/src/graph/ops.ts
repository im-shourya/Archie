import { z } from "zod";
import { CATALOG, disallowedProps } from "./catalog";
import { edgeId, slugify, uniqueId } from "./ids";
import {
  EdgeKindSchema,
  MAX_EDGES,
  MAX_NODES,
  MAX_RPS,
  NodeIdSchema,
  NodeKindSchema,
  NodePropsSchema,
  SqlRoleSchema,
  TrafficSchema,
  type ArchEdge,
  type ArchNode,
  type Graph,
  type NodeProps,
} from "./types";

/** The op language (docs/08). Must stay in sync with specs/command-schema.json → $defs/Op. */

export const MAX_OPS_PER_BATCH = 25;

const Label = z.string().min(1).max(60);
const nullable = <T extends z.ZodType>(schema: T) => schema.nullable().optional();

/** Partial props for add/update. `null` resets a prop to its catalog default. */
export const PartialPropsSchema = z.strictObject({
  replicas: z.number().int().min(1).max(1000).optional(),
  shards: z.number().int().min(1).max(256).optional(),
  capacityRps: nullable(z.number().positive().max(MAX_RPS)),
  readCapacity: nullable(z.number().positive().max(MAX_RPS)),
  writeCapacity: nullable(z.number().positive().max(MAX_RPS)),
  latencyMs: nullable(z.number().min(0).max(60_000)),
  hitRate: nullable(z.number().min(0).max(1)),
  role: SqlRoleSchema.optional(),
  failover: z.boolean().optional(),
  costPerReplica: nullable(z.number().min(0).max(1_000_000)),
});

export const AddNodeSpecSchema = z.strictObject({
  id: NodeIdSchema.optional(),
  kind: NodeKindSchema,
  label: Label,
  props: PartialPropsSchema.optional(),
});

export const OpSchema = z.discriminatedUnion("type", [
  AddNodeSpecSchema.extend({ type: z.literal("addNode") }),
  z.strictObject({ type: z.literal("removeNode"), id: NodeIdSchema }),
  z.strictObject({
    type: z.literal("updateNode"),
    id: NodeIdSchema,
    label: Label.optional(),
    props: PartialPropsSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("connect"),
    from: NodeIdSchema,
    to: NodeIdSchema,
    kind: EdgeKindSchema.optional(),
    traffic: TrafficSchema.optional(),
    weight: z.number().positive().max(1000).optional(),
  }),
  z.strictObject({ type: z.literal("disconnect"), from: NodeIdSchema, to: NodeIdSchema }),
  z.strictObject({
    type: z.literal("replicate"),
    id: NodeIdSchema,
    replicas: z.number().int().min(1).max(1000),
  }),
  z.strictObject({
    type: z.literal("insertBetween"),
    from: NodeIdSchema,
    to: NodeIdSchema,
    node: AddNodeSpecSchema,
  }),
  z.strictObject({
    type: z.literal("setWorkload"),
    rps: z.number().min(0).max(MAX_RPS).optional(),
    readRatio: z.number().min(0).max(1).optional(),
    peakMultiplier: z.number().min(1).max(100).optional(),
  }),
  z.strictObject({ type: z.literal("fail"), id: NodeIdSchema }),
  z.strictObject({ type: z.literal("recover"), id: NodeIdSchema }),
]);

export type PartialProps = z.infer<typeof PartialPropsSchema>;
export type AddNodeSpec = z.infer<typeof AddNodeSpecSchema>;
export type Op = z.infer<typeof OpSchema>;
export type OpType = Op["type"];

export type OpErrorCode =
  | "INVALID_OP"
  | "UNKNOWN_NODE"
  | "DUPLICATE_ID"
  | "DUPLICATE_EDGE"
  | "UNKNOWN_EDGE"
  | "BAD_KIND"
  | "BAD_EDGE"
  | "OUT_OF_BOUNDS"
  | "CYCLE"
  | "TOO_MANY_OPS"
  | "EMPTY_BATCH";

export interface OpError {
  opIndex: number;
  code: OpErrorCode;
  message: string;
  nodeId?: string;
}

export type ApplyResult =
  | { ok: true; graph: Graph; changedNodeIds: string[] }
  | { ok: false; errors: OpError[] };

class OpFailure extends Error {
  constructor(
    readonly code: OpErrorCode,
    message: string,
    readonly nodeId?: string,
  ) {
    super(message);
  }
}

/** Working copy that ops mutate. Only ever built from a fresh copy of the input graph. */
interface Draft {
  nodes: ArchNode[];
  edges: ArchEdge[];
  workload: Graph["workload"];
  changed: Set<string>;
}

/**
 * Validate and apply a batch atomically (docs/08). Every op is checked against the state
 * produced by the ops before it, so a batch may reference nodes it creates. If any op fails,
 * all errors are returned and the input graph is untouched. Pure: no I/O, time or randomness.
 */
export function applyBatch(graph: Graph, ops: readonly unknown[]): ApplyResult {
  if (ops.length === 0) {
    return { ok: false, errors: [{ opIndex: -1, code: "EMPTY_BATCH", message: "no ops to apply" }] };
  }
  if (ops.length > MAX_OPS_PER_BATCH) {
    return {
      ok: false,
      errors: [
        {
          opIndex: -1,
          code: "TOO_MANY_OPS",
          message: `${ops.length} ops in one batch; the limit is ${MAX_OPS_PER_BATCH}`,
        },
      ],
    };
  }

  const draft: Draft = {
    nodes: graph.nodes.map((n) => ({ ...n, props: { ...n.props } })),
    edges: graph.edges.map((e) => ({ ...e })),
    workload: { ...graph.workload },
    changed: new Set(),
  };
  const errors: OpError[] = [];

  ops.forEach((raw, opIndex) => {
    const parsed = OpSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ opIndex, ...schemaError(raw, parsed.error) });
      return;
    }
    try {
      applyOp(draft, parsed.data);
    } catch (err) {
      if (!(err instanceof OpFailure)) throw err;
      errors.push({
        opIndex,
        code: err.code,
        message: `op ${opIndex} (${parsed.data.type}): ${err.message}`,
        ...(err.nodeId ? { nodeId: err.nodeId } : {}),
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  const liveIds = new Set(draft.nodes.map((n) => n.id));
  return {
    ok: true,
    graph: {
      nodes: draft.nodes,
      edges: draft.edges,
      workload: draft.workload,
      version: graph.version + 1,
    },
    changedNodeIds: [...draft.changed].filter((id) => liveIds.has(id)),
  };
}

/** Validation only: same rules as applyBatch, without returning the new graph. */
export function validateBatch(graph: Graph, ops: readonly unknown[]): OpError[] {
  const result = applyBatch(graph, ops);
  return result.ok ? [] : result.errors;
}

function schemaError(raw: unknown, error: z.ZodError): Omit<OpError, "opIndex"> {
  const type =
    typeof raw === "object" && raw !== null && "type" in raw ? String(raw.type) : "unknown";
  const issue = error.issues[0];
  const where = issue?.path.length ? issue.path.join(".") : "op";
  const message = `op (${type}): ${where} ${issue?.message ?? "is invalid"}`;
  if (issue?.code === "too_big" || issue?.code === "too_small") {
    return { code: "OUT_OF_BOUNDS", message };
  }
  if (issue?.path[0] === "kind") return { code: "BAD_KIND", message };
  return { code: "INVALID_OP", message };
}

function applyOp(draft: Draft, op: Op): void {
  switch (op.type) {
    case "addNode":
      addNode(draft, op);
      return;
    case "removeNode": {
      requireNode(draft, op.id);
      draft.nodes = draft.nodes.filter((n) => n.id !== op.id);
      draft.edges.forEach((e) => {
        if (e.from === op.id) draft.changed.add(e.to);
        if (e.to === op.id) draft.changed.add(e.from);
      });
      draft.edges = draft.edges.filter((e) => e.from !== op.id && e.to !== op.id);
      return;
    }
    case "updateNode": {
      const node = requireNode(draft, op.id);
      if (op.label !== undefined) node.label = op.label;
      if (op.props) node.props = mergeProps(node, op.props);
      draft.changed.add(node.id);
      return;
    }
    case "replicate": {
      const node = requireNode(draft, op.id);
      node.props = { ...node.props, replicas: op.replicas };
      draft.changed.add(node.id);
      return;
    }
    case "connect":
      connect(draft, op.from, op.to, op.kind ?? "call", op.traffic ?? "all", op.weight);
      return;
    case "disconnect": {
      requireEdge(draft, op.from, op.to);
      draft.edges = draft.edges.filter((e) => e.id !== edgeId(op.from, op.to));
      draft.changed.add(op.from).add(op.to);
      return;
    }
    case "insertBetween": {
      const edge = requireEdge(draft, op.from, op.to);
      draft.edges = draft.edges.filter((e) => e.id !== edge.id);
      const node = addNode(draft, op.node);
      connect(draft, op.from, node.id, edge.kind, edge.traffic, edge.weight);
      connect(draft, node.id, op.to, edge.kind, edge.traffic);
      return;
    }
    case "setWorkload": {
      const { type: _type, ...patch } = op;
      draft.workload = { ...draft.workload, ...patch };
      return;
    }
    case "fail":
    case "recover": {
      const node = requireNode(draft, op.id);
      node.status = op.type === "fail" ? "down" : "up";
      draft.changed.add(node.id);
      return;
    }
  }
}

function addNode(draft: Draft, spec: AddNodeSpec): ArchNode {
  if (draft.nodes.length >= MAX_NODES) {
    throw new OpFailure("OUT_OF_BOUNDS", `a board can hold at most ${MAX_NODES} components`);
  }
  const taken = new Set(draft.nodes.map((n) => n.id));
  if (spec.id && taken.has(spec.id)) {
    throw new OpFailure("DUPLICATE_ID", `node "${spec.id}" already exists`, spec.id);
  }
  const id = spec.id ?? uniqueId(slugify(spec.label), taken);
  const node: ArchNode = {
    id,
    kind: spec.kind,
    label: spec.label,
    props: { replicas: 1 },
    status: "up",
  };
  node.props = mergeProps(node, { ...initialProps(spec), ...spec.props });
  draft.nodes.push(node);
  draft.changed.add(id);
  return node;
}

/** Catalog defaults stored on creation. SQL replicas don't get primary-only defaults. */
function initialProps(spec: AddNodeSpec): Partial<NodeProps> {
  if (spec.kind === "sql" && spec.props?.role === "replica") return { role: "replica" };
  return CATALOG[spec.kind].initialProps;
}

function mergeProps(node: ArchNode, patch: PartialProps): NodeProps {
  const bad = disallowedProps(node.kind, stripUndefined(patch));
  if (bad.length > 0) {
    throw new OpFailure(
      "BAD_KIND",
      `${bad.join(", ")} not allowed on a ${node.kind} node ("${node.id}")`,
      node.id,
    );
  }
  const next: Record<string, unknown> = { ...node.props };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  const parsed = NodePropsSchema.safeParse(next);
  if (!parsed.success) {
    throw new OpFailure("OUT_OF_BOUNDS", `invalid props for "${node.id}"`, node.id);
  }
  return parsed.data;
}

function connect(
  draft: Draft,
  from: string,
  to: string,
  kind: ArchEdge["kind"],
  traffic: ArchEdge["traffic"],
  weight?: number,
): void {
  const source = requireNode(draft, from);
  const target = requireNode(draft, to);
  if (from === to) throw new OpFailure("BAD_EDGE", `"${from}" can't connect to itself`, from);
  const id = edgeId(from, to);
  if (draft.edges.some((e) => e.id === id)) {
    throw new OpFailure("DUPLICATE_EDGE", `"${from}" is already connected to "${to}"`, from);
  }
  if (draft.edges.length >= MAX_EDGES) {
    throw new OpFailure("OUT_OF_BOUNDS", `a board can hold at most ${MAX_EDGES} connections`);
  }
  if (kind === "replication") {
    const ok =
      source.kind === "sql" &&
      target.kind === "sql" &&
      source.props.role !== "replica" &&
      target.props.role === "replica";
    if (!ok) {
      throw new OpFailure(
        "BAD_EDGE",
        `replication must go from a sql primary to a sql replica ("${from}" → "${to}")`,
        from,
      );
    }
  }
  if (kind !== "async" && reaches(draft.edges, to, from)) {
    throw new OpFailure(
      "CYCLE",
      `connecting "${from}" → "${to}" creates a loop; use an async edge for feedback paths`,
      from,
    );
  }
  draft.edges.push({ id, from, to, kind, traffic, ...(weight !== undefined ? { weight } : {}) });
  draft.changed.add(from).add(to);
}

/** Is `target` reachable from `start` over synchronous (call/replication) edges? */
function reaches(edges: readonly ArchEdge[], start: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.from === id && e.kind !== "async") stack.push(e.to);
  }
  return false;
}

function requireNode(draft: Draft, id: string): ArchNode {
  const node = draft.nodes.find((n) => n.id === id);
  if (!node) {
    const known = draft.nodes.map((n) => `"${n.id}"`).join(", ") || "none";
    throw new OpFailure("UNKNOWN_NODE", `node "${id}" not found; existing nodes: ${known}`, id);
  }
  return node;
}

function requireEdge(draft: Draft, from: string, to: string): ArchEdge {
  const edge = draft.edges.find((e) => e.id === edgeId(from, to));
  if (!edge) throw new OpFailure("UNKNOWN_EDGE", `no connection "${from}" → "${to}"`, from);
  return edge;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
