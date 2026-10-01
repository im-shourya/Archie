import { create } from "zustand";
import {
  applyBatch,
  changedNodeIds,
  type ApplyResult,
  type BoardEvent,
  type EventSource,
  type Graph,
} from "@archie/simulator";
import { getRepository, newId, type Board } from "@archie/database";

/**
 * Board store (docs/04 · State). Single source of truth for the open board.
 * Every graph change goes through `apply` (docs/08). Undo restores exact snapshots.
 */

export const UNDO_DEPTH = 200;

/** Node ids referenced by the most recent change that had ops ("it" in "bring it back"). */
export function recentNodeIds(events: readonly BoardEvent[]): string[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const ops = events[i]!.ops;
    if (ops.length === 0) continue;
    const ids = new Set<string>();
    for (const op of ops) {
      if ("id" in op && op.id) ids.add(op.id);
      if ("from" in op) ids.add(op.from).add(op.to);
      if (op.type === "insertBetween" && op.node.id) ids.add(op.node.id);
    }
    return [...ids];
  }
  return [];
}
const SAVE_DEBOUNCE_MS = 500;

export interface ApplyMeta {
  utterance: string | null;
  source: EventSource;
  timings?: BoardEvent["timings"];
}

interface BoardState {
  status: "idle" | "loading" | "ready" | "missing";
  persistent: boolean;
  board: Board | null;
  events: BoardEvent[];
  undoStack: Graph[];
  redoStack: Graph[];
  /** Nodes touched by the last change, for the pulse animation. */
  changed: { ids: string[]; at: number };
  /** Node ids selected on the canvas (mirrored from React Flow for the panels). */
  selection: string[];
  setSelection(ids: string[]): void;
  load(id: string): Promise<void>;
  apply(ops: readonly unknown[], meta: ApplyMeta): ApplyResult;
  undo(): boolean;
  redo(): boolean;
  setPinned(nodeId: string, position: { x: number; y: number } | null): void;
  rename(name: string): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave(board: Board): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void getRepository()
      .then((repo) => repo.saveBoard(board))
      .catch((err) => console.error("[archie] failed to save board", err));
  }, SAVE_DEBOUNCE_MS);
}

function logEvent(boardId: string, event: BoardEvent): void {
  void getRepository()
    .then((repo) => repo.appendEvent(boardId, event))
    .catch((err) => console.error("[archie] failed to log event", err));
}

export const useBoardStore = create<BoardState>()((set, get) => {
  /** Replace the graph, record history and persistence. Shared by apply/undo/redo. */
  function commit(graph: Graph, changedIds: string[], event: Omit<BoardEvent, "id" | "at" | "versionAfter">) {
    const { board } = get();
    if (!board) return;
    const at = Date.now();
    const next: Board = { ...board, graph, updatedAt: at };
    const logged: BoardEvent = { ...event, id: newId(), at, versionAfter: graph.version };
    set((s) => ({ board: next, events: [...s.events, logged], changed: { ids: changedIds, at } }));
    scheduleSave(next);
    logEvent(board.id, logged);
  }

  return {
    status: "idle",
    persistent: true,
    board: null,
    events: [],
    undoStack: [],
    redoStack: [],
    changed: { ids: [], at: 0 },
    selection: [],

    setSelection(ids) {
      const current = get().selection;
      if (ids.length === current.length && ids.every((id, i) => id === current[i])) return;
      set({ selection: ids });
    },

    async load(id) {
      set({ status: "loading", board: null, events: [], undoStack: [], redoStack: [], selection: [] });
      const repo = await getRepository();
      const [board, events] = await Promise.all([repo.getBoard(id), repo.listEvents(id)]);
      if (get().status !== "loading") return;
      set(
        board
          ? { status: "ready", board, events, persistent: repo.persistent }
          : { status: "missing", persistent: repo.persistent },
      );
    },

    apply(ops, meta) {
      const { board } = get();
      if (!board) return { ok: false, errors: [{ opIndex: -1, code: "INVALID_OP", message: "no board open" }] };
      const result = applyBatch(board.graph, ops);
      if (!result.ok) return result;
      set((s) => ({ undoStack: [...s.undoStack, board.graph].slice(-UNDO_DEPTH), redoStack: [] }));
      commit(result.graph, result.changedNodeIds, {
        utterance: meta.utterance,
        source: meta.source,
        // Validated by applyBatch above.
        ops: ops as BoardEvent["ops"],
        ...(meta.timings ? { timings: meta.timings } : {}),
      });
      return result;
    },

    undo() {
      const { board, undoStack } = get();
      const previous = undoStack.at(-1);
      if (!board || !previous) return false;
      // Versions only move forward so in-flight AI responses detect the change (FR-035).
      const restored = { ...previous, version: board.graph.version + 1 };
      set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, board.graph] }));
      commit(restored, changedNodeIds(board.graph, restored), { utterance: null, source: "undo", ops: [] });
      return true;
    },

    redo() {
      const { board, redoStack } = get();
      const next = redoStack.at(-1);
      if (!board || !next) return false;
      const restored = { ...next, version: board.graph.version + 1 };
      set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, board.graph] }));
      commit(restored, changedNodeIds(board.graph, restored), { utterance: null, source: "redo", ops: [] });
      return true;
    },

    setPinned(nodeId, position) {
      const { board } = get();
      if (!board) return;
      // Layout-only: not an op, not in undo history.
      const nodes = board.graph.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const { pinned: _old, ...rest } = n;
        return position ? { ...rest, pinned: position } : rest;
      });
      const next = { ...board, graph: { ...board.graph, nodes }, updatedAt: Date.now() };
      set({ board: next });
      scheduleSave(next);
    },

    rename(name) {
      const { board } = get();
      const trimmed = name.trim().slice(0, 80);
      if (!board || !trimmed || trimmed === board.name) return;
      const next = { ...board, name: trimmed, updatedAt: Date.now() };
      set({ board: next });
      scheduleSave(next);
    },
  };
});
