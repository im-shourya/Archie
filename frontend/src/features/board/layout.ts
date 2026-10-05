import type { ElkNode } from "elkjs/lib/elk-api";
import type { Graph } from "@archie/simulator";

/**
 * Layered layout (ADR-009): left → right, or top → bottom on portrait phones so wide graphs
 * stay legible. Positions are node top-left corners.
 */

export const NODE_WIDTH = 184;
export const NODE_HEIGHT = 72;
const LAYER_GAP = 96;
const NODE_GAP = 36;

export type Positions = Record<string, { x: number; y: number }>;
export type Direction = "RIGHT" | "DOWN";

export function toElkGraph(graph: Graph, direction: Direction = "RIGHT"): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.spacing.nodeNode": String(NODE_GAP),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_GAP),
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
    children: graph.nodes.map((n) => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: graph.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };
}

export function positionsFrom(result: ElkNode): Positions {
  const positions: Positions = {};
  for (const child of result.children ?? []) positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  return positions;
}

/**
 * Deterministic fallback: longest-path layering, nodes stacked per layer in graph order.
 * Used when ELK is unavailable or slow, so the canvas never stays empty.
 */
export function fallbackLayout(graph: Graph, direction: Direction = "RIGHT"): Positions {
  const layer = new Map(graph.nodes.map((n) => [n.id, 0]));
  // Relax edges |V| times (graph is acyclic over call edges; async loops just stop growing).
  for (let i = 0; i < graph.nodes.length; i++) {
    let moved = false;
    for (const e of graph.edges) {
      if (e.kind === "async" && (layer.get(e.to) ?? 0) > (layer.get(e.from) ?? 0)) continue;
      const next = (layer.get(e.from) ?? 0) + 1;
      if (next > (layer.get(e.to) ?? 0) && next < graph.nodes.length) {
        layer.set(e.to, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const rows = new Map<number, number>();
  const positions: Positions = {};
  for (const node of graph.nodes) {
    const l = layer.get(node.id) ?? 0;
    const row = rows.get(l) ?? 0;
    rows.set(l, row + 1);
    positions[node.id] =
      direction === "RIGHT"
        ? { x: l * (NODE_WIDTH + LAYER_GAP), y: row * (NODE_HEIGHT + NODE_GAP) }
        : { x: row * (NODE_WIDTH + NODE_GAP), y: l * (NODE_HEIGHT + LAYER_GAP) };
  }
  return positions;
}

type ElkOptions = { workerFactory?: (url?: string) => Worker; workerUrl?: string };
export type ElkLayout = { layout(graph: ElkNode): Promise<ElkNode>; terminateWorker?(): void };
type ElkConstructor = new (options?: ElkOptions) => ElkLayout;

/** elkjs is CommonJS; the import may be the class or a (nested) `{ default }` wrapper. */
export function elkConstructor(mod: unknown): ElkConstructor {
  let current: unknown = mod;
  for (let i = 0; i < 3 && typeof current !== "function"; i++) {
    current = (current as { default?: unknown } | null)?.default;
  }
  if (typeof current !== "function") throw new Error("elkjs: layout engine not found");
  return current as ElkConstructor;
}
