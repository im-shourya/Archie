import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { CommandRequestSchema, runCommand } from "@archie/ai/llm";
import { accessCode } from "../middleware/accessCode";
import { rateLimit } from "../middleware/rateLimit";
import { toAppError, validationHook } from "./ai";

export const COMMAND_PER_MINUTE = 20;

/**
 * POST /api/command: the AI tier of the command bar (docs/16). Only called when the fast path
 * returns null. Pipeline: accessCode → rateLimit → zValidator → harness.
 */
export const command = new Hono().post(
  "/",
  accessCode,
  rateLimit(COMMAND_PER_MINUTE),
  zValidator("json", CommandRequestSchema, validationHook),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const res = await runCommand(body, {
        requestId: c.get("requestId"),
        signal: c.req.raw.signal,
      });
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
      toAppError(err, c);
    }
  },
);
