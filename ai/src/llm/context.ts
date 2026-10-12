import type { ArchEdge, ArchNode, Graph, NodeMetrics, SimResult } from "@archie/simulator";

/**
 * The volatile half of the prompt (docs/12 · Compact graph DSL). Everything that changes per
 * request lives here, so the system prompt stays byte-stable and cacheable.
 *
 * Labels, history and the utterance are untrusted user text (docs/14 G-07): they're escaped so
 * they can't close or open a tag, and they're flattened to one line.
 */

export interface ContextInput {
  graph: Graph;
  sim?: SimResult | null;
  history?: readonly string[];
  /** Earlier chat turns, oldest first: what the user asked and what Archie answered. */
  conversation?: readonly { role: "user" | "assistant"; text: string }[];
  selection?: readonly string[];
  utterance: string;
}

/** Untrusted text → one line with no tag delimiters. */
export function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n\t\u2028\u2029]+/g, " ")
    .trim();
}

const pct = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function nodeSpec(node: ArchNode): string {
  const p = node.props;
  const parts: string[] = [node.kind];
  if (node.kind === "sql") parts.push(p.role ?? "primary");
  if (p.replicas !== 1) parts.push(`x${p.replicas}`);
  if (p.shards !== undefined && (node.kind !== "sql" || p.role !== "replica")) parts.push(`shards=${p.shards}`);
  if (p.hitRate !== undefined) parts.push(`hit=${p.hitRate}`);
  if (node.kind === "sql" && p.role !== "replica") parts.push(`failover=${p.failover ? "yes" : "no"}`);
  if (p.capacityRps !== undefined) parts.push(`cap=${p.capacityRps}`);
  if (p.readCapacity !== undefined) parts.push(`readCap=${p.readCapacity}`);
  if (p.writeCapacity !== undefined) parts.push(`writeCap=${p.writeCapacity}`);
  if (p.latencyMs !== undefined) parts.push(`lat=${p.latencyMs}ms`);
  return `[${parts.join(" ")}]`;
}

function loadNote(m: NodeMetrics | undefined): string {
  if (!m || m.status === "idle") return "";
  const status =
    m.status === "saturated" || m.status === "down"
      ? ` ${m.status.toUpperCase()}`
      : m.status === "healthy"
        ? ""
        : ` ${m.status}`;
  return `  ρ=${m.rho.toFixed(2)}${status}`;
}

function nodeLine(node: ArchNode, sim: SimResult | null | undefined): string {
  const down = node.status === "down" ? " DOWN" : "";
  // Clients generate load; they don't serve it, so their ρ is always 0 and only adds noise.
  const metrics = node.kind === "client" ? undefined : sim?.nodes[node.id];
  // A down node already says DOWN; don't repeat it from the sim.
  const load = down && metrics?.status === "down" ? "" : loadNote(metrics);
  return `  ${node.id} "${escapeText(node.label)}" ${nodeSpec(node)}${down}${load}`;
}

function edgeToken(edge: ArchEdge): string {
  const arrow = edge.kind === "replication" ? "=>" : edge.kind === "async" ? "~>" : "->";
  const tags: string[] = [];
  if (edge.kind === "replication") tags.push("repl");
  else if (edge.traffic !== "all") tags.push(edge.traffic);
  if (edge.weight !== undefined) tags.push(`w=${edge.weight}`);
  return `${edge.from}${arrow}${edge.to}${tags.length ? `(${tags.join(",")})` : ""}`;
}

/** Edges wrapped to keep lines short; 8 per line. */
function edgeLines(edges: readonly ArchEdge[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < edges.length; i += 8) {
    lines.push(`  ${edges.slice(i, i + 8).map(edgeToken).join("  ")}`);
  }
  return lines;
}

export function graphDsl(graph: Graph, sim?: SimResult | null): string {
  const w = graph.workload;
  const lines = [
    `workload: ${fmt(w.rps)} rps, ${pct(w.readRatio)} reads, peak x${w.peakMultiplier}`,
    graph.nodes.length ? "nodes:" : "nodes: (empty board)",
    ...graph.nodes.map((n) => nodeLine(n, sim)),
  ];
  if (graph.edges.length) lines.push("edges:", ...edgeLines(graph.edges));
  return lines.join("\n");
}

function p99(value: number | null): string {
  return value === null ? "n/a" : `${fmt(value)} ms`;
}

/** One-line sim summary: success, bottleneck, top-3 ρ, e2e p99, cost, warnings (docs/12). */
export function simSummary(sim: SimResult): string {
  const parts = [`success ${pct(sim.e2e.successRate)}`];
  if (sim.bottleneck) parts.push(`bottleneck ${sim.bottleneck.id} ρ=${sim.bottleneck.rho.toFixed(2)}`);
  const top = Object.entries(sim.nodes)
    .filter(([, m]) => m.status !== "idle" && m.status !== "down")
    .sort(([, a], [, b]) => b.rho - a.rho)
    .slice(0, 3)
    .map(([id, m]) => `${id} ${m.rho.toFixed(2)}`);
  if (top.length) parts.push(`top ρ: ${top.join(", ")}`);
  parts.push(`read p99 ${p99(sim.e2e.read.p99)}`, `write p99 ${p99(sim.e2e.write.p99)}`);
  parts.push(`throughput ${fmt(sim.e2e.throughput)} rps`, `cost $${fmt(sim.costMonthly)}/mo`);
  const warnings = sim.warnings.slice(0, 3).map(escapeText);
  return [parts.join(" · "), ...warnings.map((w) => `warning: ${w}`)].join("\n");
}

/** The full user message for /api/command (docs/32 Step 1). Deterministic for a given input. */
export function buildUserMessage({ graph, sim, history, conversation, selection, utterance }: ContextInput): string {
  const sections = [`<graph>\n${graphDsl(graph, sim)}\n</graph>`];
  if (sim && graph.nodes.length > 0) sections.push(`<sim>${simSummary(sim)}</sim>`);
  if (history?.length) sections.push(`<history>${history.slice(-5).map(escapeText).join(" | ")}</history>`);
  if (conversation?.length) {
    const lines = conversation.slice(-10).map((t) => `${t.role === "user" ? "user" : "archie"}: ${escapeText(t.text)}`);
    sections.push(`<conversation>\n${lines.join("\n")}\n</conversation>`);
  }
  if (selection?.length) sections.push(`<selection>${selection.join(" ")}</selection>`);
  sections.push(`<utterance>${escapeText(utterance)}</utterance>`);
  return sections.join("\n");
}
