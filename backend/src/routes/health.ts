import { Hono } from "hono";
import { isConfigured, modelName } from "@archie/ai/llm";

/** GET /api/health: never calls the LLM (docs/16). */
export const health = new Hono().get("/", (c) =>
  c.json({
    ok: true,
    llm: isConfigured() ? "configured" : "missing-key",
    model: modelName(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  }),
);
