import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, emptyGraph, type Graph, type Op } from "../graph";
import { PROBLEMS } from "../interview/problems";
import { mergeFindings, ruleFindings, type Finding } from "./rules";

function apply(graph: Graph, ops: Op[]): Graph {
  const r = applyBatch(graph, ops);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join("; "));
  return r.graph;
}

const ids = (findings: Finding[]) => findings.map((f) => f.id);
const threeTier = buildTemplate("three-tier");

describe("ruleFindings (FR-054, docs/34 Step 5)", () => {
  it("three-tier: Redis is a SPOF (high) and Postgres is saturated (high), each with a fix", () => {
    const findings = ruleFindings(threeTier);
    expect(ids(findings)).toEqual(expect.arrayContaining(["rule:spof:redis", "rule:hot:pg"]));
    const spof = findings.find((f) => f.id === "rule:spof:redis")!;
    expect(spof.severity).toBe("high");
    expect(spof.detail).toMatch(/96\.3% to 54\.\d%/);
    expect(spof.fix?.ops).toEqual([{ type: "replicate", id: "redis", replicas: 2 }]);
    const hot = findings.find((f) => f.id === "rule:hot:pg")!;
    expect(hot.severity).toBe("high");
    expect(hot.fix?.summary).toMatch(/^Shard Postgres \(primary\) into \d+$/);
  });

  it("every rule fix applies cleanly and removes its own finding (templates and a naive design)", () => {
    const naive = apply(emptyGraph(), [
      { type: "addNode", id: "client", kind: "client", label: "Users" },
      { type: "addNode", id: "api", kind: "service", label: "API" },
      { type: "addNode", id: "db", kind: "sql", label: "DB" },
      { type: "connect", from: "client", to: "api" },
      { type: "connect", from: "api", to: "db" },
      { type: "setWorkload", rps: 5_000, readRatio: 0.9 },
    ]);
    const boards = [threeTier, buildTemplate("url-shortener"), buildTemplate("chat"), naive];
    let fixes = 0;
    for (const board of boards) {
      for (const finding of ruleFindings(board)) {
        if (!finding.fix) continue;
        fixes += 1;
        const after = apply(board, finding.fix.ops);
        expect(ids(ruleFindings(after)), `${finding.id}: ${finding.fix.summary}`).not.toContain(
          finding.id,
        );
      }
    }
    expect(fixes).toBeGreaterThanOrEqual(6);
  });

  it("SQL without failover: the fix adds a replica and turns on failover", () => {
    const g = apply(emptyGraph(), [
      { type: "addNode", id: "client", kind: "client", label: "Users" },
      { type: "addNode", id: "api", kind: "service", label: "API", props: { replicas: 4 } },
      { type: "addNode", id: "db", kind: "sql", label: "DB" },
      { type: "connect", from: "client", to: "api" },
      { type: "connect", from: "api", to: "db" },
      { type: "setWorkload", rps: 1_000, readRatio: 0.5 },
    ]);
    const spof = ruleFindings(g).find((f) => f.id === "rule:spof:db")!;
    expect(spof.fix?.summary).toBe("Add a replica of DB with failover");
    expect(spof.fix?.ops.map((o) => o.type)).toEqual(["addNode", "connect", "updateNode"]);
  });

  it("read-heavy service with a database and no cache gets a low-severity cache finding", () => {
    const g = apply(emptyGraph(), [
      { type: "addNode", id: "client", kind: "client", label: "Users" },
      { type: "addNode", id: "api", kind: "service", label: "API", props: { replicas: 4 } },
      { type: "addNode", id: "db", kind: "sql", label: "DB", props: { failover: true } },
      { type: "addNode", id: "db-r", kind: "sql", label: "DB replica", props: { role: "replica" } },
      { type: "connect", from: "client", to: "api" },
      { type: "connect", from: "api", to: "db" },
      { type: "connect", from: "db", to: "db-r", kind: "replication", traffic: "write" },
      { type: "setWorkload", rps: 1_000, readRatio: 0.9 },
    ]);
    const cache = ruleFindings(g).find((f) => f.id === "rule:cache:api")!;
    expect(cache.severity).toBe("low");
    expect(cache.nodeIds).toEqual(["api", "db"]);
  });

  it("over budget only with requirements, naming the most expensive component, with no fix", () => {
    expect(ids(ruleFindings(threeTier))).not.toContain("rule:cost");
    const cost = ruleFindings(threeTier, PROBLEMS["url-shortener"].requirements).find(
      (f) => f.id === "rule:cost",
    )!;
    expect(cost.fix).toBeNull();
    expect(cost.detail).toMatch(
      /^\$3,460\/mo against a \$2,500\/mo budget; .+ is the largest line/,
    );
  });

  it("an empty board has no findings", () => {
    expect(ruleFindings(emptyGraph())).toEqual([]);
  });
});

describe("mergeFindings", () => {
  const f = (
    id: string,
    severity: Finding["severity"],
    nodeIds: string[],
    source: Finding["source"],
  ): Finding => ({
    id,
    severity,
    nodeIds,
    title: id,
    detail: "",
    fix: null,
    source,
  });

  it("rules win on the same nodes; sorted high → low, rules first within a severity; capped at 6", () => {
    const rules = [f("r-low", "low", ["a"], "rule"), f("r-high", "high", ["b"], "rule")];
    const ai = [
      f("ai-dup", "high", ["b"], "ai"),
      f("ai-med", "medium", ["c"], "ai"),
      f("ai-high", "high", ["d"], "ai"),
    ];
    expect(ids(mergeFindings(rules, ai))).toEqual(["r-high", "ai-high", "ai-med", "r-low"]);
    const many = Array.from({ length: 9 }, (_, i) => f(`ai-${i}`, "low", [`n${i}`], "ai"));
    expect(mergeFindings([], many)).toHaveLength(6);
  });
});
