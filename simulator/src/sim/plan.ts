import { effectiveProps, type ArchEdge } from "../graph";
import { canServe, DATASTORE_KINDS, eligibleEdges, isUp, type Model } from "./model";
import type { RequestClass } from "./types";

/**
 * What a compute node calls for one request class (docs/10 · fan-out and cache-aside).
 * Shared by propagation, reliability and Monte Carlo so all three agree.
 */
export interface FanOutPlan {
  /** Caches consulted first (reads, cache-aside only). Down caches are skipped. */
  caches: ArchEdge[];
  /** Datastores consulted on a cache miss (reads) or always (writes / no cache). */
  stores: ArchEdge[];
  /** Every other dependency, always called. */
  others: ArchEdge[];
  /** Combined hit rate of the up caches: 1 − Π(1 − hᵢ). */
  hitRate: number;
  cacheAside: boolean;
}

/** Memoized per run: Monte Carlo asks for the same plan thousands of times. */
function memo<T>(model: Model, key: string, compute: () => T): T {
  if (model.memo.has(key)) return model.memo.get(key) as T;
  const value = compute();
  model.memo.set(key, value);
  return value;
}

export function fanOutPlan(model: Model, id: string, cls: RequestClass): FanOutPlan {
  return memo(model, `plan|${id}|${cls}`, () => computePlan(model, id, cls));
}

function computePlan(model: Model, id: string, cls: RequestClass): FanOutPlan {
  const deps = eligibleEdges(model, id, cls);
  const kindOf = (e: ArchEdge) => model.byId.get(e.to)!.kind;
  // Cache-aside applies when the node talks to at least one cache and one datastore.
  const allDeps = [...eligibleEdges(model, id, "read"), ...eligibleEdges(model, id, "write")];
  const cacheAside =
    allDeps.some((e) => kindOf(e) === "cache") && allDeps.some((e) => DATASTORE_KINDS.has(kindOf(e)));

  if (!cacheAside) return { caches: [], stores: [], others: deps, hitRate: 0, cacheAside: false };

  const caches = cls === "read" ? deps.filter((e) => kindOf(e) === "cache" && isUp(model, e.to)) : [];
  const stores = deps.filter((e) => DATASTORE_KINDS.has(kindOf(e)));
  // In cache-aside, caches only ever see reads; down caches are simply not called.
  const others = deps.filter((e) => kindOf(e) !== "cache" && !DATASTORE_KINDS.has(kindOf(e)));
  const miss = caches.reduce((m, e) => m * (1 - effectiveProps(model.byId.get(e.to)!).hitRate), 1);
  return { caches, stores, others, hitRate: caches.length > 0 ? 1 - miss : 0, cacheAside: true };
}

export interface RoutingTargets {
  eligible: ArchEdge[];
  targets: { edge: ArchEdge; share: number }[];
}

/** Routing split: healthy eligible edges with their normalized weights. Memoized per run. */
export function routingTargets(model: Model, id: string, cls: RequestClass): RoutingTargets {
  return memo(model, `route|${id}|${cls}`, () => {
    const eligible = eligibleEdges(model, id, cls);
    const healthy = eligible.filter((e) => canServe(model, e.to, cls));
    const total = healthy.reduce((s, e) => s + (e.weight ?? 1), 0);
    return { eligible, targets: healthy.map((edge) => ({ edge, share: (edge.weight ?? 1) / total })) };
  });
}
