# 26 · Monitoring & Observability

Small app, single maintainer: keep it to structured logs + health + the eval harness. No paid APM.

## Structured logs (backend)

One JSON line per request (`backend/middleware/logger.ts`) to stdout → Vercel logs:

```json
{"ts":"2026-10-04T10:12:03.120Z","level":"info","requestId":"7f3c…","route":"POST /api/command",
 "status":200,"kind":"ops","attempts":1,"tier":"ai","model":"gemini-2.5-flash",
 "timings":{"contextMs":2,"llmMs":1640,"validateMs":1,"totalMs":1650},
 "usage":{"input":612,"cacheRead":5980,"output":214},"nodes":8,"ops":3,"ipHash":"a91e…"}
```

**Never logged:** utterance text, graph contents, labels, raw IPs (salted hash only), access codes, API keys (T-09).

Levels: `error` (5xx, unexpected), `warn` (429, repair failed → clarify, refusal), `info` (one per request), `debug` (local only: prompts/outputs **only** in local dev).

## Correlation

The client generates `X-Request-Id` (uuid) per command, logs it in the browser console on errors, and shows it in error toasts ("ref 7f3c"). The backend echoes it and logs it, so a user report can be traced to one log line.

## Health

`GET /api/health` → `{ ok, llm: "configured" | "missing-key", model, version: <git sha> }`. Never calls the LLM. The client polls it during degraded mode.

## Metrics to watch (from logs)

| Metric | Source | Alert / action |
|--------|--------|----------------|
| AI error rate (5xx) | `status >= 500` | > 10% over 15 min → check the Anthropic status page, consider degraded banner |
| 429s (ours) | `status == 429` | spike → possible abuse → enable access code |
| Daily cap usage | counter | > 80% → raise cap or enable code |
| P95 `totalMs` | `timings.totalMs` | > 8 s → check repair rate, cold starts |
| Repair rate | `attempts == 2` | > 10% → prompt regression; add eval cases |
| Cache read ratio | `usage.cacheRead > 0` | < 80% → system prompt not byte-stable |
| Spend | Anthropic Console | spend limit + email alert at 50% / 80% |

For the hackathon these are checked manually (Vercel log search). A `scripts/log-summary.ts` can compute them from an exported log file.

## Client-side telemetry

None sent to any server. Local-only: the command bar keeps the last 100 command latencies in memory, and `?debug=1` shows a small latency panel (useful for the demo video).

## Simulator & AI quality monitoring

Quality is monitored **offline** via the eval harness ([22](22-evaluation.md)), not via production data (we don't store utterances).
