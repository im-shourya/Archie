import { Hono } from "hono";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** GET /api/health: never calls the LLM (docs/16). */
export const health = new Hono().get("/", (c) =>
  c.json({
    ok: true,
    llm: process.env.ANTHROPIC_API_KEY ? "configured" : "missing-key",
    model: process.env.ARCHIE_MODEL ?? DEFAULT_MODEL,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  }),
);
