import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import * as z from "zod/mini";
import { GraphSchema, type Graph } from "@archie/simulator";

/** Share links: /s#v1:<lz-string> (docs/17, ADR-010). The hash never reaches the server. */
export const SHARE_PREFIX = "v1:";
export const MAX_SHARE_CHARS = 32 * 1024;

const SharedBoardSchema = z.strictObject({
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  graph: GraphSchema,
});

export type SharedBoard = z.infer<typeof SharedBoardSchema>;

export type ShareResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function encodeShare(board: { name: string; graph: Graph }): ShareResult<string> {
  const payload =
    SHARE_PREFIX + compressToEncodedURIComponent(JSON.stringify(SharedBoardSchema.parse(board)));
  if (payload.length > MAX_SHARE_CHARS) {
    return { ok: false, error: "This board is too large for a link. Use Export → JSON instead." };
  }
  return { ok: true, value: payload };
}

export function decodeShare(hash: string): ShareResult<SharedBoard> {
  const data = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!data.startsWith(SHARE_PREFIX)) return { ok: false, error: "Unsupported link version." };
  if (data.length > MAX_SHARE_CHARS) return { ok: false, error: "Link is too large." };
  const json = decompressFromEncodedURIComponent(data.slice(SHARE_PREFIX.length));
  if (!json) return { ok: false, error: "This link is broken." };
  try {
    const parsed = SharedBoardSchema.safeParse(JSON.parse(json));
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, error: "This link is broken." };
  } catch {
    return { ok: false, error: "This link is broken." };
  }
}
