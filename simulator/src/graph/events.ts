import { z } from "zod";
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
  id: z.string().min(1),
  at: z.number().int().nonnegative(),
  utterance: z.string().max(4000).nullable(),
  source: EventSourceSchema,
  ops: z.array(OpSchema),
  versionAfter: z.number().int().nonnegative(),
  timings: z
    .strictObject({ totalMs: z.number().nonnegative(), llmMs: z.number().nonnegative().optional() })
    .optional(),
});

export type EventSource = z.infer<typeof EventSourceSchema>;
export type BoardEvent = z.infer<typeof BoardEventSchema>;
