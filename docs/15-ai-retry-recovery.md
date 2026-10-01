# 15 · AI Retry & Recovery

The harness (`ai/src/llm/harness.ts`) wraps every AI route: **structured I/O, bounded retries, a repair loop, typed errors, timings**.

## Harness algorithm

```
run(task, input, { requestId }):
  t0
  ctx = buildContext(task, input)                       # contextMs
  attempt = 1
  loop:
    res = callClaude(ctx)                               # SDK: maxRetries 2, timeout 15 s
    check stop_reason:
      refusal     → throw LLM_REFUSED                   # after server-side fallback
      max_tokens  → if not yet: retry with 2× max_tokens; else throw LLM_UPSTREAM
    out = res.parsed_output ?? throw LLM_UPSTREAM("unparseable")
    errs = validate(task, out, input.graph)             # validateBatch for ops
    if errs.empty → break
    if attempt == 2 → out = toClarify(errs); break
    ctx.messages.append(assistant: res.content, user: repairMessage(errs))   # append-only
    attempt++
  out = guardrails(out, input)
  return { ...out, attempts: attempt, timings, model, usage }
  # total wall-clock budget 20 s → LLM_UNAVAILABLE
```

### Repair message

```
Your ops failed validation. Fix them and return a complete CommandResult.
- op 2 (connect): node "postgres" not found. Existing sql nodes: "pg", "orders-db".
- op 4 (replicate): replicas 5000 out of bounds (1..1000).
Return the corrected full list of ops, not a diff.
```

## Retry layers

| Layer | What | Limit |
|-------|------|-------|
| SDK | 408/409/429/5xx + connection errors, exponential backoff | 2 retries |
| Harness | `max_tokens` truncation | 1 retry with a 2× cap |
| Harness | validation repair | 1 repair turn |
| Server-side | refusal fallback to another model (`fallbacks: "default"`) | handled by the API |
| Client | user taps **Retry** on the error toast | manual |

Total wall-clock budget per request: **20 s**. The client shows a "still thinking…" state after 4 s and cancels at 25 s (AbortController).

## Provider fallback and quotas (ADR-017)

Each model turn goes through a chain: a ladder of **Gemini** models (free quotas are per model: `gemini-2.5-flash` → `3.5-flash-lite` → `3.5-flash` → `3.8-flash`; one attempt each, 10 s timeout) → **Groq** `openai/gpt-oss-120b` (free; strict JSON schema). A per-day 429 cools a model down until Pacific midnight.

```
for provider in chain:
  guard has no room (rpm/tpm/rpd/tpd or cooldown)?  → skip, don't spend a request
  call → 429 / 5xx / timeout / network?             → cooldown (Retry-After or 30–60 s), try next
       → bad request / refusal                      → surface as-is (a bug, not an outage)
all skipped for the minute → RATE_LIMITED + Retry-After · all out for the day → DAILY_CAP_REACHED
all tried and failed       → the real failure (502/503, counts toward degraded mode)
```

The repair turn goes through the same chain, so it can be served by the fallback. Responses report the model that actually answered.

## Error mapping (backend → client)

| Source | Error code | HTTP | Client behaviour |
|--------|-----------|------|------------------|
| Zod request validation | `VALIDATION_ERROR` | 400 | dev bug: toast + console |
| Body too large | `PAYLOAD_TOO_LARGE` | 413 | "Board too large for AI (≤ 200 nodes)" |
| `stop_reason: refusal` | `LLM_REFUSED` | 422 | "I can't help with that one." |
| Our rate limiter | `RATE_LIMITED` | 429 + `Retry-After` | countdown toast |
| Every provider's free quota full this minute (quota guard, ADR-017) | `RATE_LIMITED` | 429 + `Retry-After` | countdown toast |
| Daily cap, or every provider's free quota used for the day | `DAILY_CAP_REACHED` | 429 | degraded-mode banner |
| `Anthropic.RateLimitError` after retries | `LLM_UNAVAILABLE` | 503 | toast + Retry |
| `Anthropic.APIConnectionError` / timeout | `LLM_UNAVAILABLE` | 503 | toast + Retry |
| other `Anthropic.APIError` | `LLM_UPSTREAM` | 502 | toast + Retry |
| anything else | `INTERNAL` | 500 | toast; logged with requestId |

Errors are caught most-specific-first. Raw provider messages are **never** returned to the client (they're logged server-side with the requestId).

## Degraded mode (NFR-016)

If 2 consecutive AI calls fail with 502/503 (or the cap is reached):

- Banner: *"AI is unavailable. Local commands, simulation, undo and export still work."*
- The command bar keeps the fast path. Fast-path misses show *"I need the AI for that one. Try a simpler command like 'kill redis'."*
- `/api/health` is polled every 30 s and the banner clears on recovery.

## Client-side recovery

| Situation | Recovery |
|-----------|----------|
| Response arrives after the board changed | Re-validate; apply or ask to repeat (FR-035) |
| User submits again while waiting | Previous request aborted; latest wins |
| Tab hidden mid-request | Result still applied on return; toast queued |
| Apply throws (should be impossible after validation) | Caught; board state untouched; error logged with the event payload |
