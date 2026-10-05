import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { WireResultSchema } from "../schemas";
import { ProviderError, type Completion, type CompletionRequest, type LlmProvider } from "./types";

/** Claude via the Anthropic SDK (docs/12 · Model configuration). Paid; opt in with ARCHIE_PROVIDER=anthropic. */

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
export const ANTHROPIC_MAX_TOKENS = 4_000;
/** Server-side refusal fallback, routed by refusal category. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** The slice of the SDK the provider uses, so tests can pass a mock. */
export type MessagesClient = Pick<Anthropic, "beta">;

const outputFormat = betaZodOutputFormat(WireResultSchema);

let client: MessagesClient | null = null;
function defaultClient(): MessagesClient {
  // Per-attempt timeout 15 s; the SDK retries 408/409/429/5xx and connection errors twice.
  client ??= new Anthropic({ maxRetries: 2, timeout: 15_000 });
  return client;
}

/** Text of the final answer: blocks after the last fallback hop (earlier ones are from a declined model). */
function outputText(content: Anthropic.Beta.BetaContentBlock[]): string {
  const lastHop = content.map((b) => b.type).lastIndexOf("fallback");
  return content
    .slice(lastHop + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
}

/** Most specific first. */
function classify(err: unknown): ProviderError {
  if (err instanceof Anthropic.APIUserAbortError) return new ProviderError("aborted", { cause: err });
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("rate_limit", { cause: err });
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError("connection", { cause: err });
  if (err instanceof Anthropic.InternalServerError) return new ProviderError("overloaded", { cause: err });
  return new ProviderError("upstream", { cause: err });
}

export function createAnthropicProvider(options: { client?: MessagesClient; model?: string } = {}): LlmProvider {
  const model = options.model ?? ANTHROPIC_DEFAULT_MODEL;
  return {
    name: "anthropic",
    model,
    effort: "low",
    async complete(req: CompletionRequest): Promise<Completion> {
      const messages: Anthropic.Beta.BetaMessageParam[] = req.turns.map((t) =>
        t.role === "assistant"
          ? { role: "assistant", content: (t.raw as Anthropic.Beta.BetaContentBlock[] | undefined) ?? t.text }
          : { role: "user", content: t.text },
      );
      let res: Anthropic.Beta.BetaMessage;
      try {
        res = await (options.client ?? defaultClient()).beta.messages.create(
          {
            model,
            max_tokens: ANTHROPIC_MAX_TOKENS * req.tokenScale,
            // Byte-stable system prompt with a cache breakpoint; thinking is left adaptive (no param).
            system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
            messages,
            output_config: { format: outputFormat, effort: "low" },
            betas: [FALLBACK_BETA],
            fallbacks: "default",
          },
          { signal: req.signal, headers: req.requestId ? { "X-Request-Id": req.requestId } : undefined },
        );
      } catch (err) {
        throw classify(err);
      }
      const usage = res.usage;
      return {
        text: outputText(res.content),
        stop: res.stop_reason === "refusal" ? "refusal" : res.stop_reason === "max_tokens" ? "max_tokens" : "end",
        model: res.model || model,
        usage: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
        },
        raw: res.content,
      };
    },
  };
}
