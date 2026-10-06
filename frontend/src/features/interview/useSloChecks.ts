"use client";

import { useDeferredValue, useMemo } from "react";
import { sloChecks, type Graph, type Problem, type SloCheck } from "@archie/simulator";

/**
 * Live SLO checks (FR-051): recomputed locally on every change, no network. Deferred like the SPOF
 * scan, so the edit paints first. Design-mode boards (no problem) get no checks. `pending` is true while the result belongs to an older graph.
 */
export function useSloChecks(
  graph: Graph,
  problem: Problem | null,
): { checks: SloCheck[]; pending: boolean } {
  const deferred = useDeferredValue(graph);
  const checks = useMemo(() => (problem ? sloChecks(deferred, problem) : []), [deferred, problem]);
  return { checks, pending: deferred !== graph };
}

export const passing = (checks: readonly SloCheck[]) =>
  checks.filter((c) => c.pass !== false).length;
