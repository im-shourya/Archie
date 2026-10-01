import { z } from "zod";

/** Domain model (docs/07). Must stay in sync with specs/graph-schema.json (tests/contracts). */

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

export const NodeKindSchema = z.enum(NODE_KINDS);
export const NodeIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, "must be a lowercase slug");
export const NodeStatusSchema = z.enum(["up", "down"]);
export const EdgeKindSchema = z.enum(["call", "async", "replication"]);
export const TrafficSchema = z.enum(["all", "read", "write"]);
export const SqlRoleSchema = z.enum(["primary", "replica"]);

export const NodePropsSchema = z.strictObject({
  replicas: z.number().int().min(1).max(1000),
  shards: z.number().int().min(1).max(256).optional(),
  capacityRps: z.number().positive().max(MAX_RPS).optional(),
  readCapacity: z.number().positive().max(MAX_RPS).optional(),
  writeCapacity: z.number().positive().max(MAX_RPS).optional(),
  latencyMs: z.number().min(0).max(60_000).optional(),
  hitRate: z.number().min(0).max(1).optional(),
  role: SqlRoleSchema.optional(),
  failover: z.boolean().optional(),
  costPerReplica: z.number().min(0).max(1_000_000).optional(),
});

export const PinnedSchema = z.strictObject({ x: z.number(), y: z.number() });

export const ArchNodeSchema = z.strictObject({
  id: NodeIdSchema,
  kind: NodeKindSchema,
  label: z.string().min(1).max(60),
  props: NodePropsSchema,
  status: NodeStatusSchema,
  pinned: PinnedSchema.optional(),
});

export const ArchEdgeSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}->[a-z][a-z0-9-]{0,39}$/),
  from: NodeIdSchema,
  to: NodeIdSchema,
  kind: EdgeKindSchema,
  traffic: TrafficSchema,
  weight: z.number().positive().max(1000).optional(),
});

export const WorkloadSchema = z.strictObject({
  rps: z.number().min(0).max(MAX_RPS),
  readRatio: z.number().min(0).max(1),
  peakMultiplier: z.number().min(1).max(100),
});

export const GraphSchema = z.strictObject({
  nodes: z.array(ArchNodeSchema).max(MAX_NODES),
  edges: z.array(ArchEdgeSchema).max(MAX_EDGES),
  workload: WorkloadSchema,
  version: z.number().int().min(0),
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
