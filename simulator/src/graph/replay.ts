import { applyBatch } from "./ops";
import type { BoardEvent } from "./events";
import { emptyGraph, type Graph } from "./types";

/**
 * Session replay (FR-044, UF-13): the board after each logged event, from an empty board.
 * Undo and redo are logged without ops (snapshots, ADR-011), so this keeps the same two stacks
 * the store does. If an event can't be applied (the log is capped at 1,000 events and the oldest
 * are trimmed), replay stops there and reports the index.
 */
export interface Replay {
  /** steps[0] is the empty board; steps[i + 1] is the board after events[i]. */
  steps: Graph[];
  /** Index of the first event that couldn't be replayed, or null. */
  stoppedAt: number | null;
}

export function replay(events: readonly BoardEvent[]): Replay {
  let current = emptyGraph();
  const steps = [current];
  const undo: Graph[] = [];
  const redo: Graph[] = [];
  for (const [i, event] of events.entries()) {
    if (event.source === "undo") {
      const previous = undo.pop();
      if (previous) {
        redo.push(current);
        current = previous;
      }
    } else if (event.source === "redo") {
      const next = redo.pop();
      if (next) {
        undo.push(current);
        current = next;
      }
    } else {
      const result = applyBatch(current, event.ops);
      if (!result.ok) return { steps, stoppedAt: i };
      undo.push(current);
      redo.length = 0;
      current = result.graph;
    }
    steps.push(current);
  }
  return { steps, stoppedAt: null };
}

/** Same nodes, edges and workload: the version counter and layout pins don't count. */
export function sameDesign(a: Graph, b: Graph): boolean {
  const shape = (g: Graph) =>
    JSON.stringify({ nodes: g.nodes.map(({ pinned: _p, ...n }) => n), edges: g.edges, workload: g.workload });
  return shape(a) === shape(b);
}
