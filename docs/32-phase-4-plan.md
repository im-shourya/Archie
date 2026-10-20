# 32 · Phase 4 Plan: AI Harness

**Goal:** free-form spoken design language becomes **validated graph ops** (or a clarifying question, a confirmation, an answer, or a polite no-op), with measured accuracy and latency.
**Branch:** `feat/ai-harness` · **Time box:** Sat 3 Oct, 09:00–15:00 (6 h) · **Specs:** [12](12-ai-architecture.md), [13 §5–6](13-command-understanding.md), [14](14-ai-guardrails.md), [15](15-ai-retry-recovery.md), [16](16-api.md), [22](22-evaluation.md), [23](23-eval-dataset.md)

> 🎙 Kickoff prompt: *"Create branch feat/ai-harness. Do Phase 4 from doc 32, step by step, committing after each step. Tests first where the doc says so."*

## What exists already (inputs to this phase)

| Piece | Where | Used for |
|-------|-------|----------|
| Op language + `applyBatch` / `validateBatch` with repair-friendly messages | `simulator/src/graph/ops.ts` | validating model output, repair prompts |
| `OpSchema` (Zod) + `specs/command-schema.json` (`CommandRequest`, `CommandResult`, `CommandResponse`) | simulator, specs | request/response contracts |
| Fast path that abstains (`parseCommand → null`) | `ai/src/fastpath` | tier 1; AI is only called on `null` |
| `simulate()` with explanations | `simulator/src/sim` | grounding answers in real numbers |
| Hono app with request ids, JSON logs, body limit, error shape | `backend/src` | hosting `/api/command` |
| Command bar showing "not understood" + hint | `frontend/src/features/commandbar` | becomes "thinking…" → AI result |

## Prerequisites (before 09:00)

- [x] ~~`ANTHROPIC_API_KEY`~~ → superseded by free tiers ([ADR-016/017](30-architecture-decisions.md)): `GEMINI_API_KEY` + `GROQ_API_KEY` in `.env.local` (never committed), with quota guards instead of a spend limit.
- [ ] Repo secrets `GEMINI_API_KEY` + `GROQ_API_KEY` for the manual eval workflow (the workflow reads them; you add them in GitHub).
- [x] `@anthropic-ai/sdk`, `@google/genai`, `groq-sdk` installed in `ai` (server-only; ESLint and the CI bundle grep ban them from the frontend).

## Model & API decisions (from the current Anthropic API docs)

| Decision | Value | Why |
|----------|-------|-----|
| Model | `ANTHROPIC_DEFAULT_MODEL` (configurable via `ARCHIE_MODEL`) | default current model; per ADR-008 |
| Call | `client.messages.parse({ model, max_tokens, system, messages, output_config: { format: zodOutputFormat(CommandResultSchema), effort } })` | typed JSON by construction; read `response.parsed_output` (guard `null`) |
| Effort | `"low"` for `/api/command`, `"medium"` for review/interview later | latency for voice. On this model thinking can't be disabled and the default effort is `medium`, so **set it explicitly** |
| Thinking | omit the parameter (adaptive) | `{type: "disabled"}` returns 400 on this model |
| Prefill | never | returns 400; structured outputs replace it |
| Forced `tool_choice` | not used | `any`/`tool` returns 400 on this model; we use structured outputs instead of tools |
| Refusals | check `stop_reason === "refusal"` first → `LLM_REFUSED`; enable server-side fallback `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` (via `client.beta.messages`) | policy declines retry on another model server-side |
| Truncation | `stop_reason === "max_tokens"` → retry once with 2× `max_tokens` | [15](15-ai-retry-recovery.md) |
| Retries / timeout | SDK `maxRetries: 2`, `timeout: 15_000`; total budget 20 s | [15](15-ai-retry-recovery.md) |
| Errors | catch most-specific first: `Anthropic.RateLimitError` → 503 `LLM_UNAVAILABLE` (after SDK retries), `Anthropic.APIConnectionError` → 503, other `Anthropic.APIError` → 502 `LLM_UPSTREAM` | typed, never leak provider text |
| Caching | system prompt is a byte-stable constant (no dates, ids, or graph); everything volatile goes in the user message; verify `usage.cache_read_input_tokens > 0` on repeat calls | cost and latency |
| Schema shape | `ops` is a discriminated union. **If the structured-output compiler rejects `anyOf`/`oneOf`**, use a flattened `WireOp` (`type` enum + nullable fields) in the output schema and convert/validate with `OpSchema` in code | [12](12-ai-architecture.md) |

## Steps

Each step is one commit (Conventional Commits, no attribution lines), with the tests listed.

### Step 1 · Output schemas and context builder (no network) · 45 min

