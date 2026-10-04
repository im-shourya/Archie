import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { NODE_KINDS, validateBatch } from "@archie/simulator";
import { ambiguousRefs } from "@archie/ai/llm";
import { CATEGORIES, loadCases, loadFixtures } from "./cases";

/** The dataset rules from docs/22 (acceptance) and docs/23 (labelling), enforced. */

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const rawLines = (["dev", "test"] as const).flatMap((f) => read(`cases/${f}.jsonl`).split("\n").filter((l) => l.trim()));
const frozen: Record<string, string> = JSON.parse(read("cases/frozen.json"));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("dataset", () => {
  const cases = loadCases("all");
  const fixtures = loadFixtures();

  it("has ≥ 80 cases, every category ≥ 5 with ≥ 2 held out (docs/22)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(80);
    for (const cat of CATEGORIES) {
      const of = cases.filter((c) => c.category === cat);
      expect(of.length, cat).toBeGreaterThanOrEqual(5);
      expect(of.filter((c) => c.split === "test").length, `${cat} test`).toBeGreaterThanOrEqual(2);
    }
  });

  it("has unique ids that start with their category, and known fixtures", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(c.id.replace(/-\d+$/, ""), c.id).toBe(c.category);
      expect(fixtures[c.fixture], `${c.id} → ${c.fixture}`).toBeDefined();
    }
  });

  it("validates every line against specs/evaluation-schema.json → Case", () => {
    const schema = JSON.parse(readFileSync(new URL("../specs/evaluation-schema.json", root), "utf8"));
    const validate = new Ajv2020({ strict: false }).addSchema(schema).getSchema(`${schema.$id}#/$defs/Case`)!;
    for (const line of rawLines) expect(validate(JSON.parse(line)), line.slice(0, 40)).toBe(true);
  });

  it("is split about 60/40 dev/test", () => {
    const dev = cases.filter((c) => c.split === "dev").length / cases.length;
    expect(dev).toBeGreaterThan(0.55);
    expect(dev).toBeLessThan(0.7);
  });

  it("never repeats an utterance", () => {
    const norm = cases.map((c) => c.utterance.toLowerCase().replace(/\W+/g, " ").trim());
    expect(new Set(norm).size).toBe(norm.length);
  });

  it("never edits a case: every line matches its frozen hash (retire + new id instead, docs/23)", () => {
    const byId = new Map(rawLines.map((l) => [JSON.parse(l).id as string, l]));
    for (const [id, hash] of Object.entries(frozen)) expect(sha(byId.get(id) ?? ""), id).toBe(hash);
    for (const id of byId.keys()) expect(frozen[id], `${id} is not in cases/frozen.json`).toBeDefined();
  });

  it("uses every fixture at least 3 times", () => {
    for (const name of Object.keys(fixtures)) {
      expect(cases.filter((c) => c.fixture === name).length, name).toBeGreaterThanOrEqual(3);
    }
  });

  it("fixtures are valid graphs that the op engine accepts", () => {
    for (const [name, g] of Object.entries(fixtures)) {
      for (const n of g.nodes) expect(NODE_KINDS, name).toContain(n.kind);
      // A no-op round trip proves ids, edges and props are all valid for the engine.
      if (g.nodes.length) expect(validateBatch(g, [{ type: "setWorkload" }]), name).toEqual([]);
    }
  });

  it("names only node ids that exist in the fixture (or that the edit could create)", () => {
    for (const c of cases) {
      const ids = new Set(fixtures[c.fixture]!.nodes.map((n) => n.id));
      for (const a of c.expect.assert ?? []) {
        const named = [
          "node" in a ? a.node : undefined,
          "status" in a ? a.status.node : undefined,
          "loadDrops" in a ? a.loadDrops.node : undefined,
          ...("focusIncludes" in a ? a.focusIncludes : []),
        ];
        for (const id of named) if (id !== undefined) expect(ids.has(id), `${c.id} names "${id}"`).toBe(true);
      }
    }
  });

  it("G-13 sees an ambiguous reference only where the case expects a question or a confirmation", () => {
    // Guards the guard: on a case whose right answer is an edit, a flagged reference could turn
    // that edit into a needless question (offline, no model calls).
    for (const c of cases) {
      if (ambiguousRefs(c.utterance, fixtures[c.fixture]!).length > 0) {
        expect(["clarify", "confirm"], c.id).toContain(c.expect.kind);
      }
    }
    // …and it does see every "the database"-style ambiguity case.
    const flagged = cases.filter((c) => c.category === "ambiguity" && ambiguousRefs(c.utterance, fixtures[c.fixture]!).length > 0);
    expect(flagged.length).toBeGreaterThanOrEqual(7);
  });

  it("hold-back cases assert the board is untouched", () => {
    for (const c of cases.filter((x) => ["clarify", "confirm", "noop"].includes(x.expect.kind))) {
      expect(c.expect.assert, c.id).toContainEqual({ unchanged: true });
    }
  });
});
