import { describe, expect, it } from "vitest";
import { buildTemplate } from "@archie/simulator";
import { decodeBoardFile, encodeBoardFile } from "./file";

const board = { name: "Checkout", graph: buildTemplate("three-tier") };

describe("board file (JSON export / Open file)", () => {
  it("round-trips the name and graph", () => {
    expect(decodeBoardFile(encodeBoardFile(board))).toEqual({ ok: true, value: board });
  });

  it("is versioned and timestamped", () => {
    const file = JSON.parse(encodeBoardFile(board, new Date("2026-10-04T10:00:00Z")));
    expect(file).toMatchObject({ format: "archie-board", version: 1, exportedAt: "2026-10-04T10:00:00.000Z" });
  });

  it.each<[string, string, RegExp]>([
    ["not JSON", "{nope", /isn't JSON/],
    ["another format", JSON.stringify({ format: "excalidraw" }), /isn't an Archie board/],
    ["a newer version", JSON.stringify({ ...JSON.parse(encodeBoardFile(board)), version: 99 }), /newer version/],
    ["an invalid graph", JSON.stringify({ format: "archie-board", version: 1, name: "x", graph: { nodes: [{ id: "BAD" }] } }), /damaged/],
    ["an out-of-bounds value", encodeBoardFile({ ...board, graph: { ...board.graph, workload: { ...board.graph.workload, rps: 1e12 } } }), /damaged/],
    ["over 1 MB", JSON.stringify({ pad: "x".repeat(1024 * 1024) }), /larger than 1 MB/],
  ])("rejects %s with a message that doesn't echo the file", (_name, text, message) => {
    const r = decodeBoardFile(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(message);
      expect(r.error.length).toBeLessThan(80);
    }
  });
});
