/** SimResult (docs/09 §Output). Must match specs/simulation-schema.json. */

export type SimStatus = "healthy" | "warm" | "hot" | "saturated" | "down" | "idle";
export type RequestClass = "read" | "write";

export interface Percentiles {
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface NodeMetrics {
  lambdaRead: number;
  lambdaWrite: number;
  rho: number;
  /** Mean sojourn time in ms; null when saturated. */
  meanMs: number | null;
  errorRate: number;
  backlogGrowth?: number;
  status: SimStatus;
  promotedFrom?: string;
  explanation: string;
}

export interface EdgeMetrics {
  rps: number;
  errorRps: number;
}

export interface SimResult {
  nodes: Record<string, NodeMetrics>;
  edges: Record<string, EdgeMetrics>;
  e2e: { read: Percentiles; write: Percentiles; successRate: number; throughput: number };
  bottleneck: { id: string; rho: number; explanation: string } | null;
  costMonthly: number;
  warnings: string[];
  seed: number;
}
