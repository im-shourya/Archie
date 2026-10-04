"use client";

import { memo, useState } from "react";
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react";
import { ShieldWarning, X } from "@phosphor-icons/react/dist/ssr";
import { CATALOG, type ArchNode, type NodeMetrics } from "@archie/simulator";
import { KindIcon } from "@/components/icons/KindIcon";
import { compact } from "@/lib/format";
import { useBoardStore } from "../store/board.store";
import styles from "./board.module.css";

export type ArchFlowNode = Node<
  { node: ArchNode; pulseKey: number | null; metrics: NodeMetrics | null; bottleneck: boolean; vertical: boolean; callout: boolean; spof: boolean; editable: boolean },
  "arch"
>;

const STATUS_LABEL: Record<NodeMetrics["status"], string> = {
  healthy: "healthy",
  warm: "warm",
  hot: "hot",
  saturated: "saturated",
  down: "down",
  idle: "idle",
};

function subtitle(node: ArchNode): string {
  const parts = [CATALOG[node.kind].displayName];
  if (node.kind === "sql" && node.props.role) parts.push(node.props.role);
  if ((node.props.shards ?? 1) > 1) parts.push(`${node.props.shards} shards`);
  if (node.props.hitRate !== undefined) parts.push(`hit ${Math.round(node.props.hitRate * 100)}%`);
  return parts.join(" · ");
}

function load(node: ArchNode, m: NodeMetrics | null): string {
  if (!m) return "";
  const rps = m.lambdaRead + m.lambdaWrite;
  if (node.kind === "client") return `${compact(rps)} rps out`;
  if (m.status === "down") return "down";
  if (m.status === "idle") return "idle";
  return `ρ ${m.rho.toFixed(2)}`;
}

function ArchNodeCardImpl({ data, selected }: NodeProps<ArchFlowNode>) {
  const { node, pulseKey, metrics, bottleneck, vertical, callout, spof, editable } = data;
  const [calloutOpen, setCalloutOpen] = useState(true);
  const focused = useBoardStore((s) => s.focus.includes(node.id));
  const status = node.status === "down" ? "down" : (metrics?.status ?? "idle");
  const showBar = metrics && node.kind !== "client" && status !== "down" && status !== "idle";
  return (
    <>
      <NodeToolbar isVisible={bottleneck && callout && calloutOpen && !!metrics} position={Position.Top} offset={12}>
        <div className={styles.callout} role="note" aria-label={`Bottleneck: ${node.label}`}>
          <div className={styles.calloutHead}>
            <strong>Bottleneck</strong>
            <button type="button" className={styles.calloutClose} onClick={() => setCalloutOpen(false)} aria-label="Hide bottleneck note">
              <X size={14} aria-hidden />
            </button>
          </div>
          <p>{metrics?.explanation}</p>
        </div>
      </NodeToolbar>
      <div
        key={pulseKey ?? "static"}
        className={[styles.node, selected && styles.selected, pulseKey !== null && styles.pulse].filter(Boolean).join(" ")}
        data-testid={`node-${node.id}`}
        data-status={node.status}
        data-sim={status}
        data-focus={focused || undefined}
        aria-label={`${node.label}, ${subtitle(node)}, ${STATUS_LABEL[status]}${metrics && showBar ? `, utilization ${metrics.rho.toFixed(2)}` : ""}${spof ? ", single point of failure" : ""}`}
      >
        <Handle type="target" position={vertical ? Position.Top : Position.Left} className={editable ? styles.handleEditable : styles.handle} isConnectable={editable} />
        {spof && (
          <span className={styles.spof} data-testid={`spof-${node.id}`} title="Single point of failure: losing one instance loses 5% or more of successful requests">
            <ShieldWarning size={11} aria-hidden />
            SPOF
          </span>
        )}
        <span className={styles.glyph}>
          <KindIcon kind={node.kind} />
        </span>
        <span className={styles.text}>
          <span className={styles.label} data-role="label">
            {node.label}
          </span>
          <span className={styles.subtitle}>{subtitle(node)}</span>
          <span className={styles.load} data-testid={`load-${node.id}`}>
            {load(node, metrics)}
          </span>
        </span>
        {node.props.replicas > 1 && <span className={styles.badge}>×{node.props.replicas}</span>}
        {node.status === "down" && (
          <span className={styles.downMark} aria-hidden>
            <X size={14} />
          </span>
        )}
        {showBar && (
          <span className={styles.rhoTrack} aria-hidden>
            <span className={styles.rhoFill} style={{ width: `${Math.min(1, metrics.rho) * 100}%` }} />
          </span>
        )}
        <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className={editable ? styles.handleEditable : styles.handle} isConnectable={editable} />
      </div>
    </>
  );
}

export const ArchNodeCard = memo(ArchNodeCardImpl);
