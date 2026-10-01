// SERVER-ONLY LLM harness. Never import from the frontend (docs/04).
export * from "./schemas";
export { buildUserMessage, escapeText, graphDsl, simSummary, type ContextInput } from "./context";
export { COMMAND_SYSTEM_PROMPT } from "./prompts/command";
export { runCommand, HarnessError, type HarnessErrorCode, type MessagesClient, type RunOptions } from "./harness";
export { DEFAULT_MODEL, isConfigured, modelName } from "./client";
export { applyGuardrails, isDestructive } from "./guardrails";
