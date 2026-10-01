import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { OpSchema, simulate, validateBatch, type OpError } from "@archie/simulator";
import { FALLBACK_BETA, getClient, isConfigured, modelName } from "./client";
import { buildUserMessage } from "./context";
import { applyGuardrails, clarifyFromErrors, repairMessage } from "./guardrails";
import { COMMAND_SYSTEM_PROMPT } from "./prompts/command";
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
 */

export type HarnessErrorCode = "VALIDATION_ERROR" | "LLM_REFUSED" | "LLM_UPSTREAM" | "LLM_UNAVAILABLE";

/** Typed failure. `message` is safe to show; provider details stay in `cause` (server logs only). */
export class HarnessError extends Error {
  constructor(
    readonly code: HarnessErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "HarnessError";
  }
}

export const COMMAND_MAX_TOKENS = 4_000;
export const COMMAND_EFFORT = "low" as const;
/** Total wall-clock budget per request, across SDK retries and the repair turn. */
export const TOTAL_BUDGET_MS = 20_000;

/** The slice of the SDK the harness uses, so tests can pass a mock. */
export type MessagesClient = Pick<Anthropic, "beta">;

export interface RunOptions {
  requestId?: string;
  signal?: AbortSignal;
  client?: MessagesClient;
  model?: string;
  budgetMs?: number;
}

const outputFormat = betaZodOutputFormat(WireResultSchema);
const SYSTEM: Anthropic.Beta.BetaTextBlockParam[] = [
  { type: "text", text: COMMAND_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
];

const ms = (start: number) => Math.round((performance.now() - start) * 10) / 10;

/** Most specific first (docs/15 · Error mapping). Provider text never reaches the message. */
function mapError(err: unknown, timedOut: boolean): HarnessError {
  if (err instanceof HarnessError) return err;
  if (err instanceof Anthropic.APIUserAbortError) {
    return new HarnessError("LLM_UNAVAILABLE", timedOut ? "The AI took too long to respond." : "Request cancelled.", { cause: err });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new HarnessError("LLM_UNAVAILABLE", "The AI is busy right now. Try again in a moment.", { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new HarnessError("LLM_UNAVAILABLE", "Couldn't reach the AI.", { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    return new HarnessError("LLM_UPSTREAM", "The AI service returned an error.", { cause: err });
  }
  return new HarnessError("LLM_UPSTREAM", "The AI returned something unexpected.", { cause: err });
}

/** Text of the final answer: blocks after the last fallback hop (earlier ones are from a declined model). */
function outputText(content: Anthropic.Beta.BetaContentBlock[]): string {
  const lastHop = content.map((b) => b.type).lastIndexOf("fallback");
  return content
    .slice(lastHop + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
}

function addUsage(total: CommandUsage, usage: Anthropic.Beta.BetaUsage | undefined): void {
  if (!usage) return;
  total.inputTokens += usage.input_tokens ?? 0;
  total.outputTokens += usage.output_tokens ?? 0;
  total.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  total.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
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
  if (!options.client && !isConfigured()) {
    throw new HarnessError("LLM_UNAVAILABLE", "The AI isn't configured on this server.");
  }
  const client = options.client ?? getClient();
  const model = options.model ?? modelName();

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
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userMessage }];
  let llmMs = 0;
  let validateMs = 0;
  let servedBy = model;

  /** One model turn, with the single max_tokens retry (G-10, G-11). */
  async function call(): Promise<{ wire: WireResult; content: Anthropic.Beta.BetaContentBlock[] }> {
    let maxTokens = COMMAND_MAX_TOKENS;
    for (let truncations = 0; ; truncations++) {
      const tLlm = performance.now();
      let res: Anthropic.Beta.BetaMessage;
      try {
        res = await client.beta.messages.create(
          {
            model,
            max_tokens: maxTokens,
            system: SYSTEM,
            messages: [...messages],
            output_config: { format: outputFormat, effort: COMMAND_EFFORT },
            betas: [FALLBACK_BETA],
            fallbacks: "default",
          },
          { signal: controller.signal, headers: options.requestId ? { "X-Request-Id": options.requestId } : undefined },
        );
      } finally {
        llmMs += ms(tLlm);
      }
      addUsage(usage, res.usage);
      servedBy = res.model || model;

      if (res.stop_reason === "refusal") {
        throw new HarnessError("LLM_REFUSED", "I can't help with that one.");
      }
      if (res.stop_reason === "max_tokens") {
        if (truncations >= 1) throw new HarnessError("LLM_UPSTREAM", "The AI's answer was cut off.");
        maxTokens *= 2;
        continue;
      }
      try {
        return { wire: outputFormat.parse(outputText(res.content)), content: res.content };
      } catch (err) {
        throw new HarnessError("LLM_UPSTREAM", "The AI returned something unexpected.", { cause: err });
      }
    }
  }

  try {
    let attempts: 1 | 2 = 1;
    const first = await call();
    let tVal = performance.now();
    let checked = validate(first.wire, req.graph);
    validateMs += ms(tVal);

    if ("errors" in checked && !checked.errors.some((e) => e.code === "TOO_MANY_OPS")) {
      // Repair turn (G-02, G-05): append-only, earlier messages are never edited.
      attempts = 2;
      messages.push({ role: "assistant", content: first.content });
      messages.push({ role: "user", content: repairMessage(checked.errors, req.graph) });
      const second = await call();
      tVal = performance.now();
      checked = validate(second.wire, req.graph);
      validateMs += ms(tVal);
    }

    tVal = performance.now();
    const result = "errors" in checked ? clarifyFromErrors(checked.errors, req.graph) : checked.result;
    const guarded = applyGuardrails(result, req.graph);
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
