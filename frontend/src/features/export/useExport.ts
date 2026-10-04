"use client";

import { useReactFlow } from "@xyflow/react";
import type { Box } from "@archie/simulator/export";
import { useBoardStore } from "../store/board.store";
export type ExportKind = "json" | "mermaid" | "doc" | "svg" | "png";

export const EXPORT_KINDS: ExportKind[] = ["json", "mermaid", "doc", "svg", "png"];

export const EXPORT_LABEL: Record<ExportKind, string> = {
  json: "JSON (re-importable)",
  mermaid: "Mermaid diagram",
  doc: "Design doc (Markdown)",
  svg: "Image (SVG)",
  png: "Image (PNG)",
};

/** Runs an export with the canvas's current layout; the export code itself loads on first use. */
export function useExport() {
  const { getNodes } = useReactFlow();
  const notify = useBoardStore((s) => s.notify);
  return async (kind: ExportKind) => {
    const { board } = useBoardStore.getState();
    if (!board) return;
    const layout: Record<string, Box> = {};
    for (const n of getNodes()) {
      if (n.hidden) continue;
      layout[n.id] = { x: n.position.x, y: n.position.y, width: n.measured?.width ?? 180, height: n.measured?.height ?? 68 };
    }
    try {
      const { exportBoard } = await import("./exportBoard");
      await exportBoard(kind, board, layout);
    } catch (err) {
      console.error(err);
      notify("That export didn’t work in this browser. Try JSON.", false);
    }
  };
}
