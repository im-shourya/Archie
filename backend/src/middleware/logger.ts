import { createMiddleware } from "hono/factory";

declare module "hono" {
  interface ContextVariableMap {
    /** Extra fields a route adds to its log line (e.g. kind, attempts, timings). Never user content. */
    logFields?: Record<string, unknown>;
  }
}

/**
 * One structured JSON line per request (docs/26).
 * Never log request bodies: utterances and graphs are user content.
 */
export const logger = createMiddleware(async (c, next) => {
  const start = performance.now();
  await next();
  const status = c.res.status;
  const line = {
    ts: new Date().toISOString(),
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    requestId: c.get("requestId"),
    route: `${c.req.method} ${c.req.path}`,
    status,
    totalMs: Math.round(performance.now() - start),
    ...c.get("logFields"),
  };
  if (process.env.NODE_ENV !== "test") console.log(JSON.stringify(line));
});
