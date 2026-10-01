import { OpSchema, simulate, validateBatch, type OpError } from "@archie/simulator";
import { getProvider, isConfigured, keyEnv } from "./client";
import { buildUserMessage } from "./context";
import { applyGuardrails, clarifyFromErrors, repairMessage } from "./guardrails";
import { COMMAND_SYSTEM_PROMPT } from "./prompts/command";
import { ProviderError, type Completion, type LlmProvider, type Turn } from "./providers/types";
import {
  CommandRequestSchema,
  toOps,
  WireResultSchema,
  type CommandRequest,
  type CommandResponse,
  type CommandResult,
  type CommandUsage,
  type WireResult,
} from "./schemas";

/**
 * The /api/command harness (docs/15 · Harness algorithm): structured I/O, bounded retries, one
 * repair turn, guardrails, typed errors and timings. The LLM proposes; validateBatch disposes.
 * Provider-agnostic: Gemini (default, free tier) or Claude, see client.ts.
 */

export type HarnessErrorCode =
  | "VALIDATION_ERROR"
  | "LLM_REFUSED"
  | "LLM_UPSTREAM"
  | "LLM_UNAVAILABLE"
  | "RATE_LIMITED"
  | "DAILY_CAP_REACHED";

/** Typed failure. `message` is safe to show; provider details stay in `cause` (server logs only). */
export class HarnessError extends Error {
  constructor(
    readonly code: HarnessErrorCode,
    message: string,
    options?: { cause?: unknown; retryAfterSeconds?: number },
  ) {
    super(message, options);
    this.name = "HarnessError";
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }

  /** Set on RATE_LIMITED: when the free quota has room again. */
  readonly retryAfterSeconds: number | undefined;
}

/** Total wall-clock budget per request, across SDK retries and the repair turn. */
export const TOTAL_BUDGET_MS = 20_000;

export interface RunOptions {
  requestId?: string;
  signal?: AbortSignal;
  /** Defaults to the configured provider (ARCHIE_PROVIDER). Tests pass one with a mocked SDK. */
  provider?: LlmProvider;
  budgetMs?: number;
}

const ms = (start: number) => Math.round((performance.now() - start) * 10) / 10;

/** Docs/15 · Error mapping. Provider text never reaches the message. */
function mapError(err: unknown, timedOut: boolean): HarnessError {
  if (err instanceof HarnessError) return err;
  if (err instanceof ProviderError) {
    switch (err.kind) {
      case "aborted":
        return new HarnessError("LLM_UNAVAILABLE", timedOut ? "The AI took too long to respond." : "Request cancelled.", { cause: err.cause });
      case "rate_limit":
        return new HarnessError("LLM_UNAVAILABLE", "The AI is busy right now. Try again in a moment.", { cause: err.cause });
      case "connection":
        return new HarnessError("LLM_UNAVAILABLE", "Couldn't reach the AI.", { cause: err.cause });
      case "overloaded":
      case "upstream":
        return new HarnessError("LLM_UPSTREAM", "The AI service returned an error.", { cause: err.cause });
      case "quota_minute":
        return new HarnessError("RATE_LIMITED", "The free AI quota is busy. Try again shortly.", {
          cause: err.cause,
          retryAfterSeconds: Math.max(1, Math.ceil((err.retryAfterMs ?? 60_000) / 1000)),
        });
      case "quota_day":
        return new HarnessError("DAILY_CAP_REACHED", "The free AI quota for today is used up. Local commands still work.", { cause: err.cause });
    }
  }
  return new HarnessError("LLM_UPSTREAM", "The AI returned something unexpected.", { cause: err });
}

function addUsage(total: CommandUsage, usage: CommandUsage): void {
  total.inputTokens += usage.inputTokens;
  total.outputTokens += usage.outputTokens;
  total.cacheReadTokens += usage.cacheReadTokens;
  total.cacheWriteTokens += usage.cacheWriteTokens;
}

