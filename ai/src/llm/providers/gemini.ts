import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { WireResultSchema } from "../schemas";
import { ProviderError, type Completion, type CompletionRequest, type LlmProvider } from "./types";

/**
 * Gemini via the official @google/genai SDK. The default provider: the Flash models have a free
 * tier (GEMINI_API_KEY from aistudio.google.com). Note: free-tier prompts may be used by Google
 * to improve its products, which is fine for public demo boards, not for private designs.
 */

export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
/** Thinking tokens count toward maxOutputTokens on Gemini, so this is higher than Claude's cap. */
export const GEMINI_MAX_TOKENS = 8_000;

/** The slice of the SDK the provider uses, so tests can pass a mock. */
export type ModelsClient = Pick<GoogleGenAI, "models">;

/** WireResult as JSON Schema. Gemini rejects `$schema`; everything else is in its supported subset. */
export const WIRE_JSON_SCHEMA: Record<string, unknown> = (() => {
  const { $schema: _drop, ...schema } = z.toJSONSchema(WireResultSchema, { target: "draft-2020-12" }) as Record<string, unknown>;
  return schema;
})();

/** Finish reasons that mean the model declined (safety / policy filters). */
const REFUSALS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

/** One attempt, 10 s: the free tier is often slow or "high demand" (503), and the chain's fallback beats retrying. */
export const GEMINI_TIMEOUT_MS = 10_000;

let client: ModelsClient | null = null;
function defaultClient(): ModelsClient {
  client ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: GEMINI_TIMEOUT_MS, retryOptions: { attempts: 1 } },
  });
  return client;
}

/** Gemini 429 bodies say "Please retry in 37.5s". */
function retryAfter(message: string): number | undefined {
  const m = /retry in ([\d.]+)s/i.exec(message);
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined;
}

function classify(err: unknown): ProviderError {
  if (err instanceof Error && err.name === "AbortError") return new ProviderError("aborted", { cause: err });
  if (err instanceof ApiError) {
    if (err.status === 429) return new ProviderError("rate_limit", { cause: err, retryAfterMs: retryAfter(err.message) });
    if (err.status >= 500) return new ProviderError("overloaded", { cause: err });
    return new ProviderError("upstream", { cause: err });
  }
  // fetch() network failures surface as TypeError.
  if (err instanceof TypeError) return new ProviderError("connection", { cause: err });
  return new ProviderError("upstream", { cause: err });
}

function stopOf(res: GenerateContentResponse): Completion["stop"] {
  if (res.promptFeedback?.blockReason) return "refusal";
  const reason = res.candidates?.[0]?.finishReason;
  if (reason && REFUSALS.has(reason)) return "refusal";
  if (reason === "MAX_TOKENS") return "max_tokens";
  return "end";
}

export function createGeminiProvider(options: { client?: ModelsClient; model?: string } = {}): LlmProvider {
  const model = options.model ?? GEMINI_DEFAULT_MODEL;
  return {
    name: "gemini",
    model,
    effort: "thinking low",
    async complete(req: CompletionRequest): Promise<Completion> {
      let res: GenerateContentResponse;
      try {
        res = await (options.client ?? defaultClient()).models.generateContent({
          model,
          contents: req.turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
          config: {
            // Byte-stable prefix: Gemini's implicit caching reuses it across calls.
            systemInstruction: req.system,
            responseMimeType: "application/json",
            responseJsonSchema: WIRE_JSON_SCHEMA,
            maxOutputTokens: GEMINI_MAX_TOKENS * req.tokenScale,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            abortSignal: req.signal,
          },
        });
      } catch (err) {
        throw classify(err);
      }
      const u = res.usageMetadata;
      const cached = u?.cachedContentTokenCount ?? 0;
      const text = res.text ?? "";
      return {
        text,
        stop: stopOf(res),
        model: res.modelVersion || model,
        usage: {
          inputTokens: Math.max(0, (u?.promptTokenCount ?? 0) - cached),
          outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
          cacheReadTokens: cached,
          cacheWriteTokens: 0,
        },
        raw: text,
      };
    },
  };
}
