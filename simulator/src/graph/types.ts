import * as z from "zod/mini";
// Only the English messages: z.locales.en() would bundle every locale (~38 KB gzipped).
import en from "zod/v4/locales/en.js";

/**
 * Domain model (docs/07). Must stay in sync with specs/graph-schema.json (tests/contracts).
 * zod/mini, not classic zod: these schemas run in the browser, and mini is ~5 KB gzipped
 * against ~90 KB (NFR-015). The English locale keeps the op engine's messages unchanged.
 */
z.config(en());

export const NODE_KINDS = [
  "client",
  "cdn",
  "lb",
  "gateway",
  "service",
  "worker",
  "cache",
  "sql",
  "nosql",
  "queue",
  "objectstore",
  "search",
  "external",
] as const;

export const MAX_NODES = 200;
export const MAX_EDGES = 600;
export const MAX_RPS = 10_000_000;

/** Numeric bounds per prop: the single source for the schemas below and for UI hints. */
export const PROP_BOUNDS = {
  replicas: { min: 1, max: 1000, int: true },
  shards: { min: 1, max: 256, int: true },
  capacityRps: { min: 0, max: MAX_RPS, int: false, exclusiveMin: true },
  readCapacity: { min: 0, max: MAX_RPS, int: false, exclusiveMin: true },
  writeCapacity: { min: 0, max: MAX_RPS, int: false, exclusiveMin: true },
  latencyMs: { min: 0, max: 60_000, int: false },
  hitRate: { min: 0, max: 1, int: false },
  costPerReplica: { min: 0, max: 1_000_000, int: false },
} as const;
export type NumericProp = keyof typeof PROP_BOUNDS;

/** A number schema for one prop's bounds. */
export function propNumber(prop: NumericProp) {
  const b: { min: number; max: number; int: boolean; exclusiveMin?: boolean } = PROP_BOUNDS[prop];
  return z
    .number()
    .check(
      ...(b.int ? [z.int()] : []),
      b.exclusiveMin ? z.positive() : z.minimum(b.min),
      z.maximum(b.max),
    );
}

export const boundedInt = (min: number, max?: number) =>
  z.number().check(z.int(), z.minimum(min), ...(max !== undefined ? [z.maximum(max)] : []));
export const boundedNumber = (min: number, max: number) =>
  z.number().check(z.minimum(min), z.maximum(max));

export const NodeKindSchema = z.enum(NODE_KINDS);
export const NodeIdSchema = z
  .string()
  .check(z.regex(/^[a-z][a-z0-9-]{0,39}$/, "must be a lowercase slug"));
export const NodeStatusSchema = z.enum(["up", "down"]);
export const EdgeKindSchema = z.enum(["call", "async", "replication"]);
export const TrafficSchema = z.enum(["all", "read", "write"]);
export const SqlRoleSchema = z.enum(["primary", "replica"]);

export const NodePropsSchema = z.strictObject({
  replicas: propNumber("replicas"),
  shards: z.optional(propNumber("shards")),
  capacityRps: z.optional(propNumber("capacityRps")),
  readCapacity: z.optional(propNumber("readCapacity")),
  writeCapacity: z.optional(propNumber("writeCapacity")),
  latencyMs: z.optional(propNumber("latencyMs")),
  hitRate: z.optional(propNumber("hitRate")),
  role: z.optional(SqlRoleSchema),
  failover: z.optional(z.boolean()),
  costPerReplica: z.optional(propNumber("costPerReplica")),
});

export const PinnedSchema = z.strictObject({ x: z.number(), y: z.number() });

export const LabelSchema = z.string().check(z.minLength(1), z.maxLength(60));

export const ArchNodeSchema = z.strictObject({
  id: NodeIdSchema,
  kind: NodeKindSchema,
  label: LabelSchema,
  props: NodePropsSchema,
  status: NodeStatusSchema,
  pinned: z.optional(PinnedSchema),
});

export const ArchEdgeSchema = z.strictObject({
  id: z.string().check(z.regex(/^[a-z][a-z0-9-]{0,39}->[a-z][a-z0-9-]{0,39}$/)),
  from: NodeIdSchema,
  to: NodeIdSchema,
  kind: EdgeKindSchema,
  traffic: TrafficSchema,
  weight: z.optional(z.number().check(z.positive(), z.maximum(1000))),
});

export const WorkloadSchema = z.strictObject({
  rps: boundedNumber(0, MAX_RPS),
  readRatio: boundedNumber(0, 1),
  peakMultiplier: boundedNumber(1, 100),
});

export const GraphSchema = z.strictObject({
  nodes: z.array(ArchNodeSchema).check(z.maxLength(MAX_NODES)),
  edges: z.array(ArchEdgeSchema).check(z.maxLength(MAX_EDGES)),
  workload: WorkloadSchema,
  version: boundedInt(0),
});

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type EdgeKind = z.infer<typeof EdgeKindSchema>;
export type Traffic = z.infer<typeof TrafficSchema>;
export type NodeProps = z.infer<typeof NodePropsSchema>;
export type ArchNode = z.infer<typeof ArchNodeSchema>;
export type ArchEdge = z.infer<typeof ArchEdgeSchema>;
export type Workload = z.infer<typeof WorkloadSchema>;
export type Graph = z.infer<typeof GraphSchema>;

export const DEFAULT_WORKLOAD: Workload = { rps: 1000, readRatio: 0.9, peakMultiplier: 1 };

export function emptyGraph(): Graph {
  return { nodes: [], edges: [], workload: { ...DEFAULT_WORKLOAD }, version: 0 };
}
