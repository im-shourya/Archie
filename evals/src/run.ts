/**
 * npm run eval -- [--split dev|test|all] [--fastpath-only] [--only <id,id>] [--out <file>]
 *
 * Runs the full production path for each case (docs/22 · Pipeline under test):
 *   fixture + utterance → fast path → (null) → harness (real model) → guardrails → applyBatch → assertions
 * and writes a RunResult validated against specs/evaluation-schema.json.
 *
 * B0 = --fastpath-only (no AI). B1 = default config: Gemini (free tier) with Groq as fallback
 * (ADR-016, ADR-017). Keys are read from .env.local if present. Cases run sequentially so latency
 * numbers aren't skewed by concurrency, and the runner waits for the primary's per-minute quota
 * before each case so results come from one model where possible (fallbacks on real outages are
 * still recorded, per case and in `model`).
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import Ajv2020 from "ajv/dist/2020";
import { parseCommand } from "@archie/ai/fastpath";
import {
  buildUserMessage,
  COMMAND_SYSTEM_PROMPT,
  estimateTokens,
  fallbackName,
  getProvider,
  HarnessError,
  isConfigured,
  keyEnv,
  primaryWaitMs,
  providerName,
  quotaStatus,
  runCommand,
} from "@archie/ai/llm";
import { applyBatch, simulate, type Graph } from "@archie/simulator";
import { checkAll, grounded, type Outcome } from "./assertions";
import { loadCases, loadFixtures, type EvalCase, type Split } from "./cases";
import { byCategory, computeMetrics, latency, type CaseResult } from "./metrics";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const split = (flag("split") ?? "dev") as Split;
const fastpathOnly = args.includes("--fastpath-only");
const only = flag("only")?.split(",");
const out = flag("out") ?? (fastpathOnly ? "evals/results/b0-fastpath.json" : "evals/results/latest.json");

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!fastpathOnly && !isConfigured()) {
  console.error(`${keyEnv()} is not set (env or .env.local). Use --fastpath-only for the B0 baseline.`);
  process.exit(1);
}

const fixtures = loadFixtures();
const cases = loadCases(split).filter((c) => !only || only.includes(c.id));

function fixture(c: EvalCase): Graph {
  const g = fixtures[c.fixture];
  if (!g) throw new Error(`${c.id}: unknown fixture "${c.fixture}"`);
  return g;
}

async function runCase(c: EvalCase): Promise<CaseResult> {
  const before = fixture(c);
  const expectedKind = c.expect.kind;
  const base = { id: c.id, category: c.category, expectedKind };
  const t0 = performance.now();

  const fast = parseCommand(c.utterance, before, {});
  if (fast?.kind === "ops") {
    const applied = applyBatch(before, fast.ops);
    const totalMs = performance.now() - t0;
    const after = applied.ok ? applied.graph : before;
    const outcome: Outcome = { before, after, kind: "ops", message: fast.summary, options: [], focusNodeIds: [] };
    return finish(c, { ...base, actualKind: "ops", tier: "fastpath", totalMs, applied: applied.ok }, outcome);
  }
  if (fastpathOnly) {
    // B0: the fast path abstained. Not a fast-path error, and not a pass.
    return { ...base, actualKind: "noop", tier: "fastpath", totalMs: performance.now() - t0, applied: false, pass: false, abstained: true, failedAssertions: ["abstained"] };
  }

  try {
    const res = await runCommand({ utterance: c.utterance, graph: before, baseVersion: before.version }, { requestId: `eval-${c.id}` });
    const applied = res.kind === "ops" ? applyBatch(before, res.ops) : null;
    const after = applied?.ok ? applied.graph : before;
    const outcome: Outcome = { before, after, kind: res.kind, message: res.message, options: res.options, focusNodeIds: res.focusNodeIds };
    const result: Omit<CaseResult, "pass"> = {
      ...base,
      actualKind: res.kind,
      tier: "ai",
      attempts: res.attempts,
      totalMs: res.timings.totalMs,
      usage: res.usage,
      applied: applied?.ok ?? false,
      model: res.model,
    };
    if (res.kind === "answer") {
      const context = buildUserMessage({ graph: before, sim: before.nodes.length ? simulate(before) : null, utterance: c.utterance });
      result.grounded = grounded(res.message, context);
    }
    return finish(c, result, outcome);
  } catch (err) {
    const code = err instanceof HarnessError ? err.code : "INTERNAL";
    return { ...base, actualKind: "noop", tier: "ai", totalMs: performance.now() - t0, applied: false, pass: false, error: code, failedAssertions: [`error: ${code}`] };
  }
}

function finish(c: EvalCase, r: Omit<CaseResult, "pass">, outcome: Outcome): CaseResult {
  const failed = r.actualKind === c.expect.kind ? checkAll(c.expect.assert ?? [], outcome) : [`kind: expected ${c.expect.kind}, got ${r.actualKind}`];
  return { ...r, pass: failed.length === 0, ...(failed.length ? { failedAssertions: failed } : {}) };
}

const pct = (x: number | undefined) => (x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);
const ms = (x: number | undefined) => (x === undefined ? "—" : x < 10 ? `${x.toFixed(2)} ms` : `${Math.round(x)} ms`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** About one call's worth of tokens: system prompt + a typical board + output. */
const CALL_TOKENS = estimateTokens(COMMAND_SYSTEM_PROMPT.length + 3_000, 2_000);
let warnedDay = false;

