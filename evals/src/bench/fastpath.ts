/**
 * bench:fast (docs/24): measures the full local path a voice command takes:
 * normalize → grammar → resolve → validate (parseCommand) → applyBatch.
 * 50 warm-up rounds are discarded, then ITERATIONS measured rounds over every utterance.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import { parseCommand } from "@archie/ai/fastpath";
import { applyBatch, buildTemplate } from "@archie/simulator";
import { stats } from "./stats";

const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 1000);
const WARMUP = 50;

/** Fast-path-eligible utterances as dictated (number words, fillers, punctuation). */
const UTTERANCES = [
  "Kill Redis.",
  "Take down the cache.",
  "Kill postgres replica one",
  "Bring it back.",
  "Five replicas of the API.",
  "Scale the API to forty",
  "Shard Postgres into two.",
  "Set Redis hit rate to ninety five percent",
  "Send fifty thousand requests a second, ninety percent reads.",
  "Set the traffic to one point two million requests per second",
  "Peak is three x",
  "Disconnect the API from Redis",
  "Undo that.",
  "Fit the view",
];

const graph = buildTemplate("three-tier");
const ctx = { recent: ["redis"] };

function runOnce(utterance: string): number {
  const start = performance.now();
  const result = parseCommand(utterance, graph, ctx);
  if (result?.kind === "ops") {
    const applied = applyBatch(graph, result.ops);
    if (!applied.ok) throw new Error(`invalid ops for "${utterance}"`);
  }
  const elapsed = performance.now() - start;
  if (!result) throw new Error(`fast path did not handle "${utterance}"`);
  return elapsed;
}

for (let i = 0; i < WARMUP; i++) for (const u of UTTERANCES) runOnce(u);

const all: number[] = [];
const perUtterance: Record<string, ReturnType<typeof stats>> = {};
for (const u of UTTERANCES) {
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) samples.push(runOnce(u));
  perUtterance[u] = stats(samples);
  all.push(...samples);
}

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();

const report = {
  benchmark: "fastpath",
  createdAt: new Date().toISOString(),
  commit,
  environment: { cpu: os.cpus()[0]?.model ?? "unknown", node: process.version, platform: `${os.platform()} ${os.arch()}` },
  iterationsPerUtterance: ITERATIONS,
  utterances: UTTERANCES.length,
  overall: stats(all),
  perUtterance,
};

mkdirSync(new URL("../../results/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../results/bench-fastpath.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);

const o = report.overall;
console.log(`fast path: ${o.n} samples over ${UTTERANCES.length} utterances (${report.environment.cpu}, Node ${process.version})`);
console.log(`P50 ${o.p50} ms · P70 ${o.p70} ms · P95 ${o.p95} ms · P99 ${o.p99} ms · P100 ${o.p100} ms · mean ${o.mean} ms`);
console.log("target (NFR-001): P50 < 10 ms, P100 < 50 ms →", o.p50 < 10 && o.p100 < 50 ? "PASS" : "FAIL");
if (!(o.p50 < 10 && o.p100 < 50)) process.exitCode = 1;
