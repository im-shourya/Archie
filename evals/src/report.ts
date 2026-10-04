import { z } from "zod";

/**
 * The /evals page's data (FR-061): the committed result files, validated and reduced to what the
 * page shows. Pure; the page imports the JSON at build time, so it can only show what the repo
 * holds. A malformed file throws, which fails the build instead of rendering a wrong number.
 */

const Stats = z.object({
  n: z.number().int().nonnegative(),
  p50: z.number(),
  p70: z.number(),
  p95: z.number(),
  p99: z.number(),
  p100: z.number(),
  mean: z.number(),
});
export type Stats = z.infer<typeof Stats>;

const Kind = z.enum(["ops", "clarify", "confirm", "answer", "noop"]);

const RunResult = z.object({
  createdAt: z.string(),
  commit: z.string(),
  split: z.enum(["dev", "test", "all"]),
  model: z.string(),
  effort: z.string(),
  promptHash: z.string(),
  target: z.enum(["local", "deployed"]).optional(),
  environment: z.object({ cpu: z.string().optional(), node: z.string().optional(), region: z.string().optional() }),
  metrics: z.object({
    taskAccuracy: z.number(),
    kindAccuracy: z.number(),
    falseActionRate: z.number(),
    overClarifyRate: z.number(),
    fastPathPrecision: z.number(),
    fastPathCoverage: z.number(),
    repairRate: z.number(),
    answerGroundedness: z.number().optional(),
  }),
  byCategory: z.record(z.string(), z.object({ n: z.number().int(), pass: z.number().int() })),
  latency: z.object({ fastpath: Stats.optional(), aiWarm: Stats.optional(), aiCold: Stats.optional() }),
  cases: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      expectedKind: Kind,
      actualKind: Kind,
      tier: z.enum(["fastpath", "ai"]),
      pass: z.boolean(),
      failedAssertions: z.array(z.string()).optional(),
      model: z.string().optional(),
    }),
  ),
});
export type RunResult = z.infer<typeof RunResult>;

const Bench = z.object({ createdAt: z.string(), commit: z.string(), environment: z.object({ cpu: z.string() }) });
const FastBench = Bench.extend({ overall: Stats });
const SimBench = Bench.extend({
  bySize: z.record(z.string(), Stats),
  spofScan: z.object({ bySize: z.record(z.string(), Stats) }).optional(),
});

export interface ReportInput {
  test: unknown;
  /** An earlier final run of the test split, kept so every held-out run is published. */
  earlierTest?: unknown;
  dev?: unknown;
  b0?: unknown;
  deployed?: unknown;
  benchFast: unknown;
  benchSim: unknown;
}

export interface RunMeta {
  label: string;
  cases: number;
  taskAccuracy: number;
  falseActionRate: number;
  date: string;
  commit: string;
  model: string;
  promptHash: string;
}

export interface CategoryRow {
  category: string;
  dev?: { n: number; pass: number };
  test?: { n: number; pass: number };
}

export interface LatencyRow {
  tier: string;
  source: string;
  stats: Stats;
  unit: "ms";
}

export interface Miss {
  id: string;
  split: "dev" | "test";
  expected: string;
  actual: string;
  reason: string;
}

/** Cases that got no answer at all (every provider timed out or failed) vs answered ones. */
export interface Availability {
  cases: number;
  noAnswer: number;
  answered: number;
  correct: number;
}

function availability(r: RunResult): Availability {
  const noAnswer = r.cases.filter((c) => c.failedAssertions?.[0]?.startsWith("error:")).length;
  return { cases: r.cases.length, noAnswer, answered: r.cases.length - noAnswer, correct: r.cases.filter((c) => c.pass).length };
}

export interface Report {
  headline: { taskAccuracy: number; kindAccuracy: number; falseActionRate: number; overClarifyRate: number; cases: number };
  dev?: RunResult["metrics"] & { cases: number };
  fastPath: { precision: number; coverage: number; cases: number } | null;
  availability: { test: Availability; dev?: Availability };
  categories: CategoryRow[];
  latency: LatencyRow[];
  misses: Miss[];
  runs: RunMeta[];
}

function parse<T>(schema: z.ZodType<T>, data: unknown, name: string): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(`evals report: ${name} is malformed at ${issue?.path.join(".") || "(root)"}: ${issue?.message}`);
  }
  return r.data;
}

