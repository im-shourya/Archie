import Anthropic from "@anthropic-ai/sdk";

/** Anthropic client singleton and model config (docs/12 · Model configuration, docs/15). */

export const DEFAULT_MODEL = "claude-opus-5-5";
/** Per-attempt HTTP timeout. The SDK retries 408/409/429/5xx and connection errors twice. */
export const LLM_TIMEOUT_MS = 15_000;
export const LLM_MAX_RETRIES = 2;
/** Server-side refusal fallback, routed by refusal category (docs/12). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function modelName(): string {
  return process.env.ARCHIE_MODEL || DEFAULT_MODEL;
}

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: LLM_MAX_RETRIES, timeout: LLM_TIMEOUT_MS });
  return client;
}
