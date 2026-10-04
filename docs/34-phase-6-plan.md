# 34 · Phase 6 Plan: Interview, Review, SPOF, Cost

**Goal:** a candidate can pick a problem, design a system by voice against requirements the simulator checks live, answer one targeted interviewer question at a time, and finish with a scorecard. In that scorecard every pass/fail is computed by the simulator and every rubric score cites evidence. In design mode, **Review** returns ranked findings with one-click validated fixes, and every board shows its single points of failure.
**Branch:** `feat/interview` · **Time box:** Sun 4 Oct, ~9 h of work (see the step estimates) · **Specs:** [03](03-product-spec.md) (F-10, F-11, F-15), [02](02-requirements.md) (FR-027, FR-050–054), [05](05-user-flows.md) (UF-10, UF-11), [11](11-failure-model.md) (SPOF scan), [12](12-ai-architecture.md), [14](14-ai-guardrails.md) (interview and review guardrails), [16](16-api.md) (`/api/review`, `/api/problems`, `/api/interview/*`), [17](17-database.md) (board `mode` / `interview`), [06](06-ui-ux.md) + [design/frontend-design.md](design/frontend-design.md) (every new screen)

> 🎙 Kickoff prompt: *"Create branch feat/interview. Do Phase 6 from doc 34, step by step, committing after each step. Tests first where the doc says so. UI follows docs/design/frontend-design.md."*

**Done when (doc 29):** the scorecard works end to end, from problem picker to a saved scorecard, with the AI mocked in e2e and checked live once.

## What exists already (inputs to this phase)

| Piece | Where | State |
|-------|-------|-------|
| Simulator: `simulate(graph)`, exact success rate, seeded Monte Carlo p50/p95/p99, cost, bottleneck, explanations | `simulator/src/sim/*` | ✅ Phase 3. Pure and fast (P95 2.3 ms @ 100 nodes), so 200 what-if runs fit in < 1 s |
| Failure model: `fail` / `recover` ops, failover, blast radius | `simulator`, `MetricsPanel.tsx` | ✅. The SPOF scan is "run it once per node" |
| Cost estimate (FR-028) | `SimResult.costMonthly`, Metrics panel | ✅ Done. This phase adds the per-component cost and a budget check |
| AI harness: provider chain (Gemini ladder → Groq), quota guards, 20 s budget, structured output, repair turn, typed errors | `ai/src/llm/*` | ✅ Phase 4. **Command-specific**: `runCommand` owns both the plumbing and the command logic |
| API: `accessCode → rateLimit(perMinute) → zValidator → harness`, daily cap, request ids | `backend/src/routes/command.ts`, `middleware/*` | ✅. New routes reuse the same pipeline |
| Contracts for `/api/review`, `/api/problems`, `/api/interview/turn`, `/api/interview/score` | `specs/openapi.yaml`, doc 16 | Written, **not implemented** |
| Board document fields `mode`, `problemId`, `interview` | `database/src/schema.ts` | In the schema (`interview: z.unknown()`), **unused** |
| `EventSource` value `review-fix` | `simulator/src/graph/events.ts` | Exists; History already labels it "review fix" |
| Side panel tabs, bottom sheet, Inspector, toasts with Undo, live regions, axe gate | `features/board/*`, `features/inspector/*` | ✅ Phase 5. New panels plug into the same tab bar and sheet |
| Bundle | `npm run bundle:size`, CI ratchet 320 KB | `/b/[id]` = 318.7 KB. **Only 1.3 KB of headroom** (see Decisions → Bundle) |

## Prerequisites (before starting)

