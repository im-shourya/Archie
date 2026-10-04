import { effectiveProps, type ArchEdge } from "../graph";
import { ROUTING_KINDS, type Model } from "./model";
import { fanOutPlan, routingTargets } from "./plan";
import type { Propagation } from "./propagate";
import { samplingMean } from "./queueing";
import type { Percentiles, RequestClass } from "./types";

/**
 * Seeded Monte Carlo for end-to-end latency (docs/09 step 5). Each node adds a sample from
 * Exp(mean W), the M/M/1 sojourn-time distribution. Calls are sequential, so latencies add.
 *
 * The graph is compiled once into integer-indexed arrays so the 10,000-sample loop does no
 * string building, map lookups or allocation (NFR-003). A visit returns its latency in ms,
 * or -1 if the request failed.
 */

export const SAMPLES = 10_000;

const FAILED = -1;
const CLASSES: RequestClass[] = ["read", "write"];

/** A dependency call: sync → visit one of `entry` (uniformly), async → enqueue at entry[0]. */
interface Dep {
  async: boolean;
  entry: Int32Array;
}

interface Step {
  /** 0 = routing / CDN, 1 = queue (request ends at enqueue), 2 = compute fan-out. */
  type: 0 | 1 | 2;
  cdnHit: number;
  hasEligible: boolean;
  route: Dep[];
  cumulative: Float64Array;
  caches: Dep[];
  stores: Dep[];
  others: Dep[];
  hitRate: number;
}

export function monteCarlo(model: Model, prop: Propagation, random: () => number) {
  const { graph } = model;
  const empty: Percentiles = { p50: null, p95: null, p99: null };
  const clientIds = graph.nodes.filter((n) => n.kind === "client" && n.status === "up").map((n) => n.id);
  if (clientIds.length === 0 || graph.workload.rps * graph.workload.peakMultiplier === 0) {
    return { read: empty, write: empty };
  }

  // ---- compile -------------------------------------------------------------------------
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const count = graph.nodes.length;
  const down = new Uint8Array(count);
  const err = new Float64Array(count);
  const mean = new Float64Array(count);
  graph.nodes.forEach((n, i) => {
    const q = prop.queueing.get(n.id)!;
    down[i] = n.status === "down" ? 1 : 0;
    err[i] = q.errorRate;
    mean[i] = samplingMean(n, q);
  });

  /** Nodes a sync request of `cls` can land on when sent to `target` (SQL clusters fan out). */
  const entries = (target: string, cls: RequestClass): Int32Array => {
    const cluster = model.clusters.get(target);
    if (!cluster) return Int32Array.of(index.get(target)!);
    if (cls === "write") return cluster.writer ? Int32Array.of(index.get(cluster.writer)!) : new Int32Array(0);
    return Int32Array.from(cluster.pool.map((id) => index.get(id)!));
  };
  const dep = (edge: ArchEdge, cls: RequestClass): Dep =>
    edge.kind === "async" ? { async: true, entry: Int32Array.of(index.get(edge.to)!) } : { async: false, entry: entries(edge.to, cls) };

  const steps: Step[][] = CLASSES.map((cls) =>
    graph.nodes.map((node): Step => {
      const base: Step = {
        type: 2,
        cdnHit: 0,
        hasEligible: false,
        route: [],
        cumulative: new Float64Array(0),
        caches: [],
        stores: [],
        others: [],
        hitRate: 0,
      };
      if (ROUTING_KINDS.has(node.kind) || node.kind === "cdn") {
        const { eligible, targets } = routingTargets(model, node.id, cls);
        let acc = 0;
        return {
          ...base,
          type: 0,
          cdnHit: node.kind === "cdn" && cls === "read" ? effectiveProps(node).hitRate : 0,
          hasEligible: eligible.length > 0,
          route: targets.map((t) => dep(t.edge, cls)),
          cumulative: Float64Array.from(targets.map((t) => (acc += t.share))),
        };
      }
      if (node.kind === "queue") return { ...base, type: 1 };
      const plan = fanOutPlan(model, node.id, cls);
      return {
        ...base,
        caches: plan.caches.map((e) => dep(e, cls)),
        stores: plan.stores.map((e) => dep(e, cls)),
        others: plan.others.map((e) => dep(e, cls)),
        hitRate: plan.hitRate,
      };
    }),
  );
  const clients = Int32Array.from(clientIds.map((id) => index.get(id)!));

  // ---- sample --------------------------------------------------------------------------
  const exp = (m: number) => (m <= 0 ? 0 : -m * Math.log(1 - random()));

  function call(d: Dep, c: number): number {
    const n = d.entry.length;
    if (n === 0) return FAILED;
    const target = n === 1 ? d.entry[0]! : d.entry[Math.floor(random() * n)]!;
    if (!d.async) return visit(target, c);
    // Async: only the enqueue is on the request path.
    if (down[target] === 1 || (err[target]! > 0 && random() < err[target]!)) return FAILED;
    return exp(mean[target]!);
  }

  function callAll(deps: Dep[], c: number): number {
    let total = 0;
    for (let k = 0; k < deps.length; k++) {
      const ms = call(deps[k]!, c);
      if (ms === FAILED) return FAILED;
      total += ms;
    }
    return total;
  }

  function visit(i: number, c: number): number {
    if (down[i] === 1 || (err[i]! > 0 && random() < err[i]!)) return FAILED;
    let ms = exp(mean[i]!);
    const step = steps[c]![i]!;

    if (step.type === 0) {
      if (step.cdnHit > 0 && random() < step.cdnHit) return ms;
      if (!step.hasEligible) return ms;
      const n = step.route.length;
      if (n === 0) return FAILED;
      const pick = random();
      let chosen = n - 1;
      for (let k = 0; k < n; k++) {
        if (pick < step.cumulative[k]!) {
          chosen = k;
          break;
        }
      }
      const next = call(step.route[chosen]!, c);
      return next === FAILED ? FAILED : ms + next;
    }
    if (step.type === 1) return ms;

    const caches = callAll(step.caches, c);
    if (caches === FAILED) return FAILED;
    ms += caches;
    if (step.stores.length > 0 && !(step.caches.length > 0 && random() < step.hitRate)) {
      const stores = callAll(step.stores, c);
      if (stores === FAILED) return FAILED;
      ms += stores;
    }
    const others = callAll(step.others, c);
    return others === FAILED ? FAILED : ms + others;
  }

  const readSamples: number[] = [];
  const writeSamples: number[] = [];
  const { readRatio } = graph.workload;
  for (let s = 0; s < SAMPLES; s++) {
    const isRead = random() < readRatio;
    const client = clients.length === 1 ? clients[0]! : clients[Math.floor(random() * clients.length)]!;
    const ms = visit(client, isRead ? 0 : 1);
    if (ms !== FAILED) (isRead ? readSamples : writeSamples).push(ms);
  }
  return { read: percentiles(readSamples), write: percentiles(writeSamples) };
}

function percentiles(values: number[]): Percentiles {
  if (values.length === 0) return { p50: null, p95: null, p99: null };
  const sorted = Float64Array.from(values).sort();
  const pick = (p: number) => {
    const v = sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
    return Math.round(v * 10) / 10;
  };
  return { p50: pick(0.5), p95: pick(0.95), p99: pick(0.99) };
}
