import { effectiveProps, type ArchEdge } from "../graph";
import { isUp, ROUTING_KINDS, type Model } from "./model";
import { fanOutPlan, routingTargets } from "./plan";
import { queueing, type Load, type QueueingResult } from "./queueing";
import type { RequestClass } from "./types";

/**
 * Traffic propagation (docs/10). Visits nodes in topological order, computes each node's
 * arrivals and queueing, then forwards only what it serves: λ_out = λ_in × (1 − e).
 */

export interface Propagation {
  arrivals: Map<string, Load>;
  queueing: Map<string, QueueingResult>;
  edgeLoad: Map<string, Load>;
  backlog: Map<string, number>;
  /** Total workload injected at up clients. */
  injected: Load;
}

const CLASSES: RequestClass[] = ["read", "write"];

export function propagate(model: Model): Propagation {
  const { graph } = model;
  const arrivals = new Map<string, Load>(graph.nodes.map((n) => [n.id, { read: 0, write: 0 }]));
  const edgeLoad = new Map<string, Load>(graph.edges.map((e) => [e.id, { read: 0, write: 0 }]));
  const results = new Map<string, QueueingResult>();
  const backlog = new Map<string, number>();

  const total = graph.workload.rps * graph.workload.peakMultiplier;
  const injected: Load = { read: total * graph.workload.readRatio, write: total * (1 - graph.workload.readRatio) };
  const clients = graph.nodes.filter((n) => n.kind === "client" && n.status === "up");
  for (const c of clients) {
    arrivals.get(c.id)!.read += injected.read / clients.length;
    arrivals.get(c.id)!.write += injected.write / clients.length;
  }
  if (clients.length === 0) {
    injected.read = 0;
    injected.write = 0;
  }

  const addEdge = (id: string, cls: RequestClass, rate: number) => {
    const load = edgeLoad.get(id);
    if (load) load[cls] += rate;
  };

  /** Deliver traffic along an edge. SQL clusters dispatch to their writer / read pool. */
  const send = (edge: ArchEdge, cls: RequestClass, rate: number) => {
    if (rate <= 0) return;
    addEdge(edge.id, cls, rate);
    const cluster = model.clusters.get(edge.to);
    if (!cluster) {
      arrivals.get(edge.to)![cls] += rate;
      return;
    }
    const replicationEdge = (to: string) => `${cluster.primary}->${to}`;
    if (cls === "write") {
      if (!cluster.writer) return; // fails: counted by reliability
      arrivals.get(cluster.writer)!.write += rate;
      if (cluster.writer !== cluster.primary) addEdge(replicationEdge(cluster.writer), "write", rate);
      return;
    }
    if (cluster.pool.length === 0) return;
    const share = rate / cluster.pool.length;
    for (const member of cluster.pool) {
      arrivals.get(member)!.read += share;
      if (member !== cluster.primary) addEdge(replicationEdge(member), "read", share);
    }
  };

  for (const id of model.order) {
    const node = model.byId.get(id)!;
    const load = arrivals.get(id)!;
    const result = queueing(node, load);
    results.set(id, result);
    if (node.status === "down") continue;
    const served: Load = { read: load.read * (1 - result.errorRate), write: load.write * (1 - result.errorRate) };

    if (ROUTING_KINDS.has(node.kind) || node.kind === "cdn") {
      for (const cls of CLASSES) {
        let amount = served[cls];
        if (node.kind === "cdn" && cls === "read") amount *= 1 - effectiveProps(node).hitRate;
        const { targets } = routingTargets(model, id, cls);
        for (const { edge, share } of targets) send(edge, cls, amount * share);
      }
      continue;
    }

    if (node.kind === "queue") {
      const consumers = (model.out.get(id) ?? []).filter((e) => e.kind !== "replication" && isUp(model, e.to));
      const capacityOf = (e: ArchEdge) => {
        const p = effectiveProps(model.byId.get(e.to)!);
        return p.replicas * p.capacityRps;
      };
      const capacity = consumers.reduce((s, e) => s + capacityOf(e), 0);
      const inflow = served.read + served.write;
      const drain = Math.min(inflow, capacity);
      backlog.set(id, Math.max(0, inflow - drain));
      if (inflow > 0 && drain > 0) {
        for (const e of consumers) {
          const portion = (drain * capacityOf(e)) / capacity;
          for (const cls of CLASSES) {
            if (e.traffic === "all" || e.traffic === cls) send(e, cls, portion * (served[cls] / inflow));
          }
        }
      }
      continue;
    }

    // Compute nodes (and datastores with outgoing calls): fan-out.
    for (const cls of CLASSES) {
      if (served[cls] <= 0) continue;
      const plan = fanOutPlan(model, id, cls);
      for (const e of plan.caches) send(e, cls, served[cls]);
      for (const e of plan.stores) send(e, cls, served[cls] * (1 - plan.hitRate));
      for (const e of plan.others) send(e, cls, served[cls]);
    }
  }

  return { arrivals, queueing: results, edgeLoad, backlog, injected };
}
