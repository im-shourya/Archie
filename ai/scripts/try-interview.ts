// Manual real call: npx tsx ai/scripts/try-interview.ts [problemId] [--template three-tier] [--score]
// Asks one interviewer question about a board and prints source, latency and the checks.
// Budget: one model call per run (docs/34 · Quota budget). Never run in CI.
import { existsSync } from "node:fs";
import { buildTemplate, emptyGraph, type TemplateId } from "@archie/simulator";
import { runInterviewTurn } from "../src/llm/interview";
import { runScore } from "../src/llm/score";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const problemId = args.find((a) => !a.startsWith("--")) ?? "url-shortener";
const t = args.indexOf("--template");
const graph = t >= 0 ? buildTemplate(args[t + 1] as TemplateId) : emptyGraph();

if (args.includes("--score")) {
  const card = await runScore({
    problemId,
    graph,
    transcript: [
      { role: "interviewer", text: "Where do reads go when a short link is opened?" },
      {
        role: "candidate",
        text: "Through the load balancer to the API, which checks Redis first and falls back to Postgres.",
      },
    ],
  });
  console.log(
    JSON.stringify(
      {
        overall: card.overall,
        rubric: card.rubric,
        summary: card.summary,
        model: card.model,
        timings: card.timings,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const res = await runInterviewTurn({
  problemId,
  graph,
  transcript: [
    { role: "candidate", text: "I'd put a cache in front of the database so reads stay fast." },
  ],
});
console.log(
  JSON.stringify(
    {
      source: res.source,
      question: res.question,
      focus: res.focusNodeIds,
      model: res.model,
      timings: res.timings,
    },
    null,
    2,
  ),
);
console.log(
  res.checks
    .map((c) => `${c.pass === null ? "–" : c.pass ? "✓" : "✗"} ${c.label} · ${c.actual}`)
    .join("\n"),
);
