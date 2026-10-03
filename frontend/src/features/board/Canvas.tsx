"use client";

import { useEffect, useMemo, useRef } from "react";
import { Background, Controls, MarkerType, ReactFlow, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph, SimResult } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";
import { ArchNodeCard, type ArchFlowNode } from "./ArchNodeCard";
import { TrafficEdge, type TrafficFlowEdge } from "./TrafficEdge";
import { useCompactLayout } from "./useCompactLayout";
import { useFit } from "./useFit";
import styles from "./board.module.css";
import { useLayout } from "./useLayout";

const nodeTypes = { arch: ArchNodeCard };
const edgeTypes = { traffic: TrafficEdge };
const PULSE_MS = 900;

function toEdges(graph: Graph, sim: SimResult): TrafficFlowEdge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: "traffic",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    data: { rps: sim.edges[e.id]?.rps ?? 0, errorRps: sim.edges[e.id]?.errorRps ?? 0, kind: e.kind, traffic: e.traffic },
  }));
}

export function Canvas({ graph, sim }: { graph: Graph; sim: SimResult }) {
  const { compact, portrait } = useCompactLayout();
  const vertical = compact && portrait;
  const positions = useLayout(graph, vertical ? "DOWN" : "RIGHT");
  const changed = useBoardStore((s) => s.changed);
  const setPinned = useBoardStore((s) => s.setPinned);
  const [nodes, setNodes, onNodesChange] = useNodesState<ArchFlowNode>([]);
  const setSelection = useBoardStore((s) => s.setSelection);
  const edges = useMemo(() => toEdges(graph, sim), [graph, sim]);
  const fit = useFit();
  const wrapper = useRef<HTMLDivElement>(null);

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
          data: {
            node,
            pulseKey: pulsing.has(node.id) ? changed.at : null,
            metrics: sim.nodes[node.id] ?? null,
            bottleneck: sim.bottleneck?.id === node.id,
            vertical,
            // On phones the sheet's peek names the bottleneck; a callout would cover the graph.
            callout: !compact,
          },
        };
      });
    });
  }, [graph, sim, positions, changed, setNodes, vertical, compact]);

  // Re-fit when the topology layout changes so new components are in view.
  const layoutKey = positions ? `${vertical}|${Object.keys(positions).sort().join(",")}` : "";
  useEffect(() => {
    if (layoutKey) requestAnimationFrame(() => void fit());
  }, [layoutKey, fit]);

  // Re-fit when the canvas is resized (orientation change, window resize).
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) return void (first = false);
      clearTimeout(timer);
      timer = setTimeout(() => void fit(0), 150);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [fit]);

  return (
    <div ref={wrapper} className={styles.flow}>
    <ReactFlow<ArchFlowNode, TrafficFlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onSelectionChange={({ nodes: selected }) => setSelection(selected.map((n) => n.id))}
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
      <Controls showInteractive={false} position="top-left" />
    </ReactFlow>
    </div>
  );
}
