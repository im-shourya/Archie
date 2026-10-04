/**
 * bench:sim (docs/24): simulate() on synthetic graphs of 10/50/100/200 nodes, including the
 * 10,000-sample Monte Carlo. Target (NFR-003): P95 < 5 ms at 100 nodes.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { SAMPLES, simulate } from "@archie/simulator";
import { syntheticGraph } from "./graphs";
import { stats } from "./stats";

const SIZES = [10, 50, 100, 200];
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 200);
const WARMUP = 20;

const bySize: Record<string, ReturnType<typeof stats>> = {};
for (const size of SIZES) {
  const graph = syntheticGraph(size);
  for (let i = 0; i < WARMUP; i++) simulate(graph);
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    simulate(graph);
    samples.push(performance.now() - start);
  }
  bySize[String(size)] = stats(samples);
}

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();

const report = {
  benchmark: "simulator",
  createdAt: new Date().toISOString(),
  commit,
  environment: { cpu: os.cpus()[0]?.model ?? "unknown", node: process.version, platform: `${os.platform()} ${os.arch()}` },
  monteCarloSamples: SAMPLES,
  iterationsPerSize: ITERATIONS,
  bySize,
};
mkdirSync(new URL("../../results/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../results/bench-simulator.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);

console.log(`simulate(): ${ITERATIONS} runs per size, ${SAMPLES} Monte Carlo samples (${report.environment.cpu}, Node ${process.version})`);
for (const size of SIZES) {
  const s = bySize[String(size)]!;
  console.log(`${String(size).padStart(3)} nodes: P50 ${s.p50} ms · P70 ${s.p70} ms · P95 ${s.p95} ms · P100 ${s.p100} ms`);
}
const p95at100 = bySize["100"]!.p95;
console.log("target (NFR-003): P95 < 5 ms @ 100 nodes →", p95at100 < 5 ? "PASS" : "FAIL");
if (p95at100 >= 5) process.exitCode = 1;
