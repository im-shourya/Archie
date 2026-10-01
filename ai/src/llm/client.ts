import { ANTHROPIC_DEFAULT_MODEL, createAnthropicProvider } from "./providers/anthropic";
import { createGeminiProvider, GEMINI_DEFAULT_MODEL } from "./providers/gemini";
import type { LlmProvider, ProviderName } from "./providers/types";

/**
 * Provider and model config (docs/12 · Model configuration).
 *
 * ARCHIE_PROVIDER picks `gemini` (default; free tier) or `anthropic` (paid). If it's unset and
 * only ANTHROPIC_API_KEY is present, Claude is used. ARCHIE_MODEL overrides the model.
 */

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: GEMINI_DEFAULT_MODEL,
  anthropic: ANTHROPIC_DEFAULT_MODEL,
};

const KEY_ENV: Record<ProviderName, string> = { gemini: "GEMINI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };

export function providerName(): ProviderName {
  const set = process.env.ARCHIE_PROVIDER;
  if (set === "gemini" || set === "anthropic") return set;
  return process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY ? "anthropic" : "gemini";
}

export function modelName(): string {
  return process.env.ARCHIE_MODEL || DEFAULT_MODELS[providerName()];
}

/** The env var holding the key for the active provider. */
export function keyEnv(): string {
  return KEY_ENV[providerName()];
}

export function isConfigured(): boolean {
  return Boolean(process.env[keyEnv()]);
}

const providers = new Map<string, LlmProvider>();

export function getProvider(): LlmProvider {
  const name = providerName();
  const model = modelName();
  const key = `${name}:${model}`;
  let p = providers.get(key);
  if (!p) {
    p = name === "anthropic" ? createAnthropicProvider({ model }) : createGeminiProvider({ model });
    providers.set(key, p);
  }
  return p;
}
