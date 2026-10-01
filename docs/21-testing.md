# 21 · Testing

## Pyramid

```
            ┌───────────────┐
            │  E2E (few)    │  Playwright: core flows, AI mocked
          ┌─┴───────────────┴─┐
          │  Evals (real AI)  │  accuracy + latency, see 22–24
        ┌─┴───────────────────┴─┐
        │ Integration / contract │  backend routes, specs ↔ Zod
      ┌─┴───────────────────────┴─┐
      │ Unit + golden + property   │  simulator, fastpath, ops, database
      └───────────────────────────┘
```

## Unit tests (Vitest, colocated `*.test.ts`)

| Package | What | Key cases |
|---------|------|-----------|
| simulator/graph | `applyBatch`, `validate`, ids | atomicity, input never mutated, every error code, batch-local references (undo is snapshot-based, ADR-011) |
| simulator/sim | propagation, queueing, failures, Monte Carlo | **golden**: `three-tier-50k`, `three-tier-sharded`, `write-queue`, `cache-down`, `primary-failover`, `lb-reroute`; determinism |
| simulator/interview | `sloChecks` | hand-computed pass/fail per check |
| ai/fastpath | normalize, grammar, resolve | number words, aliases, pronouns, **returns null on ambiguity/leftovers/compounds** |
| ai/llm | harness with a mocked SDK | repair path, max_tokens retry, refusal, timeout → typed errors, guardrail conversions |
| database | repo (fake-indexeddb), share codec, migrations | round-trip, corrupt record skipped, size cap, v1 fixture |

### Property tests (fast-check)

- Simulator: conservation at routing nodes; ρ monotonic in rps; no NaN/Infinity in the output.
- Fast path never throws on arbitrary strings.

## Integration & contract tests (`tests/integration`, `tests/contracts`)

- Hono app via `app.request()` with the Claude SDK mocked: validation errors, 413, rate limiter (21st call → 429), access code, error mapping, `X-Request-Id`.
- **Contracts:** every fixture in `specs/fixtures/` validates against **both** the JSON Schema (`ajv`) and the Zod schema. Schema drift fails CI.

## E2E (`tests/e2e`, Playwright, Chromium + mobile viewport)

| Spec | Flow |
|------|------|
| `board.spec.ts` | new board → template → fast-path commands → sim colours → undo → reload persists (NFR-017) |
| `ai.spec.ts` | `/api/command` mocked by route interception: ops / clarify chips / confirm / noop / answer |
| `degraded.spec.ts` | API returns 503 ×2 → banner; fast path still works (NFR-016) |
| `share.spec.ts` | share → open in new context → read-only → Duplicate |
| `a11y.spec.ts` | axe on Home, Board, Evals; keyboard-only flow; reduced motion (NFR-012/014) |
| `mobile.spec.ts` | 360 px viewport: bottom sheet, command bar usable (NFR-013) |

## Security tests

CI bundle grep for `sk-ant` / `ANTHROPIC` in `.next/static`, gitleaks, `npm audit --audit-level=high`, and a test that `ai/llm` imports in the frontend fail lint.

## Performance tests

`bench:fast`, `bench:sim`, `bench:layout`; see [24](24-latency-benchmark.md). CI fails if a P95 regresses > 50% vs `evals/results/latest.json`.

## Coverage targets

| Package | Lines |
|---------|-------|
| simulator | ≥ 90% |
| ai/fastpath | ≥ 90% |
| ai/llm | ≥ 80% |
| database | ≥ 80% |
| backend | ≥ 80% |
| frontend | e2e-driven; no line target |

## CI (`.github/workflows/ci.yml`)

`install → lint → typecheck → unit → integration/contracts → build → bundle-secret-grep → e2e (AI mocked)`. Evals with real AI run **manually** (`workflow_dispatch`) with the key from repo secrets, to avoid spending on every push.
