/** Latency statistics in the shape of specs/evaluation-schema.json → LatencyStats. */
export interface LatencyStats {
  n: number;
  p50: number;
  p70: number;
  p95: number;
  p99: number;
  p100: number;
  mean: number;
}

/** Nearest-rank percentiles. No outlier trimming: P100 is the true max (docs/24). */
export function stats(samples: readonly number[]): LatencyStats {
  if (samples.length === 0) throw new Error("no samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    n: sorted.length,
    p50: round(pick(50)),
    p70: round(pick(70)),
    p95: round(pick(95)),
    p99: round(pick(99)),
    p100: round(sorted[sorted.length - 1]!),
    mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  };
}
