import Groq from "groq-sdk";
import { COMMAND_OUTPUT, jsonSchemaFor } from "./output";
import { ProviderError, type Completion, type CompletionRequest, type LlmProvider } from "./types";

/**
 * Groq (free tier) as the fallback provider. `openai/gpt-oss-120b` supports strict JSON-schema
 * structured output (constrained decoding); `gpt-oss-20b` failed our schema in testing.
 * Free limits are tight on tokens (8K per minute, about one Archie call), so the quota guard
 * keeps it to a safety net.
 */

export const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";
export const GROQ_MAX_TOKENS = 4_000;

export type ChatClient = Pick<Groq, "chat">;

let client: ChatClient | null = null;
function defaultClient(): ChatClient {
  // No SDK retries: a failure should fail over (or surface) fast, inside the 20 s budget.
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0, timeout: 12_000 });
  return client;
}

function retryAfter(headers: Headers | undefined): number | undefined {
  const s = Number(headers?.get("retry-after"));
  return Number.isFinite(s) && s > 0 ? s * 1000 : undefined;
}

/** Most specific first. */
function classify(err: unknown): ProviderError {
  if (err instanceof Groq.APIUserAbortError) return new ProviderError("aborted", { cause: err });
  if (err instanceof Groq.APIConnectionTimeoutError) return new ProviderError("aborted", { cause: err });
  if (err instanceof Groq.APIConnectionError) return new ProviderError("connection", { cause: err });
  if (err instanceof Groq.RateLimitError) return new ProviderError("rate_limit", { cause: err, retryAfterMs: retryAfter(err.headers) });
  if (err instanceof Groq.InternalServerError) return new ProviderError("overloaded", { cause: err });
  return new ProviderError("upstream", { cause: err });
}

export function createGroqProvider(options: { client?: ChatClient; model?: string } = {}): LlmProvider {
  const model = options.model ?? GROQ_DEFAULT_MODEL;
  return {
    name: "groq",
    model,
    effort: "reasoning low",
    async complete(req: CompletionRequest): Promise<Completion> {
      let res: Groq.Chat.ChatCompletion;
      try {
        res = await (options.client ?? defaultClient()).chat.completions.create(
          {
            model,
            max_completion_tokens: GROQ_MAX_TOKENS * req.tokenScale,
            reasoning_effort: "low",
            messages: [
              { role: "system", content: req.system },
              ...req.turns.map((t) => ({ role: t.role, content: t.text })),
            ],
            // Strict mode needs every property required and closed objects: the wire schemas are.
            response_format: {
              type: "json_schema",
              json_schema: { name: (req.output ?? COMMAND_OUTPUT).name, strict: true, schema: jsonSchemaFor(req.output) },
            },
          },
          { signal: req.signal },
        );
      } catch (err) {
        throw classify(err);
      }
      const choice = res.choices[0];
      const u = res.usage;
      const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
      const text = choice?.message.content ?? "";
      return {
        text,
        stop: choice?.finish_reason === "length" ? "max_tokens" : "end",
        model: res.model || model,
        usage: {
          inputTokens: Math.max(0, (u?.prompt_tokens ?? 0) - cached),
          outputTokens: u?.completion_tokens ?? 0,
          cacheReadTokens: cached,
          cacheWriteTokens: 0,
        },
        raw: text,
      };
    },
  };
}