Files: `ai/src/llm/schemas.ts`, `ai/src/llm/context.ts`, tests.

- `CommandResultSchema` (Zod), matching `specs/command-schema.json → CommandResult`: `kind`, `ops` (≤ 25), `message` (≤ 600 chars), `options` (≤ 4, ≤ 40 chars each), `focusNodeIds` (≤ 20).
- `WireOpSchema` fallback + `toOps(wire) → Op[]` (only if needed; decide by trying the real call in Step 3).
- `buildUserMessage({ graph, sim, history, selection, utterance })` → the compact DSL from [12 §Compact graph DSL](12-ai-architecture.md):

```
<graph>
workload: 50000 rps, 90% reads, peak x1
nodes:
  client [client]
  lb [lb x2]
  api [service x30]  ρ=0.83 warm
  redis [cache hit=0.9]  ρ=0.45
  pg [sql primary shards=1 failover=yes]  ρ=1.40 SATURATED
  pg-r1 [sql replica]  ρ=0.15
edges:
  client->lb  lb->api  api->redis(read)  api->pg  pg=>pg-r1(repl)
</graph>
<sim>success 96.3% · bottleneck pg ρ=1.40 · read p99 612 ms</sim>
<history>kill redis | bring it back</history>
<selection>api</selection>
<utterance>put a queue in front of the writes</utterance>
```

