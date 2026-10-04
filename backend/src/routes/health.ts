import { Hono } from "hono";
import { fallbackName, isConfigured, modelName, providerName, quotaStatus } from "@archie/ai/llm";

/** GET /api/health: never calls the LLM (docs/16). */
export const health = new Hono().get("/", (c) =>
  c.json({
    ok: true,
    llm: isConfigured() ? "configured" : "missing-key",
    provider: providerName(),
    fallback: fallbackName(),
    quota: quotaStatus(),
    model: modelName(),
    // Vercel and Render set the commit SHA; a Docker image built with GIT_SHA is stamped with ARCHIE_VERSION.
    version: version(),
  }),
);

/** The deployed commit. An image built without GIT_SHA says "dev", so the host's own value wins then. */
export function version(env: NodeJS.ProcessEnv = process.env): string {
  const stamped = env.ARCHIE_VERSION && env.ARCHIE_VERSION !== "dev" ? env.ARCHIE_VERSION : undefined;
  return (env.VERCEL_GIT_COMMIT_SHA ?? stamped ?? env.RENDER_GIT_COMMIT)?.slice(0, 7) ?? "dev";
}
