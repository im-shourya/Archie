import { readFileSync, readdirSync } from "node:fs";
import { GraphSchema, type Graph } from "@archie/simulator";
import { z } from "zod";
import type { Assertion } from "./assertions";

/** Eval cases and fixtures (docs/23). Must match specs/evaluation-schema.json → Case. */

export const CATEGORIES = [
  "create",
  "modify",
  "connect",
  "scale",
  "insert",
  "workload",
  "failure",
  "compound",
  "question",
  "ambiguity",
  "destructive",
  "off-topic",
  "injection",
  "bounds",
  "dictation-noise",
] as const;

export const KINDS = ["ops", "clarify", "confirm", "answer", "noop"] as const;

export const CaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z-]+-[0-9]{2,3}$/),
  split: z.enum(["dev", "test"]),
  category: z.enum(CATEGORIES),
  fixture: z.string(),
  utterance: z.string().min(1).max(4000),
  expect: z.strictObject({
    kind: z.enum(KINDS),
    assert: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  tags: z.array(z.string()).optional(),
  retired: z.boolean().optional(),
  note: z.string().optional(),
});

export type EvalCase = Omit<z.infer<typeof CaseSchema>, "expect"> & {
  expect: { kind: (typeof KINDS)[number]; assert?: Assertion[] };
};
export type Category = (typeof CATEGORIES)[number];
export type Split = "dev" | "test" | "all";

const root = new URL("../", import.meta.url);

export function loadCases(split: Split = "all"): EvalCase[] {
  const files = split === "all" ? ["dev", "test"] : [split];
  return files.flatMap((f) =>
    readFileSync(new URL(`cases/${f}.jsonl`, root), "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line, i) => {
        const parsed = CaseSchema.safeParse(JSON.parse(line));
        if (!parsed.success) throw new Error(`cases/${f}.jsonl:${i + 1}: ${parsed.error.issues[0]?.message}`);
        if (parsed.data.split !== f) throw new Error(`cases/${f}.jsonl:${i + 1}: split "${parsed.data.split}" in the ${f} file`);
        return parsed.data as EvalCase;
      })
      .filter((c) => !c.retired),
  );
}

export function loadFixtures(): Record<string, Graph> {
  const dir = new URL("fixtures/", root);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(/\.json$/, ""), GraphSchema.parse(JSON.parse(readFileSync(new URL(f, dir), "utf8")))]),
  );
}
