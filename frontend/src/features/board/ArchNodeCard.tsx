"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { CATALOG, type ArchNode, type NodeKind } from "@archie/simulator";
import styles from "./board.module.css";

export type ArchFlowNode = Node<{ node: ArchNode; pulseKey: number | null }, "arch">;

/** Short glyphs until the icon set is chosen in Phase 5 (docs/06). */
const GLYPH: Record<NodeKind, string> = {
  client: "USR",
  cdn: "CDN",
  lb: "LB",
  gateway: "GW",
  service: "SVC",
  worker: "WRK",
  cache: "C$",
  sql: "SQL",
  nosql: "NoSQL",
  queue: "Q",
  objectstore: "OBJ",
  search: "SRCH",
  external: "EXT",
};

function subtitle(node: ArchNode): string {
  const parts = [CATALOG[node.kind].displayName];
  if (node.kind === "sql" && node.props.role) parts.push(node.props.role);
  if ((node.props.shards ?? 1) > 1) parts.push(`${node.props.shards} shards`);
  if (node.props.hitRate !== undefined) parts.push(`hit ${Math.round(node.props.hitRate * 100)}%`);
  return parts.join(" · ");
}

function ArchNodeCardImpl({ data, selected }: NodeProps<ArchFlowNode>) {
  const { node, pulseKey } = data;
  const down = node.status === "down";
  return (
    <div
      key={pulseKey ?? "static"}
      className={[styles.node, down && styles.down, selected && styles.selected, pulseKey !== null && styles.pulse]
        .filter(Boolean)
        .join(" ")}
      data-testid={`node-${node.id}`}
      data-status={node.status}
      aria-label={`${node.label}, ${subtitle(node)}${down ? ", down" : ""}`}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />
      <span className={styles.glyph} aria-hidden>
        {GLYPH[node.kind]}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{node.label}</span>
        <span className={styles.subtitle}>{subtitle(node)}</span>
      </span>
      {node.props.replicas > 1 && <span className={styles.badge}>×{node.props.replicas}</span>}
      {down && (
        <span className={styles.downMark} aria-hidden>
          ✕
        </span>
      )}
      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
}

export const ArchNodeCard = memo(ArchNodeCardImpl);
