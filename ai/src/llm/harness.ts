import { OpSchema, simulate, validateBatch, type OpError } from "@archie/simulator";
import { getProvider, isConfigured, keyEnv } from "./client";
import { buildUserMessage } from "./context";
import { applyGuardrails, clarifyFromErrors, repairMessage } from "./guardrails";
import { COMMAND_SYSTEM_PROMPT } from "./prompts/command";
import { COMMAND_OUTPUT } from "./providers/output";
import type { Turn } from "./providers/types";
import {
  CommandRequestSchema,
  toOps,
  type CommandRequest,
  type CommandResponse,
  type CommandResult,
  type WireResult,
} from "./schemas";
import { HarnessError, StructuredSession, type RunOptions } from "./structured";

export {
  HarnessError,
  TOTAL_BUDGET_MS,
  type HarnessErrorCode,
  type RunOptions,
} from "./structured";

/**
 * The /api/command harness (docs/15 · Harness algorithm): structured I/O, bounded retries, one
 * repair turn, guardrails, typed errors and timings. The LLM proposes; validateBatch disposes.
 * Provider-agnostic: Gemini (default, free tier) or Claude, see client.ts.
 */

const ms = (start: number) => Math.round((performance.now() - start) * 10) / 10;

/** Wire result → typed result, or the validation errors that need a repair turn. */
function validate(
  wire: WireResult,
  graph: CommandRequest["graph"],
): { result: CommandResult } | { errors: OpError[] } {
  const base = {
    kind: wire.kind,
    message: wire.message,
    options: wire.options,
    focusNodeIds: wire.focusNodeIds,
  };
  if ((wire.kind !== "ops" && wire.kind !== "confirm") || wire.ops.length === 0) {
    return { result: { ...base, ops: [] } }; // G-12 handled by the guardrails
  }
  const ops = toOps(wire.ops);
  const errors = validateBatch(graph, ops);
  if (errors.length > 0) return { errors };
  return { result: { ...base, ops: ops.map((op) => OpSchema.parse(op)) } };
}

export async function runCommand(
  input: unknown,
  options: RunOptions = {},
): Promise<CommandResponse> {
  const t0 = performance.now();
  const parsed = CommandRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HarnessError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "invalid request",
      { cause: parsed.error },
    );
  }
  const req = parsed.data;
  if (!options.provider && !isConfigured()) {
    throw new HarnessError(
      "LLM_UNAVAILABLE",
      `The AI isn't configured on this server (${keyEnv()} is not set).`,
    );
  }
  const provider = options.provider ?? getProvider();

  const tCtx = performance.now();
  const sim = req.graph.nodes.length > 0 ? simulate(req.graph) : null;
  const userMessage = buildUserMessage({
    graph: req.graph,
    sim,
    history: req.history,
    selection: req.selection,
    utterance: req.utterance,
  });
  const contextMs = ms(tCtx);

  const session = new StructuredSession({
    ...options,
    provider,
    system: COMMAND_SYSTEM_PROMPT,
    output: COMMAND_OUTPUT,
  });
  const turns: Turn[] = [{ role: "user", text: userMessage }];
  let validateMs = 0;

  try {
    let attempts: 1 | 2 = 1;
    const first = await session.call(turns);
    let tVal = performance.now();
    let checked = validate(first.data, req.graph);
    validateMs += ms(tVal);

    if ("errors" in checked && !checked.errors.some((e) => e.code === "TOO_MANY_OPS")) {
      // Repair turn (G-02, G-05): append-only, earlier turns are never edited.
      attempts = 2;
      turns.push({ role: "assistant", text: first.completion.text, raw: first.completion.raw });
      turns.push({ role: "user", text: repairMessage(checked.errors, req.graph) });
      const second = await session.call(turns);
      tVal = performance.now();
      checked = validate(second.data, req.graph);
      validateMs += ms(tVal);
    }

    tVal = performance.now();
    const result =
      "errors" in checked ? clarifyFromErrors(checked.errors, req.graph) : checked.result;
    const guarded = applyGuardrails(result, req.graph, req.utterance);
    validateMs += ms(tVal);

    const { llmMs, usage, model } = session.stats();
    return {
      ...guarded,
      baseVersion: req.baseVersion,
      attempts,
      model,
      timings: { contextMs, llmMs, validateMs: Math.round(validateMs * 10) / 10, totalMs: ms(t0) },
      usage,
    };
  } finally {
    session.close();
  }
}
