"use client";

import { useDeferredValue, useMemo } from "react";
import { spofScan, type Graph, type SpofScan } from "@archie/simulator";

/**
 * SPOF scan (FR-027, docs/34 Step 1) for the open board. The scan skips the latency Monte Carlo,
 * so it costs 0.2 ms at 10 components, 20 ms at 100 and 96 ms at 200 (bench:sim). That is cheap
 * enough for a deferred render instead of a worker: React paints the edit first, then scans.
 * `pending` is true while the result belongs to an older graph.
 */
export function useSpofScan(graph: Graph): SpofScan & { pending: boolean } {
  const deferred = useDeferredValue(graph);
  const scan = useMemo(() => spofScan(deferred), [deferred]);
  return { ...scan, pending: deferred !== graph };
}
