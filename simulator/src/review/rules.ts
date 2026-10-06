import { applyBatch, effectiveProps, uniqueId, type ArchNode, type Graph, type Op } from "../graph";
import { int, pct } from "../sim/format";
import { simulate } from "../sim/simulate";
import { spofScan } from "../sim/spof";
import type { SimResult } from "../sim/types";
import type { Requirements } from "../interview/types";

/**
 * Rule-based design review (FR-054, docs/34 Step 5). Deterministic findings from the simulator:
 * SPOFs, saturated or hot components, read-heavy paths with no cache, and budget overruns.
 * Every fix is found by simulation: the smallest change that actually clears the finding,
 * so "Apply fix" never applies a guess. Review works with the AI down.
 */

export type Severity = "high" | "medium" | "low";

export interface Finding {
  /** Stable id, e.g. "rule:spof:redis". */
  id: string;
  severity: Severity;
  nodeIds: string[];
  title: string;
  detail: string;
  fix: { summary: string; ops: Op[] } | null;
  source: "rule" | "ai";
}

export const MAX_FINDINGS = 6;
const HOT_RHO = 0.9;
const TARGET_RHO = 0.7;
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function apply(graph: Graph, ops: Op[]): Graph | null {
  const result = applyBatch(graph, ops);
  return result.ok ? result.graph : null;
}

