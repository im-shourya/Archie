import { encodeShare, type ShareResult } from "@archie/database";
import type { Graph } from "@archie/simulator";

/** A read-only link to this board (FR-042, ADR-010). The design rides in the hash, never sent to us. */
export function shareUrl(board: { name: string; graph: Graph }, origin: string): ShareResult<string> {
  const encoded = encodeShare({ name: board.name.slice(0, 80) || "Untitled board", graph: board.graph });
  return encoded.ok ? { ok: true, value: `${origin}/s#${encoded.value}` } : encoded;
}

/** Copy the link, or hand it to a prompt the user can copy from when the clipboard is blocked. */
export async function copyShareLink(url: string): Promise<"copied" | "shown"> {
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    window.prompt("Copy this link to share a read-only copy of the board:", url);
    return "shown";
  }
}
