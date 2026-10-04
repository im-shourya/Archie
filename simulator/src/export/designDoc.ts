import { CATALOG, type Graph } from "../graph";
import { ruleFindings, type Finding } from "../review";
import { simulate, spofScan, type Percentiles, type SimResult } from "../sim";
import { int, pct, rho } from "../sim/format";
import { toMermaid } from "./mermaid";

/**
 * A Markdown design doc (FR-043, F-12): workload, simulated results, the bottleneck explained,
 * components, single points of failure, review findings with their fixes, and the diagram.
 * Every number comes from the simulator; nothing is written by a model.
 */

export interface DesignDocInput {
  name: string;
  graph: Graph;
  /** YYYY-MM-DD, passed in so the output is deterministic. */
  date: string;
  sim?: SimResult;
  findings?: readonly Finding[];
}

export function escapeMd(s: string): string {
  return s.replace(/[\\|*_`[\]<>]/g, (c) => `\\${c}`).replace(/\s+/g, " ").trim();
}

const SEVERITY = { high: "High", medium: "Medium", low: "Low" } as const;

function latency(p: Percentiles): string {
  const ms = (v: number | null) => (v === null ? "unbounded" : `${int(v)} ms`);
  return `${ms(p.p50)} / ${ms(p.p95)} / ${ms(p.p99)}`;
}

export function toDesignDoc({ name, graph, date, sim: given, findings: givenFindings }: DesignDocInput): string {
  const out: string[] = [
    `# ${escapeMd(name) || "Untitled board"}`,
    "",
    `_Exported from Archie on ${date}. Numbers come from Archie's simulator (M/M/1 queues per replica, steady state), not from a benchmark._`,
    "",
  ];
  if (graph.nodes.length === 0) {
    out.push("No components yet.", "");
    return out.join("\n");
  }

  const sim = given ?? simulate(graph);
  const scan = spofScan(graph);
  const findings = givenFindings ?? ruleFindings(graph, undefined, sim);
  const label = (id: string) => escapeMd(graph.nodes.find((n) => n.id === id)?.label ?? id);
  const w = graph.workload;

  out.push(
    "## Workload",
    "",
    `${int(w.rps)} requests/s${w.peakMultiplier > 1 ? ` (×${w.peakMultiplier} at peak)` : ""}, ${pct(w.readRatio)}% reads.`,
    "",
    "## Results",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Success rate | ${pct(sim.e2e.successRate)}% |`,
    `| Read latency p50 / p95 / p99 | ${latency(sim.e2e.read)} |`,
    `| Write latency p50 / p95 / p99 | ${latency(sim.e2e.write)} |`,
    `| Throughput | ${int(sim.e2e.throughput)} requests/s |`,
    `| Estimated cost | $${int(sim.costMonthly)} / month |`,
    "",
  );

  if (sim.bottleneck) {
    out.push("## Bottleneck", "", `**${label(sim.bottleneck.id)}** at ρ ${rho(sim.bottleneck.rho)}. ${escapeMd(sim.bottleneck.explanation)}`, "");
  }

  out.push("## Components", "", "| Component | Kind | Instances | Load (ρ) | Status |", "|-----------|------|-----------|----------|--------|");
  for (const n of graph.nodes) {
    const m = sim.nodes[n.id];
    const shards = n.props.shards && n.props.shards > 1 ? ` × ${n.props.shards} shards` : "";
    const status = n.status === "down" ? "down (failed)" : (m?.status ?? "–");
    out.push(`| ${escapeMd(n.label)} | ${CATALOG[n.kind].displayName} | ${n.props.replicas}${shards} | ${m ? rho(m.rho) : "–"} | ${status} |`);
  }
  out.push("");

  out.push("## Single points of failure", "");
  if (scan.spofs.length === 0) out.push("None: losing any one instance costs less than 5% of successful requests.");
  for (const s of scan.spofs) {
    out.push(`- ${label(s.id)}: success falls from ${pct(scan.baseline)}% to ${pct(s.successRate)}% if one instance is lost.`);
  }
  out.push("");

  out.push("## Review findings", "");
  if (findings.length === 0) out.push("No findings.");
  for (const f of findings) {
    const fix = f.fix ? ` Fix: ${escapeMd(f.fix.summary)}` : "";
    out.push(`- **${SEVERITY[f.severity]}** · ${escapeMd(f.title)}. ${escapeMd(f.detail)}${fix}`);
  }
  out.push("", "## Diagram", "", "```mermaid\n" + toMermaid(graph) + "```", "");
  return out.join("\n");
}
