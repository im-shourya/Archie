import { describe, expect, it } from "vitest";
import { buildTemplate, emptyGraph } from "@archie/simulator";
import { decodeShare, encodeShare, MAX_SHARE_CHARS, SHARE_PREFIX } from "./share";

describe("share links", () => {
  it("round-trips a board", () => {
    const board = { name: "Three tier", graph: buildTemplate("three-tier") };
    const encoded = encodeShare(board);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.value.startsWith(SHARE_PREFIX)).toBe(true);
    expect(decodeShare(`#${encoded.value}`)).toEqual({ ok: true, value: board });
  });

  it.each([
    ["wrong version", "v9:abc"],
    ["garbage", `${SHARE_PREFIX}%%%not-lz%%%`],
    ["too large", SHARE_PREFIX + "a".repeat(MAX_SHARE_CHARS)],
  ])("rejects %s", (_name, hash) => {
    expect(decodeShare(hash).ok).toBe(false);
  });

  it("rejects payloads that decode but fail validation", async () => {
    const { compressToEncodedURIComponent } = await import("lz-string");
    const bad = { name: "x", graph: { ...emptyGraph(), nodes: [{ id: "BAD" }] } };
    expect(decodeShare(SHARE_PREFIX + compressToEncodedURIComponent(JSON.stringify(bad))).ok).toBe(false);
  });
});
