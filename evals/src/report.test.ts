import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReport } from "./report";

const file = (name: string): unknown => JSON.parse(readFileSync(new URL(`../results/${name}`, import.meta.url), "utf8"));
const committed = () => ({
  test: file("latest.json"),
  dev: file("b1-dev.json"),
  b0: file("b0-fastpath.json"),
  benchFast: file("bench-fastpath.json"),
  benchSim: file("bench-simulator.json"),
});

describe("buildReport", () => {
  it("builds from the committed result files", () => {
    const r = buildReport(committed());
    const test = file("latest.json") as { metrics: { taskAccuracy: number }; cases: unknown[] };
    expect(r.headline.taskAccuracy).toBe(test.metrics.taskAccuracy);
    expect(r.headline.cases).toBe(test.cases.length);
    expect(r.runs.map((x) => x.label)).toEqual(["Test split (held out)", "Dev split", "Fast path only (B0)"]);
    expect(r.latency[0]?.tier).toBe("Fast path (parse + apply)");
    expect(r.latency.some((l) => l.tier === "AI command (warm)" && l.source.startsWith("test split"))).toBe(true);
  });

  it("lists every failing case as a miss with a reason", () => {
    const r = buildReport(committed());
    const failing = [file("latest.json"), file("b1-dev.json")].flatMap(
      (run) => (run as { cases: { pass: boolean }[] }).cases.filter((c) => !c.pass),
    );
    expect(r.misses).toHaveLength(failing.length);
    for (const m of r.misses) expect(m.reason.length).toBeGreaterThan(0);
  });

  it("counts per category from both splits", () => {
    const r = buildReport(committed());
    const total = r.categories.reduce((s, c) => s + (c.dev?.n ?? 0) + (c.test?.n ?? 0), 0);
    const runs = [file("latest.json"), file("b1-dev.json")] as { cases: unknown[] }[];
    expect(total).toBe(runs[0]!.cases.length + runs[1]!.cases.length);
  });

  it("rejects a malformed file instead of rendering a wrong number", () => {
    const broken = structuredClone(committed().test) as { metrics: Record<string, unknown> };
    broken.metrics.taskAccuracy = "91%";
    expect(() => buildReport({ ...committed(), test: broken })).toThrow(/latest\.json is malformed at metrics\.taskAccuracy/);
  });

  it("refuses a dev run in the headline slot", () => {
    expect(() => buildReport({ ...committed(), test: file("b1-dev.json") })).toThrow(/test-split run/);
  });

  it("works without the optional runs", () => {
    const { test, benchFast, benchSim } = committed();
    const r = buildReport({ test, benchFast, benchSim });
    expect(r.dev).toBeUndefined();
    expect(r.fastPath).toBeNull();
    expect(r.runs).toHaveLength(1);
  });
});
