import type { ArchNode, NodeKind, NodeProps } from "./types";

/**
 * Component catalog (docs/07). Capacities are teaching estimates, overridable per node.
 * Capacity, latency and cost are resolved at read time (effectiveProps) so a node only
 * stores what the user actually set.
 */
export interface CatalogEntry {
  kind: NodeKind;
  displayName: string;
  /** Per-replica capacity in rps (generic kinds). */
  capacityRps?: number;
  /** Per-shard capacities (sql). */
  readCapacity?: number;
  writeCapacity?: number;
  latencyMs: number;
  costPerReplica: number;
  /** Props stored on the node when it's created. */
  initialProps: Partial<NodeProps>;
  /** Props this kind accepts (GI-04). */
  allowedProps: readonly (keyof NodeProps)[];
  /** Words that refer to this kind in commands (used by the resolver in Phase 2). */
  aliases: readonly string[];
}

const COMMON = ["replicas", "capacityRps", "latencyMs", "costPerReplica"] as const;

export const CATALOG: Record<NodeKind, CatalogEntry> = {
  client: {
    kind: "client",
    displayName: "Client",
    latencyMs: 0,
    costPerReplica: 0,
    initialProps: {},
    allowedProps: ["replicas"],
    aliases: ["client", "clients", "users", "user", "browser", "app", "mobile"],
  },
  cdn: {
    kind: "cdn",
    displayName: "CDN",
    capacityRps: 100_000,
    latencyMs: 5,
    costPerReplica: 50,
    initialProps: { hitRate: 0.8 },
    allowedProps: [...COMMON, "hitRate"],
    aliases: ["cdn", "cloudfront", "edge"],
  },
  lb: {
    kind: "lb",
    displayName: "Load balancer",
    capacityRps: 50_000,
    latencyMs: 1,
    costPerReplica: 20,
    initialProps: {},
    allowedProps: COMMON,
    aliases: ["lb", "load balancer", "balancer", "nginx", "elb", "alb"],
  },
  gateway: {
    kind: "gateway",
    displayName: "API gateway",
    capacityRps: 20_000,
    latencyMs: 3,
    costPerReplica: 30,
    initialProps: {},
    allowedProps: COMMON,
    aliases: ["gateway", "api gateway"],
  },
  service: {
    kind: "service",
    displayName: "Service",
    capacityRps: 2_000,
    latencyMs: 20,
    costPerReplica: 70,
    initialProps: {},
    allowedProps: COMMON,
    aliases: ["service", "api", "server", "servers", "backend", "app server"],
  },
  worker: {
    kind: "worker",
    displayName: "Worker",
    capacityRps: 500,
    latencyMs: 50,
    costPerReplica: 70,
    initialProps: {},
    allowedProps: COMMON,
    aliases: ["worker", "workers", "consumer", "consumers"],
  },
  cache: {
    kind: "cache",
    displayName: "Cache",
    capacityRps: 100_000,
    latencyMs: 1,
    costPerReplica: 120,
    initialProps: { hitRate: 0.9 },
    allowedProps: [...COMMON, "hitRate"],
    aliases: ["cache", "redis", "memcached"],
  },
  sql: {
    kind: "sql",
    displayName: "SQL database",
    readCapacity: 10_000,
    writeCapacity: 4_000,
    latencyMs: 5,
    costPerReplica: 400,
    initialProps: { shards: 1, role: "primary", failover: false },
    allowedProps: [
      "replicas",
      "shards",
      "readCapacity",
      "writeCapacity",
      "latencyMs",
      "role",
      "failover",
      "costPerReplica",
    ],
    aliases: ["sql", "database", "db", "postgres", "postgresql", "mysql", "rds"],
  },
  nosql: {
    kind: "nosql",
    displayName: "NoSQL database",
    capacityRps: 20_000,
    latencyMs: 4,
    costPerReplica: 300,
    initialProps: { shards: 1 },
    allowedProps: [...COMMON, "shards"],
    aliases: ["nosql", "mongo", "mongodb", "dynamo", "dynamodb", "cassandra"],
  },
  queue: {
    kind: "queue",
    displayName: "Queue",
    capacityRps: 50_000,
    latencyMs: 2,
    costPerReplica: 100,
    initialProps: {},
    allowedProps: COMMON,
    aliases: ["queue", "kafka", "sqs", "rabbitmq", "stream", "topic"],
  },
  objectstore: {
    kind: "objectstore",
    displayName: "Object storage",
    capacityRps: 5_000,
    latencyMs: 30,
    costPerReplica: 25,
    initialProps: {},
    allowedProps: COMMON,
    aliases: ["object store", "object storage", "s3", "blob", "bucket"],
  },
  search: {
    kind: "search",
    displayName: "Search",
    capacityRps: 3_000,
    latencyMs: 15,
    costPerReplica: 250,
    initialProps: {},
    allowedProps: COMMON,
    aliases: ["search", "elasticsearch", "opensearch"],
  },
  external: {
    kind: "external",
    displayName: "External API",
    capacityRps: 1_000,
    latencyMs: 150,
    costPerReplica: 0,
    initialProps: {},
    allowedProps: COMMON,
    aliases: ["external", "third party", "stripe", "payment provider"],
  },
};

/** Props with catalog defaults filled in. Use this, never raw props, for capacity math. */
export function effectiveProps(node: Pick<ArchNode, "kind" | "props">) {
  const entry = CATALOG[node.kind];
  return {
    replicas: node.props.replicas,
    shards: node.props.shards ?? 1,
    capacityRps: node.props.capacityRps ?? entry.capacityRps ?? 0,
    readCapacity: node.props.readCapacity ?? entry.readCapacity ?? 0,
    writeCapacity: node.props.writeCapacity ?? entry.writeCapacity ?? 0,
    latencyMs: node.props.latencyMs ?? entry.latencyMs,
    hitRate: node.props.hitRate ?? entry.initialProps.hitRate ?? 0,
    role: node.props.role,
    failover: node.props.failover ?? false,
    costPerReplica: node.props.costPerReplica ?? entry.costPerReplica,
  };
}

export function disallowedProps(kind: NodeKind, props: object): string[] {
  const allowed = new Set<string>(CATALOG[kind].allowedProps);
  return Object.keys(props).filter((key) => !allowed.has(key));
}
