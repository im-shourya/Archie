import { z } from "zod";
import { WireResultSchema, type WireResult } from "../schemas";
import type { OutputSpec } from "./types";

/** The /api/command output, and the default for any request that doesn't name one. */
export const COMMAND_OUTPUT: OutputSpec<WireResult> = {
  name: "command_result",
  schema: WireResultSchema,
};

const cache = new Map<string, Record<string, unknown>>();

/**
 * JSON Schema for a structured output, cached by name. `$schema` is dropped: Gemini rejects it.
 * Wire schemas are strict (every property required, closed objects), as Groq's strict mode needs.
 */
export function jsonSchemaFor(spec: OutputSpec = COMMAND_OUTPUT): Record<string, unknown> {
  let schema = cache.get(spec.name);
  if (!schema) {
    const { $schema: _drop, ...rest } = z.toJSONSchema(spec.schema, {
      target: "draft-2020-12",
    }) as Record<string, unknown>;
    schema = rest;
    cache.set(spec.name, schema);
  }
  return schema;
}