const meta = (label: string, r: RunResult): RunMeta => ({
  label,
  cases: r.cases.length,
  taskAccuracy: r.metrics.taskAccuracy,
  falseActionRate: r.metrics.falseActionRate,
  date: r.createdAt.slice(0, 10),
  commit: r.commit,
  model: r.model,
  promptHash: r.promptHash,
});

function misses(r: RunResult | undefined, split: "dev" | "test"): Miss[] {
  return (r?.cases ?? [])
    .filter((c) => !c.pass)
    .map((c) => ({
      id: c.id,
      split,
      expected: c.expectedKind,
      actual: c.actualKind,
      reason: c.failedAssertions?.[0]?.startsWith("error:")
        ? `no answer from any provider (${c.failedAssertions[0].slice(7)})`
        : c.actualKind !== c.expectedKind
          ? `answered with ${c.actualKind}`
          : (c.failedAssertions?.[0] ?? "assertion failed"),
    }));
}

export function buildReport(input: ReportInput): Report {
  const test = parse(RunResult, input.test, "latest.json");
  if (test.split !== "test") throw new Error(`evals report: latest.json must be a test-split run (got ${test.split})`);
  const dev = input.dev === undefined ? undefined : parse(RunResult, input.dev, "dev run");
  const earlier = input.earlierTest === undefined ? undefined : parse(RunResult, input.earlierTest, "earlier test run");
  const b0 = input.b0 === undefined ? undefined : parse(RunResult, input.b0, "b0-fastpath.json");
  const deployed = input.deployed === undefined ? undefined : parse(RunResult, input.deployed, "deployed.json");
  const fast = parse(FastBench, input.benchFast, "bench-fastpath.json");
  const sim = parse(SimBench, input.benchSim, "bench-simulator.json");

  const categories = new Set([...Object.keys(dev?.byCategory ?? {}), ...Object.keys(test.byCategory)]);
  const latency: LatencyRow[] = [
    { tier: "Fast path (parse + apply)", source: `bench, ${fast.environment.cpu}`, stats: fast.overall, unit: "ms" },
  ];
  const sim100 = sim.bySize["100"];
  if (sim100) latency.push({ tier: "Simulator, 100 components", source: `bench, ${sim.environment.cpu}`, stats: sim100, unit: "ms" });
  const spof100 = sim.spofScan?.bySize["100"];
  if (spof100) latency.push({ tier: "SPOF scan, 100 components", source: `bench, ${sim.environment.cpu}`, stats: spof100, unit: "ms" });
  for (const [label, run] of [["test split", test], ["dev split", dev]] as const) {
    if (run?.latency.aiWarm) latency.push({ tier: "AI command (warm)", source: `${label}, local`, stats: run.latency.aiWarm, unit: "ms" });
    if (run?.latency.aiCold) latency.push({ tier: "AI command (cold)", source: `${label}, local`, stats: run.latency.aiCold, unit: "ms" });
  }
  if (deployed?.latency.aiWarm) {
    latency.push({ tier: "AI command (warm)", source: `deployed${deployed.environment.region ? `, ${deployed.environment.region}` : ""}`, stats: deployed.latency.aiWarm, unit: "ms" });
  }

  return {
    headline: { ...test.metrics, cases: test.cases.length },
    ...(dev ? { dev: { ...dev.metrics, cases: dev.cases.length } } : {}),
    availability: { test: availability(test), ...(dev ? { dev: availability(dev) } : {}) },
    fastPath: b0 ? { precision: b0.metrics.fastPathPrecision, coverage: b0.metrics.fastPathCoverage, cases: b0.cases.length } : null,
    categories: [...categories].sort().map((category) => ({
      category,
      ...(dev?.byCategory[category] ? { dev: dev.byCategory[category] } : {}),
      ...(test.byCategory[category] ? { test: test.byCategory[category] } : {}),
    })),
    latency,
    misses: [...misses(test, "test"), ...misses(dev, "dev")],
    runs: [
      meta("Test split (held out)", test),
      ...(earlier ? [meta("Test split, earlier run", earlier)] : []),
      ...(dev ? [meta("Dev split", dev)] : []),
      ...(b0 ? [meta("Fast path only (B0)", b0)] : []),
      ...(deployed ? [meta("Deployed", deployed)] : []),
    ],
  };
}
