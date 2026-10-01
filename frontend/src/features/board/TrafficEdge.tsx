"use client";

import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import { compact } from "@/lib/format";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import styles from "./board.module.css";

export type TrafficFlowEdge = Edge<
  { rps: number; errorRps: number; kind: "call" | "async" | "replication"; traffic: "all" | "read" | "write" },
  "traffic"
>;

const DURATION_S = 2.4;

/** Particles per edge grow with log10(rps): 1k → 2, 10k → 3, 100k → 4, 1M → 5 (docs/06). */
export function particleCount(rps: number): number {
  if (rps <= 0) return 0;
  return Math.min(5, Math.max(1, Math.round(Math.log10(rps)) - 1));
}

function TrafficEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<TrafficFlowEdge>) {
  const reduced = usePrefersReducedMotion();
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const rps = data?.rps ?? 0;
  const errorShare = rps > 0 ? (data?.errorRps ?? 0) / rps : 0;
  const count = particleCount(rps);
  const failing = errorShare > 0.01 ? Math.max(1, Math.round(count * errorShare)) : 0;
  const width = rps > 0 ? Math.min(4, 1 + Math.log10(rps + 1) / 2) : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={[styles.edge, styles[`edge-${data?.kind ?? "call"}`], rps === 0 && styles.edgeIdle].filter(Boolean).join(" ")}
        style={{ strokeWidth: reduced ? width : Math.max(1, width - 0.5) }}
      />
      {!reduced &&
        Array.from({ length: count }, (_, i) => (
          <circle key={i} r={2.6} className={i < failing ? styles.particleError : styles.particle}>
            <animateMotion dur={`${DURATION_S}s`} begin={`${-(i * DURATION_S) / count}s`} repeatCount="indefinite" path={path} />
          </circle>
        ))}
      {rps > 0 && (
        <EdgeLabelRenderer>
          <div
            className={styles.edgeLabel}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            data-error={errorShare > 0.01 ? "true" : undefined}
          >
            {compact(rps)}
            {/* Replication edges carry the replica's share of reads, not "write" traffic. */}
            {data?.kind !== "replication" && data?.traffic !== "all" ? ` ${data?.traffic}` : ""}
            {errorShare > 0.01 ? ` · ${Math.round(errorShare * 100)}% fail` : ""}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const TrafficEdge = memo(TrafficEdgeImpl);
