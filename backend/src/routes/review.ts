import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ReviewRequestSchema, runReview } from "@archie/ai/llm";
import { accessCode } from "../middleware/accessCode";
import { rateLimit } from "../middleware/rateLimit";
import { toAppError, validationHook } from "./ai";

export const REVIEW_PER_MINUTE = 5;

/** POST /api/review (docs/16, docs/34 Step 5): rule findings always, AI findings when available. */
export const review = new Hono().post(
  "/",
  accessCode,
  rateLimit(REVIEW_PER_MINUTE),
  zValidator("json", ReviewRequestSchema, validationHook),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const res = await runReview(body, {
        requestId: c.get("requestId"),
        signal: c.req.raw.signal,
      });
      c.set("logFields", {
        route: "review",
        findings: res.findings.length,
        aiAvailable: res.aiAvailable,
        model: res.model,
        timings: res.timings,
      });
      return c.json(res);
    } catch (err) {
      toAppError(err, c);
    }
  },
);