/** Smallest replica count (current+1 … 1000) for which `ok` holds, by doubling then bisecting. */
function searchReplicas(node: ArchNode, ok: (replicas: number) => boolean): number | null {
  let lo = node.props.replicas;
  let hi = lo + 1;
  while (!ok(hi)) {
    lo = hi;
    if (hi >= 1000) return null;
    hi = Math.min(1000, hi * 2);
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function isSpof(graph: Graph, id: string): boolean {
  return spofScan(graph).spofs.some((s) => s.id === id);
}

/** A fix that makes `node` survive losing one instance. */
function spofFix(graph: Graph, node: ArchNode): Finding["fix"] {
  if (node.kind === "sql" && node.props.role !== "replica" && !node.props.failover) {
    const hasReplica = graph.edges.some((e) => e.from === node.id && e.kind === "replication");
    const replicaId = uniqueId(`${node.id}-replica`, new Set(graph.nodes.map((n) => n.id)));
    const ops: Op[] = hasReplica
      ? [{ type: "updateNode", id: node.id, props: { failover: true } }]
      : [
          {
            type: "addNode",
            id: replicaId,
            kind: "sql",
            label: `${node.label} replica`.slice(0, 60),
            props: { role: "replica" },
          },
          { type: "connect", from: node.id, to: replicaId, kind: "replication", traffic: "write" },
          { type: "updateNode", id: node.id, props: { failover: true } },
        ];
    const next = apply(graph, ops);
    if (next && !isSpof(next, node.id)) {
      return {
        summary: hasReplica
          ? `Turn on failover for ${node.label}`
          : `Add a replica of ${node.label} with failover`,
        ops,
      };
    }
  }
  const replicas = searchReplicas(node, (r) => {
    const next = apply(graph, [{ type: "replicate", id: node.id, replicas: r }]);
    return !!next && !isSpof(next, node.id);
  });
  if (replicas === null) return null;
  return {
    summary: `Run ${replicas} instances of ${node.label}`,
    ops: [{ type: "replicate", id: node.id, replicas }],
  };
}

/** A fix that brings `node` below ρ 0.7: more shards for a write-bound SQL primary, else replicas. */
function hotFix(graph: Graph, node: ArchNode): Finding["fix"] {
  const rhoOf = (g: Graph) => simulate(g).nodes[node.id]?.rho ?? Infinity;
  if (node.kind === "sql" && node.props.role !== "replica") {
    for (let shards = (node.props.shards ?? 1) + 1; shards <= 256; shards *= 2) {
      const ops: Op[] = [{ type: "updateNode", id: node.id, props: { shards } }];
      const next = apply(graph, ops);
      if (next && rhoOf(next) < TARGET_RHO)
        return { summary: `Shard ${node.label} into ${shards}`, ops };
    }
    return null;
  }
  const replicas = searchReplicas(node, (r) => {
    const next = apply(graph, [{ type: "replicate", id: node.id, replicas: r }]);
    return !!next && rhoOf(next) < TARGET_RHO;
  });
  if (replicas === null) return null;
  return {
    summary: `Scale ${node.label} to ${replicas} replicas`,
    ops: [{ type: "replicate", id: node.id, replicas }],
  };
}

export function ruleFindings(
  graph: Graph,
  requirements?: Requirements,
  sim: SimResult = simulate(graph),
): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const label = (id: string) => byId.get(id)?.label ?? id;

  const scan = spofScan(graph);
  for (const spof of scan.spofs) {
    const node = byId.get(spof.id)!;
    const share = scan.baseline > 0 ? spof.drop / scan.baseline : 1;
    findings.push({
      id: `rule:spof:${node.id}`,
      severity: share >= 0.2 ? "high" : "medium",
      nodeIds: [node.id],
      title: `${node.label} is a single point of failure`,
      detail: `Losing one instance drops success from ${pct(scan.baseline)}% to ${pct(spof.successRate)}%.`,
      fix: spofFix(graph, node),
      source: "rule",
    });
  }

  for (const node of graph.nodes) {
    const m = sim.nodes[node.id];
    if (!m || node.kind === "client" || node.status === "down" || m.rho < HOT_RHO) continue;
    findings.push({
      id: `rule:hot:${node.id}`,
      severity: m.rho >= 1 ? "high" : "medium",
      nodeIds: [node.id],
      title: m.rho >= 1 ? `${node.label} is saturated` : `${node.label} is running hot`,
      detail: `${m.explanation}`,
      fix: hotFix(graph, node),
      source: "rule",
    });
  }

  if (graph.workload.readRatio >= 0.8) {
    for (const node of graph.nodes) {
      if (node.kind !== "service" || node.status === "down") continue;
      const deps = graph.edges.filter((e) => e.from === node.id).map((e) => byId.get(e.to)!);
      const store = deps.find((d) => d.kind === "sql" || d.kind === "nosql");
      if (!store || deps.some((d) => d.kind === "cache")) continue;
      const cacheId = uniqueId(`${node.id}-cache`, new Set(graph.nodes.map((n) => n.id)));
      const ops: Op[] = [
        {
          type: "addNode",
          id: cacheId,
          kind: "cache",
          label: "Cache",
          props: { replicas: 2, hitRate: 0.9 },
        },
        { type: "connect", from: node.id, to: cacheId, traffic: "read" },
      ];
      findings.push({
        id: `rule:cache:${node.id}`,
        severity: "low",
        nodeIds: [node.id, store.id],
        title: `Reads from ${node.label} go straight to ${store.label}`,
        detail: `${Math.round(graph.workload.readRatio * 100)}% of traffic is reads, and none of it is cached.`,
        fix: apply(graph, ops) ? { summary: `Add a cache in front of ${store.label}`, ops } : null,
        source: "rule",
      });
    }
  }

  if (requirements && sim.costMonthly > requirements.monthlyBudget) {
    const top = [...graph.nodes]
      .map((n) => {
        const p = effectiveProps(n);
        return { id: n.id, cost: p.replicas * p.shards * p.costPerReplica };
      })
      .sort((a, b) => b.cost - a.cost)[0];
    findings.push({
      id: "rule:cost",
      severity: "low",
      nodeIds: top ? [top.id] : [],
      title: "Over budget",
      detail: `$${int(sim.costMonthly)}/mo against a $${int(requirements.monthlyBudget)}/mo budget${top ? `; ${label(top.id)} is the largest line at $${int(top.cost)}/mo` : ""}.`,
      fix: null,
      source: "rule",
    });
  }

  return findings;
}

/** Merge AI findings into rule findings: rules win on the same nodes; sort by severity; cap. */
export function mergeFindings(rules: Finding[], ai: Finding[]): Finding[] {
  const covered = new Set(rules.map((f) => [...f.nodeIds].sort().join(",")));
  const extra = ai.filter((f) => !covered.has([...f.nodeIds].sort().join(",")));
  return [...rules, ...extra]
    .map((f, i) => ({ f, i }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] ||
        (a.f.source === b.f.source ? a.i - b.i : a.f.source === "rule" ? -1 : 1),
    )
    .slice(0, MAX_FINDINGS)
    .map(({ f }) => f);
}
