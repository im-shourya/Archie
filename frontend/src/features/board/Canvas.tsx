"use client";

import { useEffect, useMemo, useRef } from "react";
import { Background, Controls, MarkerType, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph, SimResult, Spof } from "@archie/simulator";
import { opMessage } from "@/lib/format";
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

function toEdges(graph: Graph, sim: SimResult, editable: boolean): TrafficFlowEdge[] {
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: "traffic",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    selectable: editable,
    data: {
      rps: sim.edges[e.id]?.rps ?? 0,
      errorRps: sim.edges[e.id]?.errorRps ?? 0,
      kind: e.kind,
      traffic: e.traffic,
      fromLabel: label(e.from),
      toLabel: label(e.to),
      editable,
    },
  }));
}

/** `readOnly` (shared links): no dragging, no selection, nothing written to the board store. */
export function Canvas({
  graph,
  sim,
  spofs,
  readOnly = false,
}: {
  graph: Graph;
  sim: SimResult;
  spofs: readonly Spof[];
  readOnly?: boolean;
}) {
  const { compact, vertical } = useCompactLayout();
  const positions = useLayout(graph, vertical ? "DOWN" : "RIGHT");
  const changed = useBoardStore((s) => s.changed);
  const setPinned = useBoardStore((s) => s.setPinned);
  const [nodes, setNodes, onNodesChange] = useNodesState<ArchFlowNode>([]);
  const setSelection = useBoardStore((s) => s.setSelection);
  const selectRequest = useBoardStore((s) => s.selectRequest);
  const requestSelect = useBoardStore((s) => s.requestSelect);
  const edges = useMemo(() => toEdges(graph, sim, !readOnly), [graph, sim, readOnly]);
  // Edges are stateful like nodes so React Flow can select one (click, or focus + Enter).
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<TrafficFlowEdge>([]);
  useEffect(() => {
    setFlowEdges((prev) => {
      const selected = new Set(prev.filter((e) => e.selected).map((e) => e.id));
      return edges.map((e) => ({ ...e, selected: selected.has(e.id) }));
    });
  }, [edges, setFlowEdges]);
  const apply = useBoardStore((s) => s.apply);
  const notify = useBoardStore((s) => s.notify);
  const fit = useFit();
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spofIds = new Set(spofs.map((s) => s.id));
    const pulsing = Date.now() - changed.at < PULSE_MS ? new Set(changed.ids) : new Set<string>();
    setNodes((prev) => {
      const previous = new Map(prev.map((n) => [n.id, n]));
      return graph.nodes.map((node) => {
        const position = positions?.[node.id];
        const old = previous.get(node.id);
        return {
          // Keep React Flow's measured size: a node without it is hidden (visibility) until it is
          // measured again, which blinks the node and makes it unfocusable for a frame.
          ...(old?.measured ? { measured: old.measured } : {}),
          id: node.id,
          type: "arch",
          position: position ?? { x: 0, y: 0 },
          hidden: !position,
          selected: selectRequest && position ? node.id === selectRequest : (old?.selected ?? false),
          data: {
            node,
            pulseKey: pulsing.has(node.id) ? changed.at : null,
            metrics: sim.nodes[node.id] ?? null,
            bottleneck: sim.bottleneck?.id === node.id,
            spof: spofIds.has(node.id),
            vertical,
            // On phones the sheet's peek names the bottleneck; a callout would cover the graph.
            callout: !compact,
            editable: !readOnly,
          },
        };
      });
    });
  }, [graph, sim, spofs, positions, changed, setNodes, vertical, compact, selectRequest, readOnly]);

  // A select request is applied once the node has a position (the layout runs after an add).
  useEffect(() => {
    if (selectRequest && positions?.[selectRequest]) {
      setSelection([selectRequest]);
      requestSelect(null);
    }
  }, [selectRequest, positions, setSelection, requestSelect]);

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
      edges={flowEdges}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onSelectionChange={
        readOnly ? undefined : ({ nodes: selected }) => setSelection(selected.map((n) => n.id))
      }
      onNodeDragStop={readOnly ? undefined : (_e, node) => setPinned(node.id, node.position)}
      nodesDraggable={!readOnly}
      elementsSelectable={!readOnly}
      deleteKeyCode={null}
      nodesConnectable={!readOnly}
      // Drag from a component's handle to another: the same validated op as "connect A to B".
      isValidConnection={(c) => c.source !== c.target}
      onConnect={(c) => {
        const result = apply([{ type: "connect", from: c.source, to: c.target }], { utterance: null, source: "inspector" });
        const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
        notify(
          result.ok ? `Connected ${label(c.source)} → ${label(c.target)}` : opMessage(result.errors[0]?.message ?? "Can’t connect those."),
          result.ok,
        );
      }}
      connectionRadius={28}
      edgesFocusable={!readOnly}
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
