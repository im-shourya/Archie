/**
 * Board route JS budget (NFR-015, docs/33 Step 7). Run after `npm run build`.
 *
 * Initial JS = the framework's root chunks (build-manifest rootMainFiles) plus every chunk the
 * route's client-reference manifest loads up front (entryJSFiles, and the non-async chunks of its
 * client modules). Lazy chunks (the ELK layout worker, dynamic imports) don't count. Each file is
 * gzipped at level 9 and the sizes are summed. Exits 1 above the budget.
 *
 * Usage: npm run bundle:size -- [--route /b/[id]] [--budget-kb 300]
 *
 * CI passes --budget-kb 320 as a no-regression ratchet: the route measures 318.7 KB today,
 * 90 KB of it zod's classic API used for client-side op validation. Moving that to zod/mini
 * (~5 KB) is the planned fix that brings it under the 300 KB target (docs/31 · Open items).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const route = arg("--route", "/b/[id]");
const budgetKb = Number(arg("--budget-kb", "300"));
const next = join(import.meta.dirname, "../frontend/.next");

if (!existsSync(join(next, "build-manifest.json"))) {
  console.error("No build found at frontend/.next. Run `npm run build` first.");
  process.exit(2);
}

const build = JSON.parse(readFileSync(join(next, "build-manifest.json"), "utf8")) as {
  rootMainFiles: string[];
};
const manifestFile = join(next, "server/app", route, "page_client-reference-manifest.js");
interface RouteManifest {
  entryJSFiles?: Record<string, string[]>;
  clientModules?: Record<string, { chunks?: string[]; async?: boolean }>;
}
const sandbox: { globalThis?: unknown; __RSC_MANIFEST?: Record<string, RouteManifest> } = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(manifestFile, "utf8"), sandbox);
const manifest = sandbox.__RSC_MANIFEST?.[`${route === "/" ? "" : route}/page`];
if (!manifest) throw new Error(`no client-reference manifest for ${route}`);

const files = new Set<string>(build.rootMainFiles);
for (const chunks of Object.values(manifest.entryJSFiles ?? {}))
  chunks.forEach((f) => files.add(f));
for (const mod of Object.values(manifest.clientModules ?? {})) {
  if (mod.async) continue;
  for (const chunk of mod.chunks ?? []) files.add(chunk.replace(/^\/_next\//, ""));
}

let total = 0;
const rows = [...files].map((file) => {
  const gz = gzipSync(readFileSync(join(next, file)), { level: 9 }).length;
  total += gz;
  return { file, kb: gz / 1024 };
});
rows.sort((a, b) => b.kb - a.kb);

const kb = total / 1024;
console.log(`Initial JS for ${route} (gzip):`);
for (const r of rows) console.log(`  ${r.kb.toFixed(1).padStart(7)} KB  ${r.file}`);
console.log(`  ${kb.toFixed(1).padStart(7)} KB  total · budget ${budgetKb} KB`);
if (kb > budgetKb) {
  console.error(`Over budget by ${(kb - budgetKb).toFixed(1)} KB (NFR-015).`);
  process.exit(1);
}
