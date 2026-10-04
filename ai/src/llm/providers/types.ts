import type { z } from "zod";
import type { CommandUsage } from "../schemas";

/**
 * The provider seam. The harness owns the algorithm (repair, guardrails, budget, error mapping);
 * a provider turns one request into one model turn. Anthropic and Gemini implement it.
 */

export type ProviderName = "anthropic" | "gemini" | "groq";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  /** The provider's own assistant content, replayed verbatim on the repair turn (append-only). */
  raw?: unknown;
}

/** The structured output a request asks for. Providers convert and cache it by `name`. */
export interface OutputSpec<T = unknown> {
  /** Stable id, e.g. "command_result"; also the JSON-schema name sent to providers that need one. */
  name: string;
  schema: z.ZodType<T>;
}

export interface CompletionRequest {
  system: string;
  /** Defaults to the command result (COMMAND_OUTPUT). */
  output?: OutputSpec;
  turns: readonly Turn[];
  /** 1 normally, 2 on the max_tokens retry (G-11). */
  tokenScale: 1 | 2;
  signal: AbortSignal;
  /**
   * When the request's whole budget runs out (performance.now() ms). The chain uses it to cut a
   * hung model off early enough for the next provider to answer.
   */
  deadline?: number;
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

/**
 * - `aborted`: the request's signal fired, or the provider's own per-attempt timeout.
 * - `rate_limit`: the provider returned 429. `overloaded`: 5xx / "high demand".
 * - `connection`: network failure. `upstream`: any other provider error (4xx, bad response).
 * - `quota_minute` / `quota_day`: our own quota guard refused before calling (see quota.ts).
 */
export type ProviderErrorKind =
  | "aborted"
  | "rate_limit"
  | "overloaded"
  | "connection"
  | "upstream"
  | "quota_minute"
  | "quota_day";

/** A provider failure, already classified. The original error stays in `cause`. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    options?: { cause?: unknown; retryAfterMs?: number },
  ) {
    super(`provider error: ${kind}`, options);
    this.name = "ProviderError";
    this.retryAfterMs = options?.retryAfterMs;
  }

  /** How long to wait before this provider can be tried again, when known. */
  readonly retryAfterMs: number | undefined;
}

/** Kinds that mean "this provider can't serve right now": try the next one in the chain. */
export const FAILOVER_KINDS: ReadonlySet<ProviderErrorKind> = new Set([
  "rate_limit",
  "overloaded",
  "connection",
  "aborted",
  "quota_minute",
  "quota_day",
]);
