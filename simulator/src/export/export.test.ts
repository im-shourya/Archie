import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, CATALOG, emptyGraph, simulate, spofScan, TEMPLATES, type Graph, type TemplateId } from "../index";
import { toDesignDoc, toMermaid, toSvg } from "./index";

const threeTier = buildTemplate("three-tier");
function apply(g: Graph, ops: unknown[]): Graph {
  const r = applyBatch(g, ops);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.graph;
}

describe("toMermaid", () => {
  it.each(Object.keys(TEMPLATES) as TemplateId[])("%s matches its snapshot", (id) => {
    expect(toMermaid(buildTemplate(id))).toMatchSnapshot();
  });

  it("declares every node once and every edge once, with safe ids", () => {
    const out = toMermaid(threeTier);
    expect(out.startsWith("flowchart LR\n")).toBe(true);
    for (const n of threeTier.nodes) expect(out).toContain(`n_${n.id.replace(/-/g, "_")}`);
    const arrows = out.split("\n").filter((l) => /-->|-\.->|==>/.test(l));
    expect(arrows).toHaveLength(threeTier.edges.length);
    expect(out).not.toMatch(/\bn_[a-z0-9_]*-/); // no hyphens left in ids
  });

  it("escapes labels so they can't break out of the node text", () => {
    const g = apply(threeTier, [{ type: "updateNode", id: "api", label: 'API "]<script>' }]);
    const out = toMermaid(g);
    expect(out).not.toContain("<script>");
    expect(out).not.toContain('"]<');
    expect(out).toContain("#quot;");
    expect(out).toContain("#lt;script#gt;");
  });

  it("marks failed components", () => {
    const out = toMermaid(apply(threeTier, [{ type: "fail", id: "redis" }]));
    expect(out).toContain("classDef down");
    expect(out).toMatch(/class n_redis down/);
  });

  it("draws an empty board as a valid diagram", () => {
    expect(toMermaid(emptyGraph())).toBe("flowchart LR\n");
  });
});

describe("toDesignDoc", () => {
  const date = "2026-10-04";

  it("takes every number from the simulator", () => {
    const sim = simulate(threeTier);
    const doc = toDesignDoc({ name: "Checkout", graph: threeTier, date });
    expect(doc).toContain("# Checkout");
    expect(doc).toContain("50,000 requests/s");
    expect(doc).toContain(`${Math.round(sim.e2e.successRate * 1000) / 10}%`);
    expect(doc).toContain(sim.bottleneck!.explanation);
    expect(doc).toContain(sim.nodes.pg!.rho.toFixed(2));
    expect(doc).toContain(`$${Math.round(sim.costMonthly).toLocaleString("en-US")}`);
  });

  it("names each component's kind and instances", () => {
    const doc = toDesignDoc({ name: "x", graph: threeTier, date });
    expect(doc).toContain(`| Postgres (primary) | ${CATALOG.sql.displayName} | 1 | 1.40 | saturated |`);
    expect(doc).toContain(`| API | ${CATALOG.service.displayName} | 30 |`);
    expect(doc).not.toContain("undefined");
  });

  it("lists the single points of failure and the review findings with their fixes", () => {
    const doc = toDesignDoc({ name: "x", graph: threeTier, date });
    const scan = spofScan(threeTier);
    expect(scan.spofs.length).toBeGreaterThan(0);
    for (const s of scan.spofs) expect(doc).toContain(threeTier.nodes.find((n) => n.id === s.id)!.label);
    expect(doc).toMatch(/## Review findings\n\n- \*\*(High|Medium|Low)\*\*/);
    expect(doc).toContain("Fix:");
  });

  it("embeds the Mermaid diagram", () => {
    expect(toDesignDoc({ name: "x", graph: threeTier, date })).toContain("```mermaid\n" + toMermaid(threeTier) + "```");
  });

  it("escapes Markdown in labels and the name", () => {
    const g = apply(threeTier, [{ type: "updateNode", id: "api", label: "A|B *c* [d](e)" }]);
    const doc = toDesignDoc({ name: "My | board", graph: g, date });
    expect(doc).toContain("# My \\| board");
    expect(doc).toContain("A\\|B \\*c\\* \\[d\\](e)");
  });

  it("says so when there is nothing to simulate", () => {
    const doc = toDesignDoc({ name: "Empty", graph: emptyGraph(), date });
    expect(doc).toContain("No components yet");
    expect(doc).not.toContain("## Bottleneck");
  });
});

describe("toSvg", () => {
  const layout = Object.fromEntries(threeTier.nodes.map((n, i) => [n.id, { x: i * 220, y: (i % 2) * 120, width: 180, height: 68 }]));

  it("draws every node and edge, sized to the layout", () => {
    const svg = toSvg(threeTier, layout, simulate(threeTier), "Three-tier");
    expect(svg.match(/<g data-node=/g)).toHaveLength(threeTier.nodes.length);
    expect(svg.match(/<line /g)).toHaveLength(threeTier.edges.length);
    for (const n of threeTier.nodes) expect(svg).toContain(`>${n.label}<`);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+/);
    expect(svg).toContain("ρ 1.40 · saturated");
  });

  it("escapes labels and the title", () => {
    const g = apply(threeTier, [{ type: "updateNode", id: "api", label: `<script>alert("x")</script>&` }]);
    const svg = toSvg(g, layout, simulate(g), `Board "<b>"`);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;");
    expect(svg).toContain("<title>Board &quot;&lt;b&gt;&quot;</title>");
  });

  it("is well-formed XML (every tag closed)", () => {
    const svg = toSvg(threeTier, layout, simulate(threeTier), "t");
    const opened = (svg.match(/<(svg|g|defs|marker|text|title)\b/g) ?? []).length;
    const closed = (svg.match(/<\/(svg|g|defs|marker|text|title)>/g) ?? []).length;
    expect(opened).toBe(closed);
  });

  it("dashes failed nodes and async edges", () => {
    const g = apply(threeTier, [
      { type: "fail", id: "redis" },
      { type: "addNode", id: "q", kind: "queue", label: "Q" },
      { type: "connect", from: "api", to: "q", kind: "async", traffic: "write" },
    ]);
    const svg = toSvg(g, { ...layout, q: { x: 0, y: 300, width: 180, height: 68 } }, simulate(g), "t");
    expect(svg).toMatch(/data-node="redis">\n<rect [^>]*stroke-dasharray/);
    expect(svg).toContain(`stroke-dasharray="6 4"`);
  });
});
