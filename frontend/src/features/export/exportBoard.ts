import { encodeBoardFile } from "@archie/database";
import { simulate, type Graph } from "@archie/simulator";
import { toDesignDoc, toMermaid, toSvg, type Box } from "@archie/simulator/export";
import type { ExportKind } from "./useExport";

/** Export ▾ (FR-043). Loaded on demand, so none of this ships with the board route. */

const today = () => new Date().toISOString().slice(0, 10);

export function fileName(name: string, ext: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "archie-board"}-${today()}.${ext}`;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `layout`: the canvas's laid-out boxes (React Flow positions + measured sizes), for images. */
export async function exportBoard(kind: ExportKind, board: { name: string; graph: Graph }, layout: Record<string, Box>): Promise<void> {
  const { name, graph } = board;
  switch (kind) {
    case "json":
      return download(fileName(name, "json"), new Blob([encodeBoardFile(board)], { type: "application/json" }));
    case "mermaid":
      return download(fileName(name, "mmd"), new Blob([toMermaid(graph)], { type: "text/plain" }));
    case "doc":
      return download(fileName(name, "md"), new Blob([toDesignDoc({ name, graph, date: today() })], { type: "text/markdown" }));
    case "svg":
      return download(fileName(name, "svg"), new Blob([toSvg(graph, layout, simulate(graph), name)], { type: "image/svg+xml" }));
    case "png":
      return download(fileName(name, "png"), await svgToPng(toSvg(graph, layout, simulate(graph), name)));
  }
}
