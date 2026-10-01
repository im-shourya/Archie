import type { CommandUsage } from "../schemas";

/**
 * The provider seam. The harness owns the algorithm (repair, guardrails, budget, error mapping);
 * a provider turns one request into one model turn. Anthropic and Gemini implement it.
 */

export type ProviderName = "anthropic" | "gemini";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  /** The provider's own assistant content, replayed verbatim on the repair turn (append-only). */
  raw?: unknown;
}

export interface CompletionRequest {
  system: string;
  turns: readonly Turn[];
  /** 1 normally, 2 on the max_tokens retry (G-11). */
  tokenScale: 1 | 2;
  signal: AbortSignal;
  requestId?: string;
}

export interface Completion {
  /** The JSON text of the structured output (unparsed). */
  text: string;
  stop: "end" | "max_tokens" | "refusal";
  /** The model that actually answered (may differ from the requested one after a fallback). */
  model: string;
  usage: CommandUsage;
  /** Assistant content to append before a repair turn. */
  raw: unknown;
}

export interface LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** Effort / thinking setting, for eval records. */
  readonly effort: string;
  complete(req: CompletionRequest): Promise<Completion>;
}

export type ProviderErrorKind = "aborted" | "rate_limit" | "connection" | "upstream";

/** A provider failure, already classified. The original error stays in `cause`. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`provider error: ${kind}`, options);
    this.name = "ProviderError";
  }
}
