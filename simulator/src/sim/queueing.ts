import { effectiveProps, type ArchNode } from "../graph";
import type { SimStatus } from "./types";

/** Per-node queueing (docs/09 step 4): per-replica M/M/1 approximation. */

export interface Load {
  read: number;
  write: number;
}

export interface QueueingResult {
  rho: number;
  /** Mean sojourn time (ms); null when saturated. */
  meanMs: number | null;
  /** Fraction of arrivals dropped: 1 − 1/ρ when saturated. */
  errorRate: number;
  status: SimStatus;
}

/** Saturated nodes are sampled at this multiple of their service time (docs/09). */
export const SATURATED_LATENCY_FACTOR = 50;

/** Round away float noise (0.075 + 0.625 = 0.6999…98) so band edges are stable. */
const clean = (x: number) => Math.round(x * 1e9) / 1e9;

export function utilization(node: ArchNode, load: Load): number {
  return clean(rawUtilization(node, load));
}

function rawUtilization(node: ArchNode, load: Load): number {
  const p = effectiveProps(node);
  if (node.kind === "client") return 0;
  if (node.kind === "sql") {
    return load.read / (p.shards * p.readCapacity) + load.write / (p.shards * p.writeCapacity);
  }
  const capacity = node.kind === "nosql" ? p.shards * p.capacityRps : p.replicas * p.capacityRps;
  return capacity > 0 ? (load.read + load.write) / capacity : 0;
}

export function statusFor(rho: number): SimStatus {
  if (rho >= 1) return "saturated";
  if (rho >= 0.9) return "hot";
  if (rho >= 0.7) return "warm";
  return "healthy";
}

export function queueing(node: ArchNode, load: Load): QueueingResult {
  const total = load.read + load.write;
  if (node.status === "down") {
    return { rho: 0, meanMs: null, errorRate: total > 0 ? 1 : 0, status: "down" };
  }
  const service = effectiveProps(node).latencyMs;
  if (node.kind === "client") return { rho: 0, meanMs: 0, errorRate: 0, status: "healthy" };
  if (total === 0) return { rho: 0, meanMs: service, errorRate: 0, status: "idle" };
  const rho = utilization(node, load);
  if (rho >= 1) return { rho, meanMs: null, errorRate: 1 - 1 / rho, status: "saturated" };
  return { rho, meanMs: service / (1 - rho), errorRate: 0, status: statusFor(rho) };
}

/** Latency used for sampling: the mean, or a capped value when saturated. */
export function samplingMean(node: ArchNode, result: QueueingResult): number {
  return result.meanMs ?? SATURATED_LATENCY_FACTOR * effectiveProps(node).latencyMs;
}