const results: CaseResult[] = [];
for (const c of cases) {
  if (!fastpathOnly) {
    const wait = primaryWaitMs(CALL_TOKENS);
    if (wait === Infinity && !warnedDay) {
      warnedDay = true;
      console.log(`  (${providerName()} daily quota used: remaining cases go to ${fallbackName() ?? "no fallback"})`);
    } else if (wait > 0 && wait !== Infinity) {
      console.log(`  (waiting ${Math.ceil(wait / 1000)} s for ${providerName()} quota)`);
      await sleep(wait + 250);
    }
  }
  const r = await runCase(c);
  results.push(r);
  const mark = r.pass ? "✓" : "✗";
  const served = r.model ? ` [${r.model}]` : "";
  console.log(`${mark} ${c.id.padEnd(20)} ${r.tier.padEnd(8)} ${r.actualKind.padEnd(7)} ${ms(r.totalMs).padStart(9)}${served}  ${r.failedAssertions?.join(" | ") ?? ""}`);
}

function servedModels(): string {
  const counts = new Map<string, number>();
  for (const r of results) if (r.model) counts.set(r.model, (counts.get(r.model) ?? 0) + 1);
  return [...counts].map(([m, n]) => `${m} (${n})`).join(" + ");
}

const metrics = computeMetrics(results);
const lat = latency(results);
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
})();

const run = {
  runId: `${new Date().toISOString().replace(/[:.]/g, "-")}-${split}${fastpathOnly ? "-b0" : ""}`,
  createdAt: new Date().toISOString(),
  commit,
  split,
  // Every model that served a case, with counts: fallbacks are part of the result, not hidden.
  model: fastpathOnly ? "none" : servedModels() || getProvider().model,
  effort: fastpathOnly ? "none" : getProvider().effort,
  promptHash: createHash("sha256").update(COMMAND_SYSTEM_PROMPT).digest("hex").slice(0, 12),
  target: "local",
  environment: { cpu: os.cpus()[0]?.model ?? "unknown", node: process.version },
  metrics,
  byCategory: byCategory(results),
  latency: lat,
  // `applied`, `grounded`, `error` and `abstained` are internal: the contract's CaseResult is the rest.
  cases: results.map(({ applied: _a, grounded: _g, error: _e, abstained: _b, ...r }) => ({ ...r, totalMs: Math.round(r.totalMs * 1000) / 1000 })),
};

const schema = JSON.parse(readFileSync("specs/evaluation-schema.json", "utf8"));
const ajv = new Ajv2020({ strict: false, validateFormats: false });
ajv.addSchema(schema);
const validate = ajv.getSchema("https://archie.dev/specs/evaluation-schema.json#/$defs/RunResult");
if (!validate?.(run)) {
  console.error("Run result does not match specs/evaluation-schema.json:", validate?.errors);
  process.exit(1);
}
mkdirSync("evals/results", { recursive: true });
writeFileSync(out, JSON.stringify(run, null, 2) + "\n");

console.log(`\n${fastpathOnly ? "B0 fast path only" : `B1 ${run.model} · ${run.effort}`} · split ${split} · ${results.length} cases · prompt ${run.promptHash}`);
console.log(`task accuracy     ${pct(metrics.taskAccuracy)}`);
console.log(`kind accuracy     ${pct(metrics.kindAccuracy)}`);
console.log(`false-action rate ${pct(metrics.falseActionRate)}`);
console.log(`over-clarify rate ${pct(metrics.overClarifyRate)}`);
console.log(`fast-path         precision ${pct(metrics.fastPathPrecision)} · coverage ${pct(metrics.fastPathCoverage)}`);
console.log(`repair rate       ${pct(metrics.repairRate)}`);
console.log(`groundedness      ${pct(metrics.answerGroundedness)}`);
console.log(`cache hit rate    ${pct(metrics.cacheHitRate)}`);
for (const [tier, s] of Object.entries(lat)) {
  console.log(`latency ${tier.padEnd(9)} n=${s.n} P50 ${ms(s.p50)} · P70 ${ms(s.p70)} · P95 ${ms(s.p95)} · P99 ${ms(s.p99)} · P100 ${ms(s.p100)}`);
}
console.log(`\nby category: ${Object.entries(run.byCategory).map(([k, v]) => `${k} ${v.pass}/${v.n}`).join(" · ")}`);
if (!fastpathOnly) console.log(`quota after run: ${JSON.stringify(quotaStatus())}`);
console.log(`wrote ${out}`);
