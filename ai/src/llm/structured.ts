import type { z } from "zod";
import {
  ProviderError,
  type Completion,
  type LlmProvider,
  type OutputSpec,
  type Turn,
} from "./providers/types";
import type { CommandUsage } from "./schemas";

/**
 * Structured-output session (docs/15 · Harness algorithm, docs/34 Step 3): the provider-agnostic
 * plumbing every AI route shares. One total budget and abort for the whole request, the single
 * max_tokens retry (G-10, G-11), refusal handling, JSON + schema validation, usage and timings,
 * and the typed error mapping. Routes add their own logic on top (repair turns, guardrails).
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
export function mapError(err: unknown, timedOut: boolean): HarnessError {
  if (err instanceof HarnessError) return err;
  if (err instanceof ProviderError) {
    switch (err.kind) {
      case "aborted":
        return new HarnessError(
          "LLM_UNAVAILABLE",
          timedOut ? "The AI took too long to respond." : "Request cancelled.",
          { cause: err.cause },
        );
      case "rate_limit":
        return new HarnessError(
          "LLM_UNAVAILABLE",
          "The AI is busy right now. Try again in a moment.",
          { cause: err.cause },
        );
      case "connection":
        return new HarnessError("LLM_UNAVAILABLE", "Couldn't reach the AI.", { cause: err.cause });
      case "overloaded":
      case "upstream":
        return new HarnessError("LLM_UPSTREAM", "The AI service returned an error.", {
          cause: err.cause,
        });
      case "quota_minute":
        return new HarnessError("RATE_LIMITED", "The free AI quota is busy. Try again shortly.", {
          cause: err.cause,
          retryAfterSeconds: Math.max(1, Math.ceil((err.retryAfterMs ?? 60_000) / 1000)),
        });
      case "quota_day":
        return new HarnessError(
          "DAILY_CAP_REACHED",
          "The free AI quota for today is used up. Local commands still work.",
          { cause: err.cause },
        );
    }
  }
  return new HarnessError("LLM_UPSTREAM", "The AI returned something unexpected.", { cause: err });
}

/**
 * Settle with `work`, or reject as soon as `signal` aborts. SDKs don't all honour an abort signal
 * at every stage (a live eval case hung for 96 s after a failover), so the budget is enforced here.
 */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ProviderError("aborted"));
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new ProviderError("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  work.catch(() => {}); // a late rejection after we gave up must not be unhandled
  return Promise.race([work, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
}

export function addUsage(total: CommandUsage, usage: CommandUsage): void {
  total.inputTokens += usage.inputTokens;
  total.outputTokens += usage.outputTokens;
  total.cacheReadTokens += usage.cacheReadTokens;
  total.cacheWriteTokens += usage.cacheWriteTokens;
}

export interface SessionOptions<T> extends RunOptions {
  provider: LlmProvider;
  system: string;
  output: OutputSpec<T>;
}

export interface SessionStats {
  llmMs: number;
  usage: CommandUsage;
  /** The model that answered last (may differ from the provider's after a fallback). */
  model: string;
}

/** One request's model calls, under one budget. Always `close()` it (finally). */
export class StructuredSession<T> {
  readonly usage: CommandUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  llmMs = 0;
  model: string;
  private readonly controller = new AbortController();
  private timedOut = false;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly onAbort = () => this.controller.abort();
  private readonly deadline: number;

  constructor(private readonly options: SessionOptions<T>) {
    this.model = options.provider.model;
    this.deadline = performance.now() + (options.budgetMs ?? TOTAL_BUDGET_MS);
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.controller.abort();
    }, options.budgetMs ?? TOTAL_BUDGET_MS);
    options.signal?.addEventListener("abort", this.onAbort, { once: true });
  }

  /** One model turn over `turns`, with the single max_tokens retry. Throws HarnessError. */
  async call(turns: readonly Turn[]): Promise<{ data: T; completion: Completion }> {
    try {
      for (let truncations = 0; ; truncations++) {
        const tLlm = performance.now();
        let completion: Completion;
        try {
          completion = await raceAbort(
            this.options.provider.complete({
              system: this.options.system,
              output: this.options.output,
              turns: [...turns],
              tokenScale: truncations === 0 ? 1 : 2,
              signal: this.controller.signal,
              deadline: this.deadline,
              requestId: this.options.requestId,
            }),
            this.controller.signal,
          );
        } finally {
          this.llmMs += ms(tLlm);
        }
        addUsage(this.usage, completion.usage);
        this.model = completion.model;

        if (completion.stop === "refusal")
          throw new HarnessError("LLM_REFUSED", "I can't help with that one.");
        if (completion.stop === "max_tokens") {
          if (truncations >= 1)
            throw new HarnessError("LLM_UPSTREAM", "The AI's answer was cut off.");
          continue;
        }
        let json: unknown;
        try {
          json = JSON.parse(completion.text);
        } catch (err) {
          throw new HarnessError("LLM_UPSTREAM", "The AI returned something unexpected.", {
            cause: err,
          });
        }
        const parsed = (this.options.output.schema as z.ZodType<T>).safeParse(json);
        if (!parsed.success) {
          throw new HarnessError("LLM_UPSTREAM", "The AI returned something unexpected.", {
            cause: parsed.error,
          });
        }
        return { data: parsed.data, completion };
      }
    } catch (err) {
      throw mapError(err, this.timedOut);
    }
  }

  stats(): SessionStats {
    return { llmMs: Math.round(this.llmMs * 10) / 10, usage: this.usage, model: this.model };
  }

  close(): void {
    clearTimeout(this.timer);
    this.options.signal?.removeEventListener("abort", this.onAbort);
  }
}
