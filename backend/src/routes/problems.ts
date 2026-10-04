import { Hono } from "hono";
import { PROBLEM_LIST } from "@archie/simulator";

/**
 * GET /api/problems: the interview problem bank (docs/16, FR-050). Static data, no LLM, no limits.
 * Reference designs are not part of a Problem, so the answer key is never served.
 */
export const problems = new Hono().get("/", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ items: PROBLEM_LIST });
});
