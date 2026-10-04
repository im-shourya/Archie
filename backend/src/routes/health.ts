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
    // Vercel sets the commit SHA; the Docker image is stamped with ARCHIE_VERSION at build time.
    version: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.ARCHIE_VERSION)?.slice(0, 7) ?? "dev",
  }),
);