/** Wire result → typed result, or the validation errors that need a repair turn. */
function validate(
  wire: WireResult,
  graph: CommandRequest["graph"],
): { result: CommandResult } | { errors: OpError[] } {
  const base = { kind: wire.kind, message: wire.message, options: wire.options, focusNodeIds: wire.focusNodeIds };
  if ((wire.kind !== "ops" && wire.kind !== "confirm") || wire.ops.length === 0) {
    return { result: { ...base, ops: [] } }; // G-12 handled by the guardrails
  }
  const ops = toOps(wire.ops);
  const errors = validateBatch(graph, ops);
  if (errors.length > 0) return { errors };
  return { result: { ...base, ops: ops.map((op) => OpSchema.parse(op)) } };
}

export async function runCommand(input: unknown, options: RunOptions = {}): Promise<CommandResponse> {
  const t0 = performance.now();
  const parsed = CommandRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HarnessError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "invalid request", { cause: parsed.error });
  }
  const req = parsed.data;
  if (!options.provider && !isConfigured()) {
    throw new HarnessError("LLM_UNAVAILABLE", `The AI isn't configured on this server (${keyEnv()} is not set).`);
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

  // One controller for the whole request: the caller's signal or the total budget aborts it.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.budgetMs ?? TOTAL_BUDGET_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const usage: CommandUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const turns: Turn[] = [{ role: "user", text: userMessage }];
  let llmMs = 0;
  let validateMs = 0;
  let servedBy = provider.model;

  /** One model turn, with the single max_tokens retry (G-10, G-11). */
  async function call(): Promise<{ wire: WireResult; completion: Completion }> {
    for (let truncations = 0; ; truncations++) {
      const tLlm = performance.now();
      let completion: Completion;
      try {
        completion = await provider.complete({
          system: COMMAND_SYSTEM_PROMPT,
          turns: [...turns],
          tokenScale: truncations === 0 ? 1 : 2,
          signal: controller.signal,
          requestId: options.requestId,
        });
      } finally {
        llmMs += ms(tLlm);
      }
      addUsage(usage, completion.usage);
      servedBy = completion.model;

      if (completion.stop === "refusal") throw new HarnessError("LLM_REFUSED", "I can't help with that one.");
      if (completion.stop === "max_tokens") {
        if (truncations >= 1) throw new HarnessError("LLM_UPSTREAM", "The AI's answer was cut off.");
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(completion.text);
      } catch (err) {
        throw new HarnessError("LLM_UPSTREAM", "The AI returned something unexpected.", { cause: err });
      }
      const wire = WireResultSchema.safeParse(json);
      if (!wire.success) {
        throw new HarnessError("LLM_UPSTREAM", "The AI returned something unexpected.", { cause: wire.error });
      }
      return { wire: wire.data, completion };
    }
  }

  try {
    let attempts: 1 | 2 = 1;
    const first = await call();
    let tVal = performance.now();
    let checked = validate(first.wire, req.graph);
    validateMs += ms(tVal);

    if ("errors" in checked && !checked.errors.some((e) => e.code === "TOO_MANY_OPS")) {
      // Repair turn (G-02, G-05): append-only, earlier turns are never edited.
      attempts = 2;
      turns.push({ role: "assistant", text: first.completion.text, raw: first.completion.raw });
      turns.push({ role: "user", text: repairMessage(checked.errors, req.graph) });
      const second = await call();
      tVal = performance.now();
      checked = validate(second.wire, req.graph);
      validateMs += ms(tVal);
    }

    tVal = performance.now();
    const result = "errors" in checked ? clarifyFromErrors(checked.errors, req.graph) : checked.result;
    const guarded = applyGuardrails(result, req.graph, req.utterance);
    validateMs += ms(tVal);

    return {
      ...guarded,
      baseVersion: req.baseVersion,
      attempts,
      model: servedBy,
      timings: { contextMs, llmMs: Math.round(llmMs * 10) / 10, validateMs: Math.round(validateMs * 10) / 10, totalMs: ms(t0) },
      usage,
    };
  } catch (err) {
    throw mapError(err, timedOut);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
