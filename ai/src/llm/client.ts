import { QuotaGuard, type QuotaLimits } from "./quota";
import { ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_MAX_TOKENS, createAnthropicProvider } from "./providers/anthropic";
import { createChain, type ChainLink } from "./providers/chain";
import { createGeminiProvider, GEMINI_DEFAULT_MODEL, GEMINI_MAX_TOKENS } from "./providers/gemini";
import { createGroqProvider, GROQ_DEFAULT_MODEL, GROQ_MAX_TOKENS } from "./providers/groq";
import type { LlmProvider, ProviderName } from "./providers/types";

/**
 * Provider, fallback and quota config (docs/12 · Model configuration, ADR-016, ADR-017).
 *
 * - ARCHIE_PROVIDER: primary, `gemini` (default, free) | `groq` (free) | `anthropic` (paid).
 *   Unset + only ANTHROPIC_API_KEY present → anthropic.
 * - ARCHIE_FALLBACK: `groq` (default when GROQ_API_KEY is set) | `gemini` | `anthropic` | `none`.
 * - ARCHIE_MODEL overrides the primary's model.
 * - Quotas per provider: <P>_RPM, <P>_RPD, <P>_TPM, <P>_TPD (e.g. GEMINI_RPD=250). Defaults sit
 *   just under each free tier; check yours at aistudio.google.com/rate-limit and console.groq.com.
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
  gemini: { rpm: 9, rpd: 240, tpm: 230_000, dayZone: "America/Los_Angeles" },
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

/** Guards live for the process, shared by every request (and survive config re-reads). */
const guards = new Map<string, QuotaGuard>();
function guardFor(name: ProviderName): QuotaGuard {
  const limits = quotaLimits(name);
  const key = `${name}:${JSON.stringify(limits)}`;
  let g = guards.get(key);
  if (!g) guards.set(key, (g = new QuotaGuard(name, limits)));
  return g;
}

function log(event: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "test") console.log(JSON.stringify({ level: "info", ...event }));
}

const chains = new Map<string, LlmProvider>();

/** The primary provider wrapped with its quota guard, plus the fallback when configured. */
export function getProvider(): LlmProvider {
  const primary = providerName();
  const fallback = fallbackName();
  const model = modelName();
  const key = `${primary}:${model}>${fallback ?? "-"}`;
  let chain = chains.get(key);
  if (!chain) {
    const links: ChainLink[] = [];
    if (hasKey(primary)) links.push({ provider: create(primary, model), guard: guardFor(primary), outputAllowance: OUTPUT_ALLOWANCE[primary] });
    if (fallback) links.push({ provider: create(fallback, DEFAULT_MODELS[fallback]), guard: guardFor(fallback), outputAllowance: OUTPUT_ALLOWANCE[fallback] });
    chain = createChain(links.length ? links : [{ provider: create(primary, model), outputAllowance: 0 }], log);
    chains.set(key, chain);
  }
  return chain;
}

/** Quota usage per provider in the chain, for /api/health and the eval runner. */
export function quotaStatus(): Record<string, ReturnType<QuotaGuard["snapshot"]>> {
  const names = [providerName(), fallbackName()].filter((n): n is ProviderName => n !== null && hasKey(n));
  return Object.fromEntries(names.map((n) => [n, guardFor(n).snapshot()]));
}

/** ms until the primary has room for one more call (0 = now; Infinity = not today). For eval pacing. */
export function primaryWaitMs(estimatedTokens: number): number {
  const check = guardFor(providerName()).check(estimatedTokens);
  return check.ok ? 0 : check.retryInMs;
}
