"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";
import { ArchNodeCard, type ArchFlowNode } from "./ArchNodeCard";
import { useLayout } from "./useLayout";
import styles from "./board.module.css";

const nodeTypes = { arch: ArchNodeCard };
const PULSE_MS = 900;

function toEdges(graph: Graph): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    className: styles[`edge-${e.kind}`],
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    label: e.traffic === "all" ? undefined : e.traffic,
  }));
}

export function Canvas({ graph }: { graph: Graph }) {
  const positions = useLayout(graph);
  const changed = useBoardStore((s) => s.changed);
  const setPinned = useBoardStore((s) => s.setPinned);
  const [nodes, setNodes, onNodesChange] = useNodesState<ArchFlowNode>([]);
  const edges = useMemo(() => toEdges(graph), [graph]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    const pulsing = Date.now() - changed.at < PULSE_MS ? new Set(changed.ids) : new Set<string>();
    setNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return graph.nodes.map((node) => {
        const position = positions?.[node.id];
        return {
          id: node.id,
          type: "arch",
          position: position ?? { x: 0, y: 0 },
          hidden: !position,
          selected: selected.has(node.id),
          data: { node, pulseKey: pulsing.has(node.id) ? changed.at : null },
        };
      });
    });
  }, [graph, positions, changed, setNodes]);

  // Re-fit when the topology layout changes so new components are in view.
  const layoutKey = positions ? Object.keys(positions).sort().join(",") : "";
  useEffect(() => {
    if (layoutKey) requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 250 }));
  }, [layoutKey, fitView]);

  return (
    <ReactFlow<ArchFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_e, node) => setPinned(node.id, node.position)}
      deleteKeyCode={null}
      nodesConnectable={false}
      colorMode="system"
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      aria-label="Architecture canvas"
    >
      <Background gap={24} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
