// Manual real call: npx tsx ai/scripts/try-review.ts [template] [problemId]
// One model call: rule findings plus AI findings for a template board. Never run in CI.
import { existsSync } from "node:fs";
import { buildTemplate, type TemplateId } from "@archie/simulator";
import { runReview } from "../src/llm/review";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const [template = "three-tier", problemId] = process.argv.slice(2);
const res = await runReview({
  graph: buildTemplate(template as TemplateId),
  ...(problemId ? { problemId } : {}),
});
console.log(
  `aiAvailable=${res.aiAvailable} model=${res.model} llm=${res.timings.llmMs} ms total=${res.timings.totalMs} ms`,
);
for (const f of res.findings)
  console.log(
    `[${f.severity}] (${f.source}) ${f.title} · ${f.nodeIds.join(",")}\n    ${f.detail}${f.fix ? `\n    fix: ${f.fix.summary} (${f.fix.ops.length} ops)` : ""}`,
  );
