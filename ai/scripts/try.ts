// Manual real call: npx tsx ai/scripts/try.ts "add a cache in front of postgres" [--empty]
// Confirms the structured-output schema compiles and shows timings, usage and cache hits.
// Needs GEMINI_API_KEY (free, default) or ANTHROPIC_API_KEY with ARCHIE_PROVIDER=anthropic.
// Keys are read from .env.local if present. Never run in CI.
import { existsSync } from "node:fs";
import { buildTemplate, emptyGraph } from "@archie/simulator";
import { runCommand } from "../src/llm/harness";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const utterance = args.filter((a) => !a.startsWith("--")).join(" ") || "add a cache in front of postgres";
const graph = args.includes("--empty") ? emptyGraph() : buildTemplate("three-tier");

for (const run of ["cold", "warm"]) {
  const res = await runCommand({ utterance, graph, baseVersion: graph.version });
  console.log(`\n── ${run} ──`);
  console.log(JSON.stringify(res, null, 2));
}
