// SERVER-ONLY LLM harness. Never import from the frontend (docs/04).
export * from "./schemas";
export { buildUserMessage, escapeText, graphDsl, simSummary, type ContextInput } from "./context";
export { COMMAND_SYSTEM_PROMPT } from "./prompts/command";
export { runCommand, HarnessError, type HarnessErrorCode, type RunOptions } from "./harness";
export { DEFAULT_MODELS, getProvider, isConfigured, keyEnv, modelName, providerName } from "./client";
export { applyGuardrails, isDestructive } from "./guardrails";
export { createAnthropicProvider, type MessagesClient } from "./providers/anthropic";
export { createGeminiProvider, type ModelsClient } from "./providers/gemini";
export type { LlmProvider, ProviderName } from "./providers/types";
