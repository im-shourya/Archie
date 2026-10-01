import { effectiveProps, type ArchEdge } from "../graph";
import { isUp, ROUTING_KINDS, type Model } from "./model";
import { fanOutPlan, routingTargets } from "./plan";
import type { Propagation } from "./propagate";
import type { RequestClass } from "./types";

/**
 * Exact request failure probabilities (docs/09 §Aggregates). A request fails if any node it
 * touches drops it (saturation, e) or is down, or a routing step has no healthy target.
 * Async calls only need the enqueue to succeed.
 */
export interface Reliability {
  /** P(fail) for a request of `cls` sent along `edge`. */
  edgeFail(edge: ArchEdge, cls: RequestClass): number;
  /** P(fail) for a request of `cls` arriving at node `id`. */
  nodeFail(id: string, cls: RequestClass): number;
}

export function reliability(model: Model, prop: Propagation): Reliability {
  const memo = new Map<string, number>();
  const err = (id: string) => prop.queueing.get(id)?.errorRate ?? 0;

  function enqueueFail(target: string): number {
    return isUp(model, target) ? err(target) : 1;
  }

  function reachFail(target: string, cls: RequestClass): number {
    const cluster = model.clusters.get(target);
    if (!cluster) return nodeFail(target, cls);
    if (cls === "write") return cluster.writer ? nodeFail(cluster.writer, cls) : 1;
    if (cluster.pool.length === 0) return 1;
    return cluster.pool.reduce((s, m) => s + nodeFail(m, cls), 0) / cluster.pool.length;
  }

  function edgeFail(edge: ArchEdge, cls: RequestClass): number {
    if (edge.kind === "async") return enqueueFail(edge.to);
    if (edge.kind === "replication") return nodeFail(edge.to, cls);
    return reachFail(edge.to, cls);
  }

  function nodeFail(id: string, cls: RequestClass): number {
    const key = `${id}|${cls}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    memo.set(key, 1); // guards against cycles; overwritten below
    const node = model.byId.get(id)!;
    let result: number;
    if (node.status === "down") {
      result = 1;
    } else {
      const stays = 1 - err(id);
      let success: number;
      if (ROUTING_KINDS.has(node.kind) || node.kind === "cdn") {
        const { eligible, targets } = routingTargets(model, id, cls);
        if (eligible.length === 0) success = 1;
        else if (targets.length === 0) success = 0;
        else success = targets.reduce((s, t) => s + t.share * (1 - edgeFail(t.edge, cls)), 0);
        if (node.kind === "cdn" && cls === "read") {
          const h = effectiveProps(node).hitRate;
          success = h + (1 - h) * (eligible.length === 0 ? 1 : success);
        }
      } else if (node.kind === "queue") {
        success = 1;
      } else {
        const plan = fanOutPlan(model, id, cls);
        const all = (edges: ArchEdge[]) => edges.reduce((s, e) => s * (1 - edgeFail(e, cls)), 1);
        const stores = plan.stores.length > 0 ? all(plan.stores) : 1;
        success = all(plan.caches) * (plan.hitRate + (1 - plan.hitRate) * stores) * all(plan.others);
      }
      result = 1 - stays * success;
    }
    memo.set(key, result);
    return result;
  }

  return { edgeFail, nodeFail };
}
