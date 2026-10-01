import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { CommandRequestSchema, HarnessError, runCommand } from "@archie/ai/llm";
import { AppError, errorBody } from "../errors";
import { accessCode } from "../middleware/accessCode";
import { rateLimit } from "../middleware/rateLimit";

export const COMMAND_PER_MINUTE = 20;

/**
 * POST /api/command: the AI tier of the command bar (docs/16). Only called when the fast path
 * returns null. Pipeline: accessCode → rateLimit → zValidator → harness.
 */
export const command = new Hono().post(
  "/",
  accessCode,
  rateLimit(COMMAND_PER_MINUTE),
  zValidator("json", CommandRequestSchema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return c.json(errorBody("VALIDATION_ERROR", `${where}${issue?.message ?? "invalid request"}`), 400);
    }
  }),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const res = await runCommand(body, { requestId: c.get("requestId"), signal: c.req.raw.signal });
      c.set("logFields", {
        kind: res.kind,
        attempts: res.attempts,
        model: res.model,
        timings: res.timings,
        usage: res.usage,
        nodes: body.graph.nodes.length,
      });
      return c.json(res);
    } catch (err) {
      if (!(err instanceof HarnessError)) throw err;
      c.set("logFields", { errorCode: err.code });
      if (err.cause && process.env.NODE_ENV !== "test") {
        // Provider details stay server-side, keyed by request id (docs/15).
        console.error(JSON.stringify({ level: "error", requestId: c.get("requestId"), code: err.code, cause: String(err.cause) }));
      }
      throw new AppError(err.code, err.message, err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : undefined);
    }
  },
);
