import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { applyBatch, CATALOG, NODE_KINDS, validateBatch } from "@archie/simulator";
import { CommandResultSchema } from "../schemas";
import { COMMAND_SYSTEM_PROMPT } from "./command";
import { EXAMPLES } from "./examples";

describe("command system prompt", () => {
  it("is byte-identical across fresh imports (cacheable)", async () => {
    vi.resetModules();
    const again = (await import("./command")).COMMAND_SYSTEM_PROMPT;
    expect(again).toBe(COMMAND_SYSTEM_PROMPT);
  });

  it("has no clock or randomness in its sources", () => {
    for (const file of ["command.ts", "examples.ts", "../context.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).not.toMatch(/Date\.now|new Date|Math\.random|crypto\.|performance\.now|toLocale/);
    }
  });

  it("lists every catalog kind with its aliases", () => {
    for (const kind of NODE_KINDS) {
      expect(COMMAND_SYSTEM_PROMPT).toContain(`| ${kind} | ${CATALOG[kind].displayName} | ${CATALOG[kind].aliases.join(", ")} |`);
    }
  });

  it("keeps sections in stable-first order", () => {
    const order = ["## Rules", "## Component catalog", "## Ops", "## Result kinds", "## Output format", "## Worked examples"];
    const positions = order.map((h) => COMMAND_SYSTEM_PROMPT.indexOf(h));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("contains 12 worked examples", () => {
    expect(COMMAND_SYSTEM_PROMPT.match(/^### Example \d+:/gm)).toHaveLength(12);
  });
});

describe("worked examples", () => {
  it("cover every result kind", () => {
    expect(new Set(EXAMPLES.map((e) => e.result.kind))).toEqual(new Set(["ops", "clarify", "confirm", "answer", "noop"]));
  });

  it.each(EXAMPLES.map((e) => [e.title, e] as const))("%s: result matches the contract", (_title, ex) => {
    expect(CommandResultSchema.safeParse(ex.result).success).toBe(true);
  });

  it.each(EXAMPLES.filter((e) => e.result.ops.length > 0).map((e) => [e.title, e] as const))(
    "%s: ops validate against the example graph",
    (_title, ex) => {
      expect(validateBatch(ex.graph, ex.result.ops)).toEqual([]);
    },
  );

  it.each(EXAMPLES.map((e) => [e.title, e] as const))("%s: focus ids exist after the edit", (_title, ex) => {
    const after = ex.result.ops.length > 0 ? applyBatch(ex.graph, ex.result.ops) : null;
    const graph = after?.ok ? after.graph : ex.graph;
    const ids = new Set([...graph.nodes, ...ex.graph.nodes].map((n) => n.id));
    for (const id of ex.result.focusNodeIds) expect(ids.has(id), id).toBe(true);
  });

  it("the confirm example removes more than 3 nodes (G-03)", () => {
    const confirm = EXAMPLES.find((e) => e.result.kind === "confirm")!;
    expect(confirm.result.ops.filter((o) => o.type === "removeNode").length).toBeGreaterThan(3);
  });

  it("the answer example quotes numbers that are in its sim summary", () => {
    const answer = EXAMPLES.find((e) => e.result.kind === "answer")!;
    const rendered = COMMAND_SYSTEM_PROMPT.slice(COMMAND_SYSTEM_PROMPT.indexOf(answer.utterance) - 2000);
    for (const n of answer.result.message.match(/\d[\d,.]*\d/g) ?? []) expect(rendered).toContain(n);
  });
});
