import * as z from "zod/mini";
import { OpSchema } from "./ops";

/** A logged batch (docs/08 · Event log). Undo uses graph snapshots, so no inverse is stored. */
export const EventSourceSchema = z.enum([
  "fastpath",
  "ai",
  "inspector",
  "review-fix",
  "undo",
  "redo",
  "template",
]);

export const BoardEventSchema = z.strictObject({
  id: z.string().check(z.minLength(1)),
  at: z.number().check(z.int(), z.nonnegative()),
  utterance: z.nullable(z.string().check(z.maxLength(4000))),
  source: EventSourceSchema,
  ops: z.array(OpSchema),
  versionAfter: z.number().check(z.int(), z.nonnegative()),
  timings: z.optional(
    z.strictObject({
      totalMs: z.number().check(z.nonnegative()),
      llmMs: z.optional(z.number().check(z.nonnegative())),
    }),
  ),
});

export type EventSource = z.infer<typeof EventSourceSchema>;
export type BoardEvent = z.infer<typeof BoardEventSchema>;
