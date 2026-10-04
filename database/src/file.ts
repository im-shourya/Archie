import * as z from "zod/mini";
import { GraphSchema, type Graph } from "@archie/simulator";
import { BOARD_SCHEMA_VERSION } from "./schema";
import type { ShareResult } from "./share";

/** Export → JSON and Open file (FR-043, docs/28 · backups). Same validation as share links. */
export const BOARD_FILE_FORMAT = "archie-board";
export const MAX_BOARD_FILE_BYTES = 1024 * 1024;

const BoardFileSchema = z.object({
  format: z.literal(BOARD_FILE_FORMAT),
  version: z.number().check(z.int(), z.positive()),
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  graph: GraphSchema,
});

export function encodeBoardFile(board: { name: string; graph: Graph }, exportedAt: Date = new Date()): string {
  const file = {
    format: BOARD_FILE_FORMAT,
    version: BOARD_SCHEMA_VERSION,
    name: board.name.slice(0, 80) || "Untitled board",
    exportedAt: exportedAt.toISOString(),
    graph: board.graph,
  };
  return JSON.stringify(file, null, 2) + "\n";
}

/** Errors never echo the file's contents back. */
export function decodeBoardFile(text: string): ShareResult<{ name: string; graph: Graph }> {
  if (new TextEncoder().encode(text).length > MAX_BOARD_FILE_BYTES) return { ok: false, error: "That file is larger than 1 MB." };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't JSON." };
  }
  const head = json as { format?: unknown; version?: unknown } | null;
  if (head?.format !== BOARD_FILE_FORMAT) return { ok: false, error: "That file isn't an Archie board export." };
  if (typeof head.version === "number" && head.version > BOARD_SCHEMA_VERSION) {
    return { ok: false, error: "That board was made with a newer version of Archie." };
  }
  const parsed = BoardFileSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "That board file is damaged or has values out of range." };
  return { ok: true, value: { name: parsed.data.name, graph: parsed.data.graph } };
}
