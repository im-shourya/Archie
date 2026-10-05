import { QuotaGuard, type QuotaLimits } from "./quota";
import { ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_MAX_TOKENS, createAnthropicProvider } from "./providers/anthropic";
import { createChain, type ChainLink } from "./providers/chain";
import { createGeminiProvider, GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_MODELS, GEMINI_MAX_TOKENS } from "./providers/gemini";
import { createGroqProvider, GROQ_DEFAULT_MODEL, GROQ_MAX_TOKENS } from "./providers/groq";
import type { LlmProvider, ProviderName } from "./providers/types";

/**
 * Provider, fallback and quota config (docs/12 · Model configuration, ADR-016, ADR-017).
 *
 * - ARCHIE_PROVIDER: primary, `gemini` (default, free) | `groq` (free) | `anthropic` (paid).
 *   Unset + only ANTHROPIC_API_KEY present → anthropic.
 * - ARCHIE_FALLBACK: `groq` (default when GROQ_API_KEY is set) | `gemini` | `anthropic` | `none`.
 * - GEMINI_MODELS: the Gemini ladder, tried in order (free quotas are per model). ARCHIE_MODEL
 *   pins the primary to a single model instead.
 * - Quotas, applied per model: <P>_RPM, <P>_RPD, <P>_TPM, <P>_TPD (e.g. GEMINI_RPD=20). Defaults
 *   sit just under each free tier; check yours at aistudio.google.com/rate-limit and console.groq.com.
 */

const NAMES: readonly ProviderName[] = ["gemini", "groq", "anthropic"];

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: GEMINI_DEFAULT_MODEL,
  groq: GROQ_DEFAULT_MODEL,
  anthropic: ANTHROPIC_DEFAULT_MODEL,
};

const KEY_ENV: Record<ProviderName, string> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const OUTPUT_ALLOWANCE: Record<ProviderName, number> = {
  gemini: GEMINI_MAX_TOKENS / 4,
  groq: GROQ_MAX_TOKENS / 4,
  anthropic: ANTHROPIC_MAX_TOKENS / 4,
};

/**
 * Free-tier defaults, set ~5% under the published limits. Gemini doesn't publish fixed numbers
 * (they're per project in AI Studio), so its defaults are conservative: raise them to match yours.
 * Paid Anthropic has no default quota: the backend's ARCHIE_DAILY_CAP bounds spend.
 */
export const DEFAULT_QUOTAS: Record<ProviderName, QuotaLimits> = {
  // Measured: gemini-3.8-flash's 429 named "GenerateRequestsPerDayPerProjectPerModel-FreeTier", limit 20.
  gemini: { rpm: 9, rpd: 19, tpm: 230_000, dayZone: "America/Los_Angeles" },
  groq: { rpm: 28, rpd: 950, tpm: 7_600, tpd: 190_000, dayZone: "UTC" },
  anthropic: {},
};

const isName = (v: string | undefined): v is ProviderName => !!v && (NAMES as readonly string[]).includes(v);
const hasKey = (name: ProviderName) => Boolean(process.env[KEY_ENV[name]]);

export function providerName(): ProviderName {
  const set = process.env.ARCHIE_PROVIDER;
  if (isName(set)) return set;
  return hasKey("anthropic") && !hasKey("gemini") ? "anthropic" : "gemini";
}

export function fallbackName(): ProviderName | null {
  const set = process.env.ARCHIE_FALLBACK;
  if (set === "none") return null;
  const name = isName(set) ? set : hasKey("groq") ? "groq" : null;
  return name && name !== providerName() && hasKey(name) ? name : null;
}

export function modelName(): string {
  return process.env.ARCHIE_MODEL || DEFAULT_MODELS[providerName()];
}

/** Models to try for a provider, in order. Only Gemini has a ladder by default. */
export function modelLadder(name: ProviderName, pinned?: string): string[] {
  if (pinned) return [pinned];
  if (name !== "gemini") return [DEFAULT_MODELS[name]];
  const list = (process.env.GEMINI_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? list : [...GEMINI_DEFAULT_MODELS];
}

/** The env var holding the key for the primary provider. */
export function keyEnv(): string {
  return KEY_ENV[providerName()];
}

/** At least one provider in the chain has a key. */
export function isConfigured(): boolean {
  return hasKey(providerName()) || fallbackName() !== null;
}

function num(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function quotaLimits(name: ProviderName): QuotaLimits {
  const prefix = name.toUpperCase();
  const base = DEFAULT_QUOTAS[name];
  const pick = (k: "rpm" | "rpd" | "tpm" | "tpd") => num(`${prefix}_${k.toUpperCase()}`) ?? base[k];
  return { rpm: pick("rpm"), rpd: pick("rpd"), tpm: pick("tpm"), tpd: pick("tpd"), dayZone: base.dayZone };
}

function create(name: ProviderName, model: string): LlmProvider {
  if (name === "anthropic") return createAnthropicProvider({ model });
  if (name === "groq") return createGroqProvider({ model });
  return createGeminiProvider({ model });
}

/** Guards live for the process, one per provider model (free quotas are per model). */
const guards = new Map<string, QuotaGuard>();
function guardFor(name: ProviderName, model: string): QuotaGuard {
  const limits = quotaLimits(name);
  const key = `${name}:${model}:${JSON.stringify(limits)}`;
  let g = guards.get(key);
  if (!g) guards.set(key, (g = new QuotaGuard(model, limits)));
  return g;
}

/** Every (provider, model) step of the chain, in order. */
function steps(): { name: ProviderName; model: string }[] {
  const primary = providerName();
  const fallback = fallbackName();
  const out = hasKey(primary) ? modelLadder(primary, process.env.ARCHIE_MODEL || undefined).map((model) => ({ name: primary, model })) : [];
  if (fallback) out.push(...modelLadder(fallback).map((model) => ({ name: fallback, model })));
  return out;
}

function log(event: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "test") console.log(JSON.stringify({ level: "info", ...event }));
}

const chains = new Map<string, LlmProvider>();

/** The primary provider wrapped with its quota guard, plus the fallback when configured. */
export function getProvider(): LlmProvider {
  const chainSteps = steps();
  const key = JSON.stringify([chainSteps, quotaLimits("gemini"), quotaLimits("groq")]);
  let chain = chains.get(key);
  if (!chain) {
    const links: ChainLink[] = chainSteps.map(({ name, model }) => ({
      provider: create(name, model),
      guard: guardFor(name, model),
      outputAllowance: OUTPUT_ALLOWANCE[name],
    }));
    const primary = providerName();
    chain = createChain(links.length ? links : [{ provider: create(primary, modelName()), outputAllowance: 0 }], log);
    chains.set(key, chain);
  }
  return chain;
}

/** Quota usage per chain step (`provider:model`), for /api/health and the eval runner. */
export function quotaStatus(): Record<string, ReturnType<QuotaGuard["snapshot"]>> {
  return Object.fromEntries(steps().map(({ name, model }) => [`${name}:${model}`, guardFor(name, model).snapshot()]));
}

/**
 * ms until the primary provider's ladder has room for one more call (0 = now; Infinity = all of
 * its models are out for the day). Used by the eval runner to pace itself instead of spilling
 * every case onto the fallback.
 */
export function primaryWaitMs(estimatedTokens: number): number {
  const primary = providerName();
  let best = Infinity;
  for (const { name, model } of steps()) {
    if (name !== primary) continue;
    const check = guardFor(name, model).check(estimatedTokens);
    if (check.ok) return 0;
    best = Math.min(best, check.retryInMs);
  }
  return best;
}