- [x] `main` is up to date, with Phase 5 merged (#8).
- [x] No new runtime dependencies. TTS uses the browser's `speechSynthesis`; the SPOF worker uses the same Worker pattern as the ELK layout.
- [x] Free-tier quota is untouched by tests: every AI path in unit tests and e2e is mocked. The live checks are budgeted (see Quota budget).
- [x] Read [design/frontend-design.md](design/frontend-design.md) §4–§7 before Step 6.

## Decisions

| Decision | Value | Why |
|----------|-------|-----|
| Who decides pass/fail | `sloChecks()` in the simulator package, pure and deterministic. The LLM never sees a "pass" it could flip; it receives the checks as read-only context | FR-051 and guardrail "SLO pass/fail is never decided by the LLM" (doc 14) |
| Problem solvability | Every problem ships a **reference design** (a list of ops, applied in batches of 25). A golden test asserts it passes every check, and that the empty board fails every check. Targets are calibrated to the simulator: a 20 ms service tier has a p99 near 180 ms at ρ 0.5 (M/M/1 tail), so read targets of 100 ms would be unreachable. Built and measured: every reference fits in one batch (7–14 ops) and costs $1,020–$11,570/mo; targets sit about 1.2–1.3× above the reference's p99 and about 1.4× above its cost | Requirements tuned by hand drift; a test that a solution exists catches impossible problems |
| SPOF semantics | **Revised while building Step 1 (measured).** A single failure is **losing one instance**, as in doc 11 ("kill one API server" = `replicas − 1`): a component with replicas ≥ 2 loses a replica, and a single-instance component goes down entirely (SQL failover still applies). It is a SPOF when that loses **≥ 5% of the requests that succeed today**, i.e. `(baseline − after) / baseline ≥ SPOF_DROP (0.05)`. On a healthy board that's 5 points; on a hopeless one (1% success) the loss of its only server still counts. `client` nodes are skipped. Two earlier versions failed against the simulator. (1) Doc 11's absolute "below 99%" flags every node on an overloaded board: three-tier sits at 96.3%, so even Postgres with failover (−1.0 pt) counted. (2) "Fail the whole component" flags any queue, NoSQL store or object store carrying > 5% of traffic, because compute nodes call every dependency (doc 10), so a 3-broker Kafka could never pass. Per-instance results on the templates: three-tier → only Redis (the 2 LBs and 30 API servers survive a loss); URL shortener → the single CDN, LB and datastore; chat → the single gateway, Kafka and message store, plus the chat service, whose 8 replicas can't absorb losing one (N+1) | It matches what an interviewer means by "survives any single failure", it holds on healthy and overloaded boards, and every flag has a fix the candidate can make (add an instance, add headroom, add failover) |
| Where the SPOF scan runs | A Web Worker (`spof.worker.ts`), debounced 1 s after the last change, with results keyed by graph version so stale results are dropped. The pure function `spofScan(graph)` lives in the simulator and is unit-tested | ≤ 200 sims × < 5 ms could block the main thread for 1 s |
| Harness reuse | Extract the provider-agnostic plumbing from `runCommand` into `runStructured({ task, system, user, schema, budgetMs })`: chain, quota, budget, abort, error mapping, timings and usage. `runCommand` keeps its repair turn and guardrails on top. No change to the command prompt or schemas | One place for retries, budgets and quota. The command path is protected by its existing 70+ harness tests; prompts are unchanged, so the Phase 4 eval numbers stand |
| Interview question cadence | The **first** question is deterministic (from the problem's `hints`), with no AI call. After that, a question is asked only on **Next question** or after the candidate submits an answer. Never automatically on board edits. Max **8 AI turns** per interview; then the panel suggests Finish | Free tier is ~19 requests/day per Gemini model. Auto-asking on every edit would burn the quota and interrupt the voice flow |
| Interview guardrails (doc 14) | The question must reference ≥ 1 existing node id **or** a failing check id. Otherwise the server substitutes the next unused hint for the weakest failing check (no second AI call). The response says `source: "ai" \| "fallback"` | A grounded question or a deterministic one, never a generic AI ramble |
| Scorecard math | `checks` come from `sloChecks()` (server-side, recomputed). `overall` = the mean of the 5 rubric scores, **computed in code**. A rubric item without evidence or without a valid node id is clamped to 3 and flagged `unsupported: true` | FR-053 and doc 14: scores must be explainable; the model can't inflate the headline number |
| Review = rules + AI | `ruleFindings(graph, sim, spofs)` (deterministic: SPOFs, saturated/hot nodes, the bottleneck, missing cache on read-heavy paths, budget overrun) always runs and is shown instantly. AI findings are merged and de-duplicated by `(nodeIds, title)`. Every AI `fix.ops` goes through `validateBatch`; invalid fixes are dropped (the finding stays without "Apply fix"). The list is sorted by severity in code and capped at 6 | Review works with the AI down (degraded mode) and costs 0 quota when the rules already cover it. The fixes use the same validation path as voice |
| Applying fixes | `apply(fix.ops, { source: "review-fix", utterance: null })`, the Undo toast, then the finding is marked resolved; the review re-runs rules locally (no AI call) | One validation path; undo works for free; History shows "review fix" |
| Persistence | `board.mode = "interview"`, `board.problemId`, `board.interview = { startedAt, transcript: Turn[], turnsUsed, scorecard? }`. `interview` gets a real Zod schema (replacing `z.unknown()`), with a migration that treats old `null` as design mode | Interviews survive reload; the scorecard is kept with the board (doc 17) |
| Workload in interview mode | Starting a problem applies `setWorkload({ rps: peakRps, readRatio, peakMultiplier: 1 })` as the board's first event (`source: "template"`). The candidate can change the workload, but the checks always evaluate **at the problem's peak** (a copy of the graph with the problem's workload) | The requirements set the load (F-10). Editing the workload can't make a check pass |
| TTS | `speechSynthesis`, toggled in the panel (persisted setting `interviewVoice`, default on). Speech stops when the answer box gets focus or the mic starts listening | Optional read-aloud (FR-052) that never talks over the candidate's dictation |
| Bundle | Interview, review and scorecard UI are `next/dynamic` imports, loaded only in interview mode or when Review opens. `spofScan` runs in a worker chunk. **Step 0** (`zod/mini` for client-side validation) is recommended first: it frees about 85 KB and turns the 320 KB ratchet back into the real 300 KB budget | Phase 6 adds client code against 1.3 KB of headroom. Phase 5 showed that lazy-loading small panels saves little, so the real fix is zod |
| Top-bar actions | Desktop: **Review** (design mode) or **Finish** (interview mode). Under 768 px they move into a **⋯ menu** (cut in Phase 5 because nothing needed it; now needed) | doc 06 · Layout and Responsive |
| `/design` style guide | A static route rendering the real tokens and components in both themes (spec: design doc §8). `noindex`, linked from the footer | One page where reviewers and the axe gate see every component state |

## Quota budget (free tier)

| Use | Calls | Notes |
|-----|-------|-------|
| Unit tests, e2e, CI | **0** | Mocked providers and `page.route` |
| One interview session | ≤ 8 turns + 1 score = **≤ 9** | First question is deterministic; Next question only on demand |
| One review | **≤ 1** | 0 when the AI is degraded (rules only) |
| Live smoke checks in this phase | ≤ **12** total | `ai/scripts/try-interview.ts` (2 turns + 1 score) and `try-review.ts` (1 review), run on two problems |
| Rate limits | `/api/interview/*` 10/min/IP, `/api/review` 5/min/IP | Same token buckets and daily cap as `/api/command` |

## Steps

Each step is one commit (Conventional Commits, no attribution lines), with the tests listed. **Tests first** where a step says so.

### Step 0 · Bundle headroom: `zod/mini` on the client · 90 min · recommended, first to cut

Files: `simulator/src/graph/{types,ops,events}.ts`, `database/src/{schema,share}.ts`, plus the places that use classic-only methods (`.extend`, `.shape`, `.safeParse` stay available in mini via `z.safeParse(schema, x)`).

- Move the schemas the browser executes to `zod/mini`. The server-only AI wire schemas (`ai/src/llm/schemas.ts`) stay on classic zod, which they need for structured output.
- The Inspector's bound lookup (`minValue`/`maxValue`) moves to a small exported `PROP_BOUNDS` table derived once from the schemas, so the UI keeps one rulebook.
- Lower the CI ratchet to `--budget-kb 300`.

**Tests:** the existing 431 unit/contract tests (schema parity with `specs/` must stay green), `npm run eval -- --fastpath-only` (no quota), the e2e suite, and `bundle:size` < 300 KB. **Live check:** 3 `/api/command` calls (clarify, ops, answer) to prove the wire format is unchanged.
**If cut:** keep the 320 KB ratchet and rely on `next/dynamic` for the Phase 6 panels; record the number.

### Step 1 · SPOF scan (FR-027) · 60 min · tests first

Files: `simulator/src/sim/spof.ts` (+ test), `frontend/src/features/board/spof.worker.ts`, `useSpofScan.ts`, badge in `ArchNodeCard.tsx`, a section in `MetricsPanel.tsx`.

- `spofScan(graph): { id, successRate, drop }[]`, sorted by `drop` (largest first). Up nodes only, `client` skipped, at most `MAX_NODES` sims. It reports elapsed ms for the bench.
- Worker protocol `{ version, graph } → { version, spofs, ms }`. The hook ignores results for an older version and debounces 1 s.
- UI: a SPOF badge on the node card (icon + "SPOF" text, `aria-label` "single point of failure"), Metrics section **Single points of failure** ("Redis · success → 54.5% if it fails"), and the Inspector line "If this fails: success 96.3% → 54.5%".

**Tests (first):**
- Unit (measured): three-tier → only `redis` (−41.7); `pg` with `failover: false` becomes one. URL shortener → `cdn`, `lb`, `links`. Chat → `gateway`, `chat` (N+1: −6.7 with 8 replicas; 12 replicas clears it), `kafka`, `messages`. `client` is never listed. Parallel paths → empty list.
- Property test (fast-check): every reported SPOF loses ≥ 5 points when one instance fails; every non-reported up node loses < 5.
- Bench: `bench:sim` gains `spofScan @ 100 nodes` (target P95 < 600 ms).
- e2e: three-tier shows SPOF badges on exactly `lb`, `api` and `redis`; "Shard Postgres into two" doesn't change them; recovering redundancy removes a badge.

### Step 2 · Problem bank + `sloChecks` (FR-050, FR-051) · 75 min · tests first

Files: `simulator/src/interview/problems.ts`, `checks.ts` (+ tests), `index.ts` exports; `backend/src/routes/problems.ts` (`GET /api/problems`, static, cacheable).

Problem shape:

```ts
interface Problem {
  id: "url-shortener" | "news-feed" | "chat" | "rate-limiter" | "ride-dispatch" | "video-streaming";
  title: string;               // "Design a news feed"
  difficulty: "easy" | "medium" | "hard";
  brief: string;               // 2–3 sentences, read aloud as the first question's preamble
  requirements: { dau: number; peakRps: number; readRatio: number; p99Ms: number; p99WriteMs: number;
                  availability: number; monthlyBudget: number };
  hints: string[];             // ≥ 6 deterministic questions, each tagged with the check it probes
  reference: Op[];             // a design that passes every check (golden-tested)
}
```

Starting requirements (calibrated in this step against the reference designs and adjusted if the golden test says otherwise):

| Problem | Difficulty | Peak rps | Reads | p99 read / write | Availability | Budget / mo |
|---------|-----------|---------:|------:|-----------------:|-------------:|------------:|
| URL shortener | easy | 40,000 | 95% | 100 / 250 ms | 99.9% | $6,000 |
| Rate limiter | easy | 200,000 | 50% | 20 / 20 ms | 99.99% | $8,000 |
| Chat | medium | 60,000 | 60% | 150 / 300 ms | 99.9% | $12,000 |
| News feed | medium | 120,000 | 98% | 200 / 500 ms | 99.9% | $15,000 |
| Ride dispatch | hard | 30,000 | 70% | 300 / 400 ms | 99.95% | $10,000 |
| Video streaming | hard | 250,000 | 99% | 250 / 1,000 ms | 99.9% | $25,000 |

`sloChecks(graph, problem, spofs)` evaluates a copy of the graph **at the problem's peak workload** and returns, in this order:

| id | Label | Pass when | `actual` example |
|----|-------|-----------|------------------|
| `availability` | Success ≥ 99.9% at peak | `e2e.successRate ≥ availability` | "96.3%" |
| `p99-read` | Read p99 ≤ 100 ms | `e2e.read.p99 ≤ p99Ms` | "612 ms" |
| `p99-write` | Write p99 ≤ 250 ms | `e2e.write.p99 ≤ p99WriteMs` (skipped when reads = 100%) | "1.28 s" |
| `headroom` | Every component below ρ 0.9 | `max ρ < 0.9` | "Postgres (primary) at ρ 1.40" |
| `spof` | Survives any single failure | `spofs.length === 0` | "Redis, API are SPOFs" |
| `cost` | Under $6,000/mo | `costMonthly ≤ monthlyBudget` | "$3,460/mo" |

A board with no client node fails every check with `actual: "no clients yet"`.

**Tests (first):** for each of the 6 problems, the reference design passes all checks and the empty board fails all; check order and labels are stable (snapshot); evaluating at peak ignores the board's own workload; the `spof` check uses the scan's result. Contract test: `GET /api/problems` matches `specs/openapi.yaml`.

### Step 3 · Harness refactor + `/api/interview/turn` (FR-052) · 90 min · tests first

Files: `ai/src/llm/structured.ts` (extracted `runStructured`), `ai/src/llm/interview.ts`, `ai/src/llm/prompts/interview.ts`, `ai/src/llm/schemas.ts` (`InterviewTurnRequest`, `InterviewTurnWire`, `InterviewTurnResponse`), `backend/src/routes/interview.ts`, `specs/openapi.yaml`.

- **Refactor first, as its own commit inside this step:** `runCommand` calls `runStructured`, behaviour unchanged. Every existing harness test passes unmodified.
- Request: `{ problemId, graph, transcript (≤ 20 turns, each ≤ 1,000 chars), changes (≤ 10 recent utterances) }`, Zod-validated, with the same size limits as `/api/command`.
- The server runs `simulate`, `spofScan` and `sloChecks`, then builds the user message: problem brief + requirements, `graphDsl`, `simSummary`, the checks (pass/fail + actual), SPOFs, the transcript and the recent changes. The system prompt is byte-stable (cacheable), with 6 examples: one question, aimed at the weakest point, ≤ 40 words, sayable aloud, no answers given away.
- Wire output `{ question, focusNodeIds, targetsCheck? }`. Guardrails: drop unknown node ids; if neither a valid node nor a failing `targetsCheck` remains, substitute the next unused hint for the weakest failing check (`source: "fallback"`).
- Response `{ question, focusNodeIds, checks, source, done, timings, model }`. `done` = every check passes **and** ≥ 3 candidate answers exist (the UI suggests Finish).
- Errors: the same typed `HarnessError` → HTTP mapping as `/api/command` (429, 502, 503, daily cap).

**Tests (first):** harness tests with the mocked provider: a grounded question passes through; an ungrounded question falls back to a hint; unknown ids are stripped; the 20 s budget holds when the SDK hangs; checks in the response equal `sloChecks()` even if the model output contains check-like text. Route tests: validation (400), rate limit (429), access code (401). Prompt test: the system prompt is byte-stable and contains no per-request data.

### Step 4 · `/api/interview/score` (FR-053) · 60 min · tests first

Files: `ai/src/llm/score.ts`, `prompts/score.ts`, schemas, the route in `interview.ts`.

- The wire output is the rubric only: `[{ dimension, score 1–5, evidence ≤ 300 chars, nodeIds[] }] × 5` + `summary ≤ 600 chars`. The model is told the checks; it never returns them.
- Code then: recomputes `checks`; validates that all 5 dimensions are present (a missing dimension → score 3 + `unsupported`); clamps evidence-less or unknown-node items to 3 with `unsupported: true`; sets `overall` = mean, rounded to 0.1.
- Response `{ problemId, checks, rubric, overall, summary, timings, model }`. The client stores it on the board.

**Tests (first):** the clamp rules; `overall` arithmetic; checks always come from code; a model that returns 4 dimensions or a score of 7 is repaired or clamped, never passed through; budget and error mapping are shared with Step 3.

### Step 5 · `/api/review` (FR-054) · 60 min · tests first · first AI piece to cut

Files: `simulator/src/review/rules.ts` (+ test), `ai/src/llm/review.ts`, `prompts/review.ts`, `backend/src/routes/review.ts`.

- `ruleFindings(graph, sim, spofs, requirements?)` → findings with ids like `rule:spof:redis`. Each has a fix when there is a safe default: a SPOF service → `replicate` + a second node behind the LB; a saturated SQL primary → `updateNode shards ×2`; a read-heavy path without a cache → `insertBetween` a cache; budget overrun → no fix (a judgment call).
- `/api/review` sends the board, the sim summary and the rule findings to the model, which may add up to 4 findings (`{ severity, nodeIds, title, detail, fix? }`). The server validates every `fix.ops` with `validateBatch` against the request graph, drops invalid fixes, strips unknown node ids, merges with the rule findings, de-duplicates, sorts (`high > medium > low`, then by rule before AI), and caps at 6.
- With the AI degraded or out of quota, the route returns the rule findings with `aiAvailable: false` (HTTP 200), so Review still works.

**Tests (first):** a unit test for each rule on purpose-built graphs; every rule fix applies cleanly with `applyBatch` and removes its own finding when re-run; merge/dedupe/sort/cap; an AI fix that fails validation is dropped while its finding stays; the degraded path returns rules only.

### Step 6 · Interview mode UI (UF-10) · 120 min · tests first

Files: `frontend/src/app/interview/page.tsx` (problem picker), `features/interview/{InterviewPanel,ProblemCard,SloChecklist,InterviewerTurn,AnswerBox,Transcript,useInterview,useTts}.tsx`, `interview.module.css`; the board store gains `mode`, `problem` and `interview` actions; `database` schema for `interview`; `BoardScreen` gets a fourth tab **Interview** (interview mode only, the default tab there). Layout and states follow [design/frontend-design.md](design/frontend-design.md) §5.1–§5.5.

- `/interview`: six problem cards (title, difficulty, the 4 headline requirements). Choosing one creates a board in interview mode with the problem's workload, then routes to `/b/[id]`.
- Panel: problem card (collapsible) → SLO checklist (live, from `sloChecks` on the client after every change: no network) → interviewer turn (question, focus chips, speaker toggle, Next question) → answer box (a textarea Wispr Flow dictates into; Enter sends, Shift+Enter adds a new line) → transcript.
- The checklist announces changes politely ("Read p99 now passing").
- The sheet's peek in interview mode shows "SLOs 3 of 6 passing · next: Read p99".
- The command bar keeps editing the board. The answer box is the only place that talks to the interviewer.
- AI errors reuse the Phase 4 states (thinking / still thinking / Retry / degraded). In degraded mode, the next deterministic hint is used and labelled "offline question".

**Tests (first, AI mocked):** pick "Design a URL shortener" → empty board in interview mode with all 6 checks failing and the first (hint) question shown, with no `/api/interview/turn` call made. Insert the reference ops through the store → all checks pass live. Answer → exactly one turn request, with the transcript containing the answer → the question renders with focus chips that highlight nodes. 8 turns → Next question is disabled with "Finish when you're ready". Reload keeps the transcript. Mobile: the peek shows the SLO count. The axe gate is extended to the interview states.

### Step 7 · Scorecard (UF-10 step 6) · 60 min

Files: `features/interview/Scorecard.tsx`, `scorecard.module.css`; **Finish** in the top bar (or the ⋯ menu on phones).

- Finish → confirm ("End the interview? You can keep editing the board afterwards.") → one `/api/interview/score` call → the scorecard view replaces the panel body: an overall score, a checks table (✅/❌ + actual), 5 rubric bars (1–5, with evidence and node chips; `unsupported` items marked "not enough evidence"), the summary, and actions **Copy as Markdown** and **Practice again**.
- Saved on the board; reopening the board shows the scorecard and a "Resume editing" link.
- If scoring fails, the checks still render (they're local) with "Rubric unavailable, retry".

**Tests:** e2e (mocked): Finish → scorecard with the checks matching the live checklist, 5 rubric rows, and overall = mean; an `unsupported` row shows its label; reload shows the saved scorecard; the score-error state still shows the checks. axe on the scorecard in both themes.

### Step 8 · Review panel + ⋯ menu (UF-11) · 60 min

Files: `features/review/{ReviewPanel,FindingCard,useReview}.tsx`, `review.module.css`; **Review** in the top bar; `features/board/OverflowMenu.tsx`.

- Review opens a panel (desktop: replaces the side panel body under a "Review" heading with a Close button; phones: the sheet at half). Rule findings show at once and AI findings stream in when they arrive. Each card shows severity (label + colour + icon), title, detail, node chips (hover/focus highlights) and **Apply fix** when a validated fix exists.
- Apply fix → `apply(…, { source: "review-fix" })` → Undo toast → the card turns "Resolved" and rules re-run locally.
- The ⋯ menu (`menu` button pattern, arrow keys, Escape) holds Review / Finish / Rename board on phones.

**Tests:** e2e (mocked `/api/review`): three-tier → findings sorted high → low; Apply fix on the Redis SPOF → the badge disappears and the card says Resolved; Undo brings both back; an AI finding whose fix was invalid shows no Apply button; with the AI down, rule findings still appear with "AI review unavailable". The phone ⋯ menu works by keyboard.

### Step 9 · `/design` style guide · 45 min · cuttable

Files: `frontend/src/app/design/page.tsx` + `design.module.css`, noindex metadata, a footer link. The spec is in [design/frontend-design.md](design/frontend-design.md) §8.

- Sections: brand; colour tokens (swatches read from the live CSS variables, with their WCAG contrast computed in the page against background and surface); type scale; spacing/radius/elevation; icons (all `KindIcon`s + UI icons); components in every state (node card: healthy / warm / hot / saturated / down / idle / selected / SPOF; buttons; toasts; chips; SLO checklist; finding card; rubric bar; the Inspector field with an error). A light/dark switch for previewing (`data-theme`, page-local).
- Static data only, no store, no network.

**Tests:** axe on `/design` in both themes (0 serious/critical); a unit/contract test that every `--color-*` token in `globals.css` appears on the page; `robots` disallows `/design`.

### Step 10 · Live checks, docs, visual QA · 45 min

- Live smoke (budgeted, ≤ 12 calls): `npx tsx ai/scripts/try-interview.ts url-shortener` and `news-feed` (2 turns + 1 score each), and `try-review.ts three-tier`. Record latency and the grounded/fallback ratio in the PR.
- `scripts/screenshots.ts` gains interview, scorecard and review shots; refresh the README images.
- Docs: 02 (FR-027 wording → "drops success by ≥ 5 points", FR-050–054 statuses), 03 (F-10, F-11), 06 (link the design doc; components), 11 (the relative SPOF rule and why, with the template numbers), 16 (any contract change), 31, this doc's acceptance list, CHANGELOG, README (features, results table: SPOF scan P95, interview turn latency).

## Acceptance criteria (Phase 6 is done when)

- [x] SPOF badges and the list match `spofScan`. The property test (every SPOF really loses ≥ 5 points of success, every other node < 5) passes; scan P95 < 600 ms @ 100 nodes, off the main thread (FR-027)
- [x] Six problems, each with a golden-tested reference design that passes every check; the empty board fails every check (FR-050)
- [x] The checklist updates live on every change with no network call; the server recomputes checks for turn and score; the LLM never decides pass/fail (FR-051)
- [x] One question per turn, grounded in a node or a failing check, or a labelled deterministic fallback; ≤ 8 AI turns per interview; read aloud when the speaker is on, and never over dictation (FR-052)
- [x] Scorecard: computed checks with actuals, 5 rubric rows with evidence (unsupported → clamped to 3 and labelled), `overall` computed in code, saved on the board (FR-053)
- [x] Review: ≤ 6 findings sorted by severity; every Apply fix is validated, undoable and recorded as `review-fix`; works with the AI down via rules (FR-054)
- [x] axe: 0 serious/critical on the interview panel, the scorecard, the review panel and `/design`, in light and dark, desktop and phone; the keyboard reaches every new control
- [x] Bundle: board route < 300 KB gzipped (with Step 0) or ≤ the 320 KB ratchet (without), enforced in CI
- [x] `npm test`, lint, typecheck, build, e2e and CI green; live smoke within the quota budget; docs updated

## Risks

| Risk | Mitigation |
|------|------------|
| Free-tier quota runs out mid-demo | Deterministic first question; questions only on demand; 8-turn cap; review rules need no AI; degraded mode labels offline questions. `/api/health` shows the remaining quota |
| Requirements turn out impossible for the simulator (e.g. 20 ms p99 for the rate limiter) | The golden reference-design test fails in Step 2, before any UI exists; tune the requirement and record why |
| SPOF badges feel wrong | Single failure = one instance, so 2 LB replicas are not flagged but an under-provisioned cluster is (N+1). The tooltip, the Metrics line and the Inspector say "losing one instance" |
| LLM rubric scores are arbitrary | Evidence is required, node ids are validated, unsupported items are clamped, and `overall` is computed in code. The checks, which carry the most weight, are deterministic |
| The harness refactor regresses `/api/command` | The refactor is its own commit, with every existing harness test unmodified and green; 3 live command calls after it |
| Bundle ratchet breaks CI | Step 0, or `next/dynamic` for every Phase 6 panel; `bundle:size` runs locally before each commit |
| TTS talks over Wispr Flow dictation | Speech is cancelled on answer-box focus, mic start and every keypress in the answer box |
| Time | Cut order below |

## Cut order (if late)

1. Step 9 `/design` route (the design doc still covers it)
2. Step 0 `zod/mini` (keep the 320 KB ratchet; panels via `next/dynamic`)
3. AI findings in Step 5 (ship rule-based Review only)
4. TTS (text questions only)
5. The ⋯ menu (phones: Review/Finish move into the sheet's header)

**Never cut:** SPOF scan, `sloChecks` + the reference-design tests, the interview turn with guardrails, the scorecard end to end, the axe gate. **Hard stop:** Phase 6 merges by Sun 4 Oct 22:00, so Phase 7 (evals + deploy) and Phase 8 (record + submit by Mon 5 Oct 21:00) keep their time.

## Out of scope (later phases)

Share links, exports and replay (Phase 7), the `/evals` page and deployment (Phase 7), interview eval cases (Phase 7 adds `interview-*` and `review-*` cases to the dataset), multi-region failures and retry storms (doc 11 · Not modelled), and accounts/cloud sync.

## Outcome (2026-10-04)

Built on `feat/interview`, one commit per step (plus three fix commits). Every acceptance criterion is met. Measured: board route **260.6 KB** gzipped (from 318.7 before Step 0), SPOF scan P95 **21.3 ms** at 100 components, **514** unit/contract tests and **191** e2e, axe 0 serious/critical on every new screen in both themes. Live quota used: **9 calls** of the 12 budgeted (interview turn 1.8–2.9 s, score 3.6 s, review 8.5 s including a provider failover).

Deviations, all measured or test-driven:

- **SPOF rule revised twice** (Decisions → SPOF semantics; doc 11): whole-node failure made queues and stores unpassable, and an absolute 99% threshold flagged everything on overloaded boards. Final rule: losing one instance costs ≥ 5% of successful requests.
- **No SPOF worker:** the scan skips Monte Carlo (exact success, ADR-013) and costs 21 ms at 100 components, so it runs in a deferred render.
- **Requirements calibrated to the simulator:** the planned 100 ms read p99 was unreachable for a 20 ms service tier; targets now sit 1.2–1.3× above each reference design.
- **References live in `references.ts`**, outside the package index and the API, because they are the answer key.
- **The fallback question moved into the simulator** so the browser asks exactly what the server would when the AI is down.
- **`/design` has no in-page theme switch;** it follows the system theme, and the axe gate audits both.

Bugs found and fixed along the way: React Flow nodes lost their measured size on every update (blinks, an unfocusable node after Escape); ⌘Z didn't work from a focused checkbox; Finish did nothing when pressed from another tab (lazy panel mounted after the click); the tabs' `aria-controls` dangled while Review was open; down nodes used opacity and fell below AA contrast; on an empty board the interviewer asked about failing components that didn't exist yet.
