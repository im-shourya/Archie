import type { Graph } from "../graph";
import { int, pct } from "../sim/format";
import { simulate } from "../sim/simulate";
import { spofScan } from "../sim/spof";
import type { Problem, SloCheck } from "./types";

/**
 * SLO checks (FR-051, docs/34 Step 2). Pure and deterministic: the simulator decides pass/fail,
 * never the LLM. Checks always run at the problem's peak workload, whatever the board's own
 * workload is, so lowering the load can't make a check pass.
 */

export const HEADROOM_RHO = 0.9;

const fmtMs = (v: number) => (v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`);
const fmtPct = (f: number) =>
  f >= 0.9999 && f < 1 ? `${(Math.floor(f * 100_000) / 1000).toFixed(3)}%` : `${pct(f)}%`;
const fmtAvailability = (f: number) => `${String(Math.round(f * 100_000) / 1000)}%`;
const usd = (n: number) => `$${int(n)}`;

/** The graph with the problem's peak workload applied. */
export function atPeak(graph: Graph, problem: Problem): Graph {
  const { peakRps, readRatio } = problem.requirements;
  return { ...graph, workload: { rps: peakRps, readRatio, peakMultiplier: 1 } };
}

export function sloChecks(graph: Graph, problem: Problem): SloCheck[] {
  const r = problem.requirements;
  const labels = {
    availability: `Success ≥ ${fmtAvailability(r.availability)} at peak`,
    "p99-read": `Read p99 ≤ ${fmtMs(r.p99Ms)}`,
    "p99-write": `Write p99 ≤ ${fmtMs(r.p99WriteMs)}`,
    headroom: `Every component below ρ ${HEADROOM_RHO}`,
    spof: "Survives any single failure",
    cost: `Under ${usd(r.monthlyBudget)}/mo`,
  } as const;
  const writes = r.readRatio < 1;

  const hasClients = graph.nodes.some((n) => n.kind === "client" && n.status === "up");
  if (!hasClients) {
    return (Object.keys(labels) as (keyof typeof labels)[]).map((id) => ({
      id,
      label: labels[id],
      pass: id === "p99-write" && !writes ? null : false,
      actual: id === "p99-write" && !writes ? "not applicable" : "no clients yet",
      nodeIds: [],
    }));
  }

  const peak = atPeak(graph, problem);
  const sim = simulate(peak);
  const scan = spofScan(peak);
  const label = (id: string) => peak.nodes.find((n) => n.id === id)?.label ?? id;

  let hottest: { id: string; rho: number } | null = null;
  for (const node of peak.nodes) {
    const m = sim.nodes[node.id];
    if (!m || node.kind === "client" || node.status === "down" || m.status === "idle") continue;
    if (!hottest || m.rho > hottest.rho) hottest = { id: node.id, rho: m.rho };
  }

  const readP99 = sim.e2e.read.p99;
  const writeP99 = sim.e2e.write.p99;
  const spofNames = scan.spofs.map((s) => label(s.id));

  return [
    {
      id: "availability",
      label: labels.availability,
      pass: sim.e2e.successRate >= r.availability,
      actual: fmtPct(sim.e2e.successRate),
      nodeIds: sim.bottleneck && sim.e2e.successRate < r.availability ? [sim.bottleneck.id] : [],
    },
    {
      id: "p99-read",
      label: labels["p99-read"],
      pass: readP99 !== null && readP99 <= r.p99Ms,
      actual: readP99 === null ? "no read traffic" : fmtMs(readP99),
      nodeIds: [],
    },
    writes
      ? {
          id: "p99-write",
          label: labels["p99-write"],
          pass: writeP99 !== null && writeP99 <= r.p99WriteMs,
          actual: writeP99 === null ? "no write traffic" : fmtMs(writeP99),
          nodeIds: [],
        }
      : {
          id: "p99-write",
          label: labels["p99-write"],
          pass: null,
          actual: "not applicable",
          nodeIds: [],
        },
    {
      id: "headroom",
      label: labels.headroom,
      pass: hottest !== null && hottest.rho < HEADROOM_RHO,
      actual: hottest
        ? `${label(hottest.id)} at ρ ${hottest.rho.toFixed(2)}`
        : "nothing carries load",
      nodeIds: hottest && hottest.rho >= HEADROOM_RHO ? [hottest.id] : [],
    },
    {
      id: "spof",
      label: labels.spof,
      // Nothing to protect yet: a board where no request succeeds can't "survive" anything.
      pass: scan.baseline > 0 && scan.spofs.length === 0,
      actual:
        scan.baseline === 0
          ? "no request succeeds yet"
          : scan.spofs.length === 0
            ? "no single points of failure"
            : `${spofNames.slice(0, 3).join(", ")}${spofNames.length > 3 ? ` +${spofNames.length - 3}` : ""} ${spofNames.length === 1 ? "is a SPOF" : "are SPOFs"}`,
      nodeIds: scan.spofs.map((s) => s.id),
    },
    {
      id: "cost",
      label: labels.cost,
      pass: sim.costMonthly <= r.monthlyBudget,
      actual: `${usd(sim.costMonthly)}/mo`,
      nodeIds: [],
    },
  ];
}
