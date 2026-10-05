import type { NodeKind } from "@archie/simulator";
import { NODE_HEIGHT as H, NODE_WIDTH as W } from "./layout";

/**
 * Node shapes (docs/06 · Node shapes and logos). Each kind belongs to a family, and each family
 * has the outline people already use on architecture diagrams. Every shape fits the same 184×72
 * box, so layout, handles and edges don't change. Drawn as SVG paths, inset half a stroke.
 */

export type Family = "users" | "edge" | "compute" | "data" | "async" | "outside";

export const FAMILY: Record<NodeKind, Family> = {
  client: "users",
  cdn: "edge",
  lb: "edge",
  gateway: "edge",
  service: "compute",
  worker: "compute",
  cache: "data",
  sql: "data",
  nosql: "data",
  search: "data",
  objectstore: "data",
  queue: "async",
  external: "outside",
};

const r = 0.75; // half the 1.5 px stroke
const R = 12; // corner radius, --radius-md
const CAP = 5; // cylinder cap height
const END = 12; // pipe end depth
const CUT = 14; // hexagon point depth

const roundRect = (radius: number) =>
  `M${r + radius},${r} H${W - r - radius} A${radius},${radius} 0 0 1 ${W - r},${r + radius} V${H - r - radius} ` +
  `A${radius},${radius} 0 0 1 ${W - r - radius},${H - r} H${r + radius} A${radius},${radius} 0 0 1 ${r},${H - r - radius} ` +
  `V${r + radius} A${radius},${radius} 0 0 1 ${r + radius},${r} Z`;

const rx = (W - 2 * r) / 2;

/** Outline path, plus an optional detail stroke (the cylinder's front lip, the pipe's near end). */
export const SHAPE: Record<Family, { outline: string; detail?: string }> = {
  users: { outline: roundRect((H - 2 * r) / 2) },
  compute: { outline: roundRect(R) },
  outside: { outline: roundRect(R) },
  edge: {
    outline: `M${CUT},${r} H${W - CUT} L${W - r},${H / 2} L${W - CUT},${H - r} H${CUT} L${r},${H / 2} Z`,
  },
  data: {
    outline:
      `M${r},${CAP} A${rx},${CAP - r} 0 0 1 ${W - r},${CAP} V${H - CAP} ` +
      `A${rx},${CAP - r} 0 0 1 ${r},${H - CAP} Z`,
    detail: `M${r},${CAP} A${rx},${CAP - r} 0 0 0 ${W - r},${CAP}`,
  },
  async: {
    outline:
      `M${END},${r} H${W - END} A${END - r},${H / 2 - r} 0 0 1 ${W - END},${H - r} H${END} ` +
      `A${END - r},${H / 2 - r} 0 0 1 ${END},${r} Z`,
    detail: `M${W - END},${r} A${END - r},${H / 2 - r} 0 0 0 ${W - END},${H - r}`,
  },
};
