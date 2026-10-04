import { CATALOG, type Graph } from "../graph";
import type { SimResult, SimStatus } from "../sim";

/**
 * A standalone SVG of the board (FR-043) from the canvas's laid-out boxes. Drawn by our own code
 * instead of screenshotting the DOM: no extra library, the light palette for documents, and every
 * label XML-escaped (T-05). PNG export draws this SVG onto a canvas.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The light theme's tokens (frontend/src/app/globals.css), fixed so exports look the same everywhere. */
const PALETTE = {
  background: "#f6f5f1",
  surface: "#ffffff",
  text: "#16181d",
  muted: "#525866",
  edge: "#a8a497",
  status: {
    healthy: "#1e7a58",
    warm: "#9a6200",
    hot: "#b8501a",
    saturated: "#c0283a",
    down: "#646a77",
    idle: "#cfccc2",
  } satisfies Record<SimStatus, string>,
};

const PAD = 32;
const TITLE = 40;

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Where the segment from the centre of `box` towards (tx, ty) leaves the box. */
function exit(box: Box, tx: number, ty: number): [number, number] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const t = Math.min(dx ? box.width / 2 / Math.abs(dx) : Infinity, dy ? box.height / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

export function toSvg(graph: Graph, layout: Readonly<Record<string, Box>>, sim: SimResult, title: string): string {
  const placed = graph.nodes.filter((n) => layout[n.id]);
  const boxes = placed.map((n) => layout[n.id]!);
  const minX = Math.min(0, ...boxes.map((b) => b.x));
  const minY = Math.min(0, ...boxes.map((b) => b.y));
  const maxX = Math.max(240, ...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(0, ...boxes.map((b) => b.y + b.height));
  const ox = PAD - minX;
  const oy = PAD + TITLE - minY;
  const width = maxX - minX + PAD * 2;
  const height = maxY - minY + PAD * 2 + TITLE;
  const at = (b: Box): Box => ({ ...b, x: b.x + ox, y: b.y + oy });

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif">`,
    `<title>${escapeXml(title)}</title>`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${PALETTE.edge}"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="${PALETTE.background}"/>`,
    `<text x="${PAD}" y="${PAD + 16}" font-size="18" font-weight="600" fill="${PALETTE.text}">${escapeXml(title)}</text>`,
  ];

  for (const e of graph.edges) {
    const a = layout[e.from];
    const b = layout[e.to];
    if (!a || !b) continue;
    const from = at(a);
    const to = at(b);
    const [x1, y1] = exit(from, to.x + to.width / 2, to.y + to.height / 2);
    const [x2, y2] = exit(to, from.x + from.width / 2, from.y + from.height / 2);
    const dash = e.kind === "async" ? ` stroke-dasharray="6 4"` : "";
    const widthPx = e.kind === "replication" ? 2.5 : 1.5;
    out.push(
      `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${PALETTE.edge}" stroke-width="${widthPx}"${dash} marker-end="url(#arrow)"/>`,
    );
  }

  for (const n of placed) {
    const b = at(layout[n.id]!);
    const m = sim.nodes[n.id];
    const status: SimStatus = n.status === "down" ? "down" : (m?.status ?? "idle");
    const colour = PALETTE.status[status];
    const instances = `${n.props.replicas > 1 ? ` ×${n.props.replicas}` : ""}${(n.props.shards ?? 1) > 1 ? ` · ${n.props.shards} shards` : ""}`;
    const detail = n.status === "down" ? "down" : m ? `ρ ${m.rho.toFixed(2)} · ${status}` : "";
    out.push(
      `<g data-node="${escapeXml(n.id)}">`,
      `<rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(b.width)}" height="${fmt(b.height)}" rx="8" fill="${PALETTE.surface}" stroke="${colour}" stroke-width="2"${n.status === "down" ? ` stroke-dasharray="5 3"` : ""}/>`,
      `<rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="4" height="${fmt(b.height)}" rx="2" fill="${colour}"/>`,
      `<text x="${fmt(b.x + 14)}" y="${fmt(b.y + 22)}" font-size="13" font-weight="600" fill="${PALETTE.text}">${escapeXml(n.label)}</text>`,
      `<text x="${fmt(b.x + 14)}" y="${fmt(b.y + 40)}" font-size="11" fill="${PALETTE.muted}">${escapeXml(CATALOG[n.kind].displayName + instances)}</text>`,
      ...(detail ? [`<text x="${fmt(b.x + 14)}" y="${fmt(b.y + 56)}" font-size="11" fill="${colour}">${escapeXml(detail)}</text>`] : []),
      `</g>`,
    );
  }
  out.push("</svg>");
  return out.join("\n") + "\n";
}