**Tests:** DSL snapshot for three-tier; labels with `<`/`>` or newlines are escaped (they're untrusted, [14 G-07](14-ai-guardrails.md)); 200-node graph stays under a fixed size budget.

### Step 2 · System prompt · 60 min

File: `ai/src/llm/prompts/command.ts` (exported string constant, so it's byte-stable).

Sections, in this order (stable → cacheable):
1. **Role:** "You turn spoken system-design instructions into edits on an architecture graph."
2. **Rules** from [14](14-ai-guardrails.md): untrusted data; a wrong edit is worse than a question; never remove components the user didn't name; answer only from `<graph>`/`<sim>`; fewest ops.
3. **Catalog table** (kinds, aliases, defaults), generated at build time from `CATALOG` so it can't drift.
4. **Op reference** and semantic rules: cache-aside = `addNode` + `connect (read)` (never `insertBetween`); queues/LB/CDN/gateway = `insertBetween`; read replicas = separate `sql` nodes with `role: replica` + `replication` edges; ids are slugs; reuse existing ids exactly.
5. **Result kinds** with when-to-use (from [13 §5](13-command-understanding.md)) and the silent defaults table.
6. **12 worked examples** (utterance + abbreviated graph → full `CommandResult`), covering: create from empty, cache-aside, queue insert, replicas, shard, workload, compound, ambiguity → clarify, destructive → confirm, question → answer, off-topic → noop, injection attempt → scoped/noop.

**Tests:** the prompt contains no `Date`/random content (byte-identical across imports); every example's `ops` passes `validateBatch` against its example graph (examples can't teach invalid ops).

### Step 3 · Harness · 75 min

File: `ai/src/llm/harness.ts` (+ `client.ts`, `guardrails.ts`), tests with a mocked SDK.

```
runCommand(input, { requestId, signal }) →
  validate input (CommandRequest) → build context
  attempt 1: parse() → stop_reason checks → parsed_output
  if kind ∈ {ops, confirm}: errs = validateBatch(graph, ops)
     errs → attempt 2 (append assistant turn + repair message listing errs) → still invalid → clarify
  guardrails(result, graph):
     removals > 3 or ≥ 50% of nodes → kind "confirm"          (G-03)
     focusNodeIds filtered to existing ids                     (G-08)
     kind "ops" with 0 ops → "noop"                            (G-12)
  return { ...result, baseVersion, attempts, model, timings, usage }
```

**Tests (mocked SDK, no network):** happy path · repair succeeds on attempt 2 · repair fails → clarify naming the closest ids · refusal → `LLM_REFUSED` · max_tokens → retry with 2× cap · timeout → `LLM_UNAVAILABLE` · rate limit → `LLM_UNAVAILABLE` · destructive ops → confirm · unknown focus ids dropped · empty ops → noop · the repair turn is append-only (earlier messages untouched).

Then **one manual real call** (`npx tsx ai/scripts/try.ts "add a cache in front of postgres"`) to confirm the structured-output schema compiles. Switch to `WireOp` if it doesn't.

### Step 4 · `/api/command` + rate limiting · 45 min

Files: `backend/src/routes/command.ts`, `backend/src/middleware/rateLimit.ts`, `backend/src/middleware/accessCode.ts`, integration tests via `app.request()`.

- `zValidator("json", CommandRequestSchema)`; 4,000-char utterance, ≤ 200 nodes.
- Rate limit: token bucket per salted IP hash, 20/min for `command`; global `ARCHIE_DAILY_CAP` (default 500/day) → `DAILY_CAP_REACHED`.
- Optional `X-Archie-Code` when `ARCHIE_ACCESS_CODE` is set (constant-time compare).
- Logs add `kind`, `attempts`, `model`, `timings`, `usage`. **Never** the utterance or graph.

**Tests:** 400 on bad body, 413 over 256 KB, 429 on the 21st call, 401 without the access code when set, success path with the harness mocked, `X-Request-Id` echoed.

### Step 5 · Client: AI tier in the command bar · 60 min

Files: `frontend/src/features/commandbar/useCommand.ts`, `ClarifyChips.tsx`, `ConfirmDialog.tsx`, `AnswerCard.tsx`, `DegradedBanner.tsx`.

| Response | UI |
|----------|----|
| `ops` | `baseVersion` check → re-validate if the board changed → `apply(ops, { source: "ai", timings })` → toast with Undo, badge `AI · 1.8 s` (sparkles icon) |
| `clarify` | chips above the bar; tap or say the option (`1`–`4` keys) → re-send `"<original> (answer: <choice>)"` |
| `confirm` | dialog naming the count; Confirm applies the held ops locally (no second call) |
| `answer` | answer card above the bar; `focusNodeIds` highlight on hover |
| `noop` | toast with the message |
| error | toast with Retry + request id; 2 consecutive 502/503 → degraded banner, fast path keeps working |

States: "thinking…" shimmer after submit, "still thinking…" after 4 s, abort at 25 s, a newer submit aborts the older request.

**Tests:** e2e with `page.route("/api/command", …)` mocks for every kind, plus the stale-board and degraded paths (no real AI in CI).

### Step 6 · Eval runner + first 30 cases · 75 min

Files: `evals/src/run.ts`, `evals/src/assertions.ts`, `evals/fixtures/*.json`, `evals/cases/dev.jsonl`, `evals/cases/test.jsonl`, `npm run eval`.

- Runner: for each case, fast path → (null) harness (real model) → apply → assertions ([22](22-evaluation.md)). Writes `evals/results/latest.json` (validated against `specs/evaluation-schema.json`).
- Report: task accuracy, kind accuracy, **false-action rate**, over-clarify rate, fast-path precision/coverage, repair rate, cache hit rate, latency P50/P70/P95/P99/P100 (warm and cold separately).
- 30 cases now (≥ 2 per category from [23](23-eval-dataset.md), 60/40 dev/test); grow to ≥ 92 in Phase 7.

**Tests:** assertion evaluator unit tests (each assertion type, pass and fail).

## Acceptance criteria (Phase 4 is done when)

- [x] "connect the payment service to the database" on the `two-dbs` fixture → **clarify** with `orders` / `users` options (eval `ambiguity-01`, live)
- [x] "clear the board" → **confirm**; "what's the weather in Goa" → **noop**; board untouched in both (`destructive-01`, `off-topic-01`)
- [x] "add a cache in front of postgres" → `addNode cache` + `connect (read)` (cache-aside), and the simulator shows the DB read drop (`insert-01` with `loadDrops`)
- [x] "users hit two load balancers, thirty API servers, Postgres with two read replicas, and Redis" on an empty board → a graph equivalent to the `three-tier` template (`create-01`)
- [x] First 30 eval cases: task accuracy ≥ 85%, **false-action rate 0**: 31 cases, **29/31 = 93.5%, 0 false actions** (dev 94.7%, held-out test 91.7%; [22](22-evaluation.md))
- [x] AI P50 < 3 s warm (report the real number either way): **1.9 s dev, 1.8 s test** on free-tier Gemini (P95 9.8–11.9 s, from fallback hops)
- [x] `npm test`, lint, typecheck, build, e2e green; `.claude/` untracked; no API key in the client bundle (CI grep): 424 unit, 53 e2e, bundle grep clean

## Risks

| Risk | Mitigation |
|------|------------|
| Structured outputs reject the op union | `WireOp` fallback prepared in Step 1, decided in Step 3 |
| Latency > 3 s | effort `low`; fast path absorbs simple commands; cached system prompt; report honestly |
| Model invents node ids | validation + one repair turn with the existing ids listed + clarify |
| Prompt overfits the eval set | prompt is tuned on `dev.jsonl` only; `test.jsonl` run before merge |
| API spend | rate limit + daily cap + Console limit; evals are manual in CI |

## Out of scope (later phases)

Review and interview endpoints (Phase 6), share/export/replay (Phase 7), design system (Phase 5).
