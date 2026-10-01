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

export function createChain(links: readonly ChainLink[], log: (event: Record<string, unknown>) => void = () => {}): LlmProvider {
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

      for (const link of links) {
        const tokens = estimateTokens(chars, link.outputAllowance * req.tokenScale);
        const room = link.guard?.check(tokens) ?? { ok: true as const };
        if (!room.ok) {
          skipped = true;
          if (room.scope !== "day") shortestWait = Math.min(shortestWait, room.retryInMs);
          log({ event: "provider_skipped", provider: link.provider.name, reason: room.reason });
          continue;
        }
        const reservation = link.guard?.reserve(tokens);
        try {
          const completion = await link.provider.complete(req);
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
        }
      }

      // Every provider was tried and failed: surface the real failure (502/503 drive degraded mode).
      if (!skipped && lastError) throw lastError;
      if (shortestWait === Infinity) throw lastError ?? new ProviderError("quota_day");
      throw new ProviderError("quota_minute", { cause: lastError ?? undefined, retryAfterMs: shortestWait });
    },
  };
}
