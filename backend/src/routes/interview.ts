import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  InterviewTurnRequestSchema,
  runInterviewTurn,
  runScore,
  ScoreRequestSchema,
} from "@archie/ai/llm";
import { accessCode } from "../middleware/accessCode";
import { rateLimit } from "../middleware/rateLimit";
import { toAppError, validationHook } from "./ai";

export const INTERVIEW_PER_MINUTE = 10;

/**
 * Interview mode (docs/16, docs/34 Steps 3–4). Same pipeline as /api/command:
 * accessCode → rateLimit → zValidator → harness. The simulator computes every check server-side.
 */
export const interview = new Hono()
  .post(
    "/turn",
    accessCode,
    rateLimit(INTERVIEW_PER_MINUTE),
    zValidator("json", InterviewTurnRequestSchema, validationHook),
    async (c) => {
      const body = c.req.valid("json");
      try {
        const res = await runInterviewTurn(body, {
          requestId: c.get("requestId"),
          signal: c.req.raw.signal,
        });
        c.set("logFields", {
          route: "interview/turn",
          problemId: body.problemId,
          source: res.source,
          model: res.model,
          timings: res.timings,
        });
        return c.json(res);
      } catch (err) {
        toAppError(err, c);
      }
    },
  )
  .post(
    "/score",
    accessCode,
    rateLimit(INTERVIEW_PER_MINUTE),
    zValidator("json", ScoreRequestSchema, validationHook),
    async (c) => {
      const body = c.req.valid("json");
      try {
        const res = await runScore(body, {
          requestId: c.get("requestId"),
          signal: c.req.raw.signal,
        });
        c.set("logFields", {
          route: "interview/score",
          problemId: body.problemId,
          overall: res.overall,
          model: res.model,
          timings: res.timings,
        });
        return c.json(res);
      } catch (err) {
        toAppError(err, c);
      }
    },
  );
