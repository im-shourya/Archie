"use client";

import { useMemo, useRef } from "react";
import { simulate, type Graph, type SimResult } from "@archie/simulator";

export interface Simulation {
  sim: SimResult;
  /** Last result from a graph with no failed components: the "before" for blast radius. */
  baseline: SimResult | null;
}

/** Re-runs the simulator on every graph change (~2 ms, docs/27). */
export function useSimulation(graph: Graph): Simulation {
  const sim = useMemo(() => simulate(graph), [graph]);
  const hasFailures = graph.nodes.some((n) => n.status === "down");
  const baselineRef = useRef<{ key: string; sim: SimResult } | null>(null);
  // Only adopt a new baseline from a healthy graph; failures diff against the last one.
  const healthyKey = hasFailures ? null : String(sim.seed);
  if (healthyKey && baselineRef.current?.key !== healthyKey) baselineRef.current = { key: healthyKey, sim };
  return { sim, baseline: hasFailures ? (baselineRef.current?.sim ?? null) : null };
}
