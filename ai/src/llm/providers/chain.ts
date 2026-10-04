import { estimateTokens, type QuotaGuard } from "../quota";
import {
  FAILOVER_KINDS,
  ProviderError,
  type Completion,
  type CompletionRequest,
  type LlmProvider,
} from "./types";

/**
 * Primary → fallback chain with per-provider quota guards (ADR-017).
 *
 * For each model turn: skip any provider whose guard has no room (quota or cooldown), call the
 * first one that does, and on a failover-worthy error (429, 5xx, timeout, network) put it on
 * cooldown and try the next. Non-failover errors (bad request, refusal) surface unchanged.
 * When every provider is out of room, throw `quota_minute` (with the shortest wait) or
 * `quota_day`, so the API answers 429 instead of burning requests that would fail.
 */

export interface ChainLink {
  provider: LlmProvider;
  guard?: QuotaGuard;
  /** Output tokens to budget for (thinking included) when estimating a call. */
  outputAllowance: number;
}

/** Cooldown when a provider gives no Retry-After. */
export const DEFAULT_COOLDOWN_MS: Record<string, number> = {
  rate_limit: 60_000,
  overloaded: 30_000,
  connection: 15_000,
  aborted: 30_000,
};

/**
 * With a deadline, every link except the last one that has room keeps FINAL_RESERVE_MS for the
 * provider after it, and a link that would get less than MIN_ATTEMPT_MS is skipped. Without this,
 * two hung Gemini models used the whole 20 s budget and Groq never got a turn (10 of 58 dev cases
 * timed out on 2026-10-04 while every answered case passed).
 */
export const FINAL_RESERVE_MS = 7_000;
export const MIN_ATTEMPT_MS = 4_000;

export interface ChainTiming {
  finalReserveMs: number;
  minAttemptMs: number;
}

/** Settle with `work`, or reject with `aborted` when `signal` fires (SDKs don't always honour it). */
function raceSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  work.catch(() => {}); // a late rejection after we gave up must not be unhandled
  if (signal.aborted) return Promise.reject(new ProviderError("aborted"));
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new ProviderError("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([work, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
}

export function createChain(
  links: readonly ChainLink[],
  log: (event: Record<string, unknown>) => void = () => {},
  timing: ChainTiming = { finalReserveMs: FINAL_RESERVE_MS, minAttemptMs: MIN_ATTEMPT_MS },
): LlmProvider {
  if (links.length === 0) throw new Error("provider chain needs at least one provider");
  const primary = links[0]!.provider;
  return {
    name: primary.name,
    model: primary.model,
    effort: primary.effort,
    async complete(req: CompletionRequest): Promise<Completion> {
      const chars = req.system.length + req.turns.reduce((n, t) => n + t.text.length, 0);
      let shortestWait = Infinity;
      let lastError: ProviderError | null = null;
      let skipped = false;

      const hasRoom = (link: ChainLink) =>
        link.guard?.check(estimateTokens(chars, link.outputAllowance * req.tokenScale)).ok ?? true;

      for (const [i, link] of links.entries()) {
        if (req.signal.aborted) throw new ProviderError("aborted");
        const tokens = estimateTokens(chars, link.outputAllowance * req.tokenScale);
        const room = link.guard?.check(tokens) ?? { ok: true as const };
        if (!room.ok) {
          skipped = true;
          if (room.scope !== "day") shortestWait = Math.min(shortestWait, room.retryInMs);
          log({ event: "provider_skipped", provider: link.provider.name, reason: room.reason });
          continue;
        }

        // Leave time for the next provider that could still answer (see FINAL_RESERVE_MS).
        let attempt: AbortController | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (req.deadline !== undefined && links.slice(i + 1).some(hasRoom)) {
          const allowed = req.deadline - performance.now() - timing.finalReserveMs;
          if (allowed < timing.minAttemptMs) {
            log({ event: "provider_skipped", provider: link.provider.name, reason: "keeping time for the fallback" });
            continue;
          }
          attempt = new AbortController();
          timer = setTimeout(() => attempt!.abort(), allowed);
        }
        const signal = attempt ? AbortSignal.any([req.signal, attempt.signal]) : req.signal;

        const reservation = link.guard?.reserve(tokens);
        try {
          const completion = await raceSignal(link.provider.complete({ ...req, signal }), signal);
          const u = completion.usage;
          if (reservation) link.guard!.settle(reservation, u.inputTokens + u.cacheReadTokens + u.outputTokens);
          return completion;
        } catch (err) {
          // The caller (or the harness budget) cancelled: stop, don't fail over.
          if (req.signal.aborted) throw err;
          if (!(err instanceof ProviderError) || !FAILOVER_KINDS.has(err.kind)) throw err;
          const wait = err.retryAfterMs ?? DEFAULT_COOLDOWN_MS[err.kind] ?? 30_000;
          link.guard?.cooldown(wait);
          shortestWait = Math.min(shortestWait, wait);
          lastError = err;
          log({ event: "provider_failover", provider: link.provider.name, kind: err.kind });
        } finally {
          clearTimeout(timer);
        }
      }

      // Every provider was tried and failed: surface the real failure (502/503 drive degraded mode).
      if (!skipped && lastError) throw lastError;
      if (shortestWait === Infinity) throw lastError ?? new ProviderError("quota_day");
      throw new ProviderError("quota_minute", { cause: lastError ?? undefined, retryAfterMs: shortestWait });
    },
  };
}
