import { GraphSchema, type ArchEdge, type ArchNode, type Graph } from "@archie/simulator";

/**
 * Synthetic benchmark graphs: client → lb → N service stacks, each with a cache-aside Redis,
 * a Postgres primary and a read replica. Extra nodes become external APIs.
 */
export function syntheticGraph(size: number): Graph {
  const nodes: ArchNode[] = [
    { id: "client", kind: "client", label: "Users", props: { replicas: 1 }, status: "up" },
    { id: "lb", kind: "lb", label: "LB", props: { replicas: 4 }, status: "up" },
  ];
  const edges: ArchEdge[] = [{ id: "client->lb", from: "client", to: "lb", kind: "call", traffic: "all" }];
  const edge = (from: string, to: string, extra: Partial<ArchEdge> = {}): ArchEdge => ({
    id: `${from}->${to}`, from, to, kind: "call", traffic: "all", ...extra,
  });
  const stacks = Math.max(1, Math.floor((size - 2) / 4));
  for (let i = 0; i < stacks && nodes.length + 4 <= size; i++) {
    nodes.push(
      { id: `svc-${i}`, kind: "service", label: `Service ${i}`, props: { replicas: 10 }, status: "up" },
      { id: `cache-${i}`, kind: "cache", label: `Cache ${i}`, props: { replicas: 1, hitRate: 0.9 }, status: "up" },
      { id: `db-${i}`, kind: "sql", label: `DB ${i}`, props: { replicas: 1, shards: 1, role: "primary", failover: true }, status: "up" },
      { id: `db-${i}-r`, kind: "sql", label: `DB ${i} replica`, props: { replicas: 1, role: "replica" }, status: "up" },
    );
    edges.push(
      edge("lb", `svc-${i}`),
      edge(`svc-${i}`, `cache-${i}`, { traffic: "read" }),
      edge(`svc-${i}`, `db-${i}`),
      edge(`db-${i}`, `db-${i}-r`, { kind: "replication", traffic: "write" }),
    );
  }
  for (let j = 0; nodes.length < size; j++) {
    const id = `ext-${j}`;
    nodes.push({ id, kind: "external", label: `External ${j}`, props: { replicas: 1 }, status: "up" });
    edges.push(edge(`svc-${j % stacks}`, id));
  }
  return GraphSchema.parse({ nodes, edges, workload: { rps: 20_000, readRatio: 0.9, peakMultiplier: 1 }, version: 0 });
}
