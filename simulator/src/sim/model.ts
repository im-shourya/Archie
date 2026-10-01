import type { ArchEdge, ArchNode, Graph } from "../graph";
import type { RequestClass } from "./types";

/**
 * Static view of a graph for one simulation run: adjacency, topological order and SQL
 * clusters (primary + read replicas, with failover applied). docs/09 step 1, docs/11.
 */

export const ROUTING_KINDS = new Set(["client", "lb", "gateway"]);
export const DATASTORE_KINDS = new Set(["sql", "nosql"]);

export interface Cluster {
  primary: string;
  replicas: string[];
  /** Node that takes writes: the primary, a promoted replica, or nobody. */
  writer: string | null;
  /** Nodes that serve reads, evenly. */
  pool: string[];
  promoted: string | null;
}

export interface Model {
  graph: Graph;
  byId: Map<string, ArchNode>;
  out: Map<string, ArchEdge[]>;
  incoming: Map<string, ArchEdge[]>;
  order: string[];
  rank: Map<string, number>;
  clusters: Map<string, Cluster>;
  /** Replica id → primary id, for any replica in a cluster. */
  clusterOf: Map<string, string>;
  warnings: string[];
  /** Per-run memo for plan.ts (plans and routes are fixed for one graph). */
  memo: Map<string, unknown>;
}

export function isUp(model: Model, id: string): boolean {
  return model.byId.get(id)?.status === "up";
}

/** Outgoing non-replication edges that carry this request class. */
export function eligibleEdges(model: Model, id: string, cls: RequestClass): ArchEdge[] {
  return (model.out.get(id) ?? []).filter(
    (e) => e.kind !== "replication" && (e.traffic === "all" || e.traffic === cls),
  );
}

/** Can a request of this class be served if sent to `target`? (routing only picks these) */
export function canServe(model: Model, target: string, cls: RequestClass): boolean {
  const cluster = model.clusters.get(target);
  if (cluster) return cls === "write" ? cluster.writer !== null : cluster.pool.length > 0;
  return isUp(model, target);
}

function topoSort(graph: Graph, warnings: string[]): string[] {
  const ids = graph.nodes.map((n) => n.id);
  const sort = (edges: readonly ArchEdge[]) => {
    const indegree = new Map(ids.map((id) => [id, 0]));
    for (const e of edges) indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    const queue = ids.filter((id) => indegree.get(id) === 0);
    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const e of edges) {
        if (e.from !== id) continue;
        const d = indegree.get(e.to)! - 1;
        indegree.set(e.to, d);
        if (d === 0) queue.push(e.to);
      }
    }
    return order;
  };
  let order = sort(graph.edges);
  if (order.length < ids.length) {
    // Feedback loops are allowed over async edges: cut those and retry.
    order = sort(graph.edges.filter((e) => e.kind !== "async"));
    if (order.length < ids.length) {
      warnings.push("The graph has a loop of synchronous calls; some traffic may not be simulated.");
      const seen = new Set(order);
      order.push(...ids.filter((id) => !seen.has(id)));
    } else {
      warnings.push("A feedback loop through a queue was ignored for traffic ordering.");
    }
  }
  return order;
}

export function buildModel(graph: Graph): Model {
  const warnings: string[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, ArchEdge[]>(graph.nodes.map((n) => [n.id, []]));
  const incoming = new Map<string, ArchEdge[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) {
    out.get(e.from)?.push(e);
    incoming.get(e.to)?.push(e);
  }
  const order = topoSort(graph, warnings);
  const rank = new Map(order.map((id, i) => [id, i]));

  const clusters = new Map<string, Cluster>();
  const clusterOf = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== "sql" || node.props.role === "replica") continue;
    const replicas = (out.get(node.id) ?? [])
      .filter((e) => e.kind === "replication")
      .map((e) => e.to)
      .sort();
    if (replicas.length === 0) continue;
    const healthy = replicas.filter((r) => byId.get(r)?.status === "up");
    const primaryUp = node.status === "up";
    const promoted = !primaryUp && node.props.failover && healthy.length > 0 ? healthy[0]! : null;
    clusters.set(node.id, {
      primary: node.id,
      replicas,
      writer: primaryUp ? node.id : promoted,
      pool: primaryUp ? [node.id, ...healthy] : healthy,
      promoted,
    });
    for (const r of replicas) clusterOf.set(r, node.id);
  }

  if (!graph.nodes.some((n) => n.kind === "client")) {
    warnings.push("Add a client (users) so traffic has somewhere to start.");
  }
  return { graph, byId, out, incoming, order, rank, clusters, clusterOf, warnings, memo: new Map() };
}
