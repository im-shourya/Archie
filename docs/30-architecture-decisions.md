# 30 · Architecture Decisions (ADRs)

Format: Context → Decision → Alternatives → Consequences. Status: `Accepted` · `Superseded by ADR-xxx` · `Proposed`. New ADRs are appended; old ones are never edited except for status.

---

## ADR-001 · Next.js frontend with a Hono backend mounted at `/api`
**Status:** Accepted · 2026-10-01
**Context:** We want a clearly separated backend package, but a solo developer on a 5-day deadline needs a single deploy without CORS.
**Decision:** The backend is a Hono app in `backend/`, mounted in Next.js via `hono/vercel` at `/api/[[...route]]`. It can also run standalone for tests and evals.
**Alternatives:** Next.js Route Handlers only (less separation); a separate Express/Fastify service (two deploys + CORS).
**Consequences:** Clean boundaries and one deploy. Serverless constraints apply (in-memory rate limits are per instance, which is acceptable with the daily cap + Console limit).

## ADR-002 · npm-workspaces monorepo with a pure simulator package
**Status:** Accepted · 2026-10-01
**Context:** Graph ops, validation and simulation must run in the browser (instant feedback), on the server (validating AI output, grounding answers) and in tests/evals.
**Decision:** Workspaces `frontend`, `backend`, `simulator`, `ai`, `database`, `evals`. `simulator` has no I/O and no runtime deps besides Zod.
**Alternatives:** A single Next.js app with `src/core` (less explicit boundaries); Turborepo/Nx (more tooling than needed).
**Consequences:** One source of truth for domain logic. TS project references are needed for builds. The import ban protects `ai/llm` from the client.

## ADR-003 · No server-side database
**Status:** Accepted · 2026-10-01
**Context:** Boards are single-user. Sharing can be done with links. A server DB implies accounts, hosting, migrations and privacy duties.
**Decision:** IndexedDB in the browser, graphs in URL hashes for sharing, and eval results as a committed JSON file.
**Alternatives:** Turso/libSQL, Supabase, Vercel KV.
**Consequences:** Zero server data, zero RPO server-side, no auth needed. Boards don't sync across devices (export/share instead). Revisit in v2 with accounts.

## ADR-004 · No user accounts; protect the AI budget instead
**Status:** Accepted · 2026-10-01
**Context:** The only server-side asset worth protecting is the Claude budget. A signup wall hurts the demo.
**Decision:** No auth. Per-IP rate limits, a global daily cap, an optional access code header, and a Console spend limit.
**Alternatives:** OAuth (Auth.js); a passcode for the whole site.
**Consequences:** Frictionless demo. Abuse is bounded by caps rather than identity.

## ADR-005 · The LLM emits validated ops, never a regenerated diagram
**Status:** Accepted · 2026-10-01
**Context:** Regenerating the full graph on each command loses user edits, can't be undone precisely, and is slow and token-heavy.
**Decision:** A typed op language (10 ops) applied atomically, with inverses for undo. The LLM output schema only allows ops/text.
**Alternatives:** The LLM returns the full graph JSON; the LLM returns Mermaid.
**Consequences:** Surgical edits, undo/replay, a smaller output, and validation + repair are possible. The prompt must teach the op semantics (cache-aside vs insertBetween).

## ADR-006 · Two-tier command engine (deterministic fast path + AI)
**Status:** Accepted · 2026-10-01
**Context:** Voice UX needs sub-second response for frequent simple commands. LLM calls are seconds and cost money.
**Decision:** A local grammar handles unambiguous simple commands and **abstains** otherwise. Everything else goes to Claude.
**Alternatives:** AI only (slow, costly); grammar only (rigid).
**Consequences:** Most demo commands feel instant. Fast-path precision must be 100% (it's evaluated). Two code paths to maintain.

## ADR-007 · Analytic queueing model + seeded Monte Carlo
**Status:** Accepted · 2026-10-01
**Context:** We need believable, explainable numbers in < 5 ms, deterministic for tests.
**Decision:** Per-node M/M/1 approximation for utilization/latency/errors; seeded Monte Carlo over per-node exponential sojourn times for e2e percentiles.
**Alternatives:** A full discrete-event simulation (slower, harder to explain); a pure analytic sum (no percentiles).
**Consequences:** Fast, deterministic, explainable. It's a teaching model, with assumptions documented ([09](09-simulation-engine.md)).

## ADR-008 · Claude (`claude-opus-5-5`) with structured outputs
**Status:** Accepted · 2026-10-01
**Context:** We need reliable typed JSON, good spatial/architecture reasoning, and refusal handling.
**Decision:** `@anthropic-ai/sdk` `messages.parse` + `zodOutputFormat`, effort `low` for commands and `medium` for review/scoring, server-side refusal fallback, and a cached static system prompt. The model is configurable via `ARCHIE_MODEL`.
**Alternatives:** Tool use with `strict: true`; free-text JSON + parsing.
**Consequences:** Schema-valid outputs by construction. Latency is managed with effort + the fast path. Model comparisons go through the eval harness.

## ADR-009 · React Flow + ELK layered layout in a Web Worker
**Status:** Accepted · 2026-10-01
**Context:** Architecture diagrams read best left → right in layers. Layout must not block the main thread.
**Decision:** `@xyflow/react` for rendering/interaction; `elkjs` layered layout in a worker; pinned nodes respected.
**Alternatives:** dagre (simpler, weaker layering); tldraw/Excalidraw (free-form, not graph-native).
**Consequences:** Clean auto-layout. elkjs is large (lazy-loaded, NFR-015).

## ADR-010 · Share links carry the graph in the URL hash
**Status:** Accepted · 2026-10-01
**Context:** We want sharing without a server DB (ADR-003).
**Decision:** `/s#v1:<lz-string>`. The hash is never sent to the server. Validated on decode, capped at 32 KB.
**Alternatives:** Paste services; GitHub gists; a server KV.
**Consequences:** Private, free, works offline. Very large boards need JSON export instead.

## ADR-011 · Undo restores graph snapshots instead of inverse ops
**Status:** Accepted · 2026-10-01 · amends ADR-005
**Context:** Inverse ops can't restore a graph exactly: re-added nodes change array order, and status/pins need ops that don't exist. Exact undo is a requirement (FR-012), and graphs are small (≤ 200 nodes).
**Decision:** `applyBatch` returns the new graph only. The store keeps up to 200 previous graphs for undo/redo. The event log keeps forward ops for replay.
**Alternatives:** Inverse ops (lossy ordering, more code); command pattern with per-op undo.
**Consequences:** Exact, simple undo. Memory is bounded and cheap thanks to structural sharing. Replay still works from forward ops.

## ADR-012 · ELK via elk-api + raw worker script, with a deterministic fallback layout
**Status:** Accepted · 2026-10-01 · refines ADR-009
**Context:** `elkjs/lib/elk.bundled.js` breaks under Turbopack's CommonJS interop ("Cannot call a class as a function").
**Decision:** The main thread uses `elkjs/lib/elk-api.js` with a `workerFactory` that starts our worker, which only imports `elk-worker.min.js`. If ELK can't start, errors, or takes over 3 s, a longest-path layered fallback is used.
**Alternatives:** dagre (weaker layering); ELK on the main thread.
**Consequences:** Layout stays off the main thread and the canvas never stays empty.

## ADR-013 · Success rate is computed exactly; Monte Carlo only for latency
**Status:** Accepted · 2026-10-02 · refines ADR-007
**Context:** A 10,000-sample Monte Carlo estimates the success rate with about ±0.5% noise, enough to make "96.3%" flicker between runs of different graphs and to fail exact golden tests.
**Decision:** `reliability.ts` computes request failure probabilities exactly from the same fan-out plan the propagation and Monte Carlo use. Monte Carlo reports latency percentiles only.
**Alternatives:** More samples (slower); Monte Carlo success plus an analytic cross-check (two numbers that can disagree).
**Consequences:** Golden tests can pin success rates exactly (e.g. 96.29% for three-tier at 50k). Edge error rates come from the same function.

## ADR-014 · Traffic particles use SVG `animateMotion`
**Status:** Accepted · 2026-10-02 · amends docs/27
**Context:** Doc 27 planned a canvas overlay with a JS animation loop. React Flow edges are already SVG paths.
**Decision:** At most 5 `<circle>` particles per edge (log₁₀ of rps) animated by the browser along the edge path; failing share drawn red; none under `prefers-reduced-motion` (stroke width shows volume instead).
**Alternatives:** Canvas overlay (extra coordinate syncing on pan/zoom); CSS offset-path.
**Consequences:** No per-frame JavaScript, pan/zoom just works, and the particle count stays bounded.

## ADR-015 · Brand and design system: Plex, Lucide, semantic tokens, state-first colour
**Status:** Accepted · 2026-10-01
**Context:** Placeholder tokens, emoji used as icons, and system fonts made the product look generic. The product's meaning lives in component state, so colour must be reserved for it.
**Decision:** Semantic CSS tokens (light warm paper / dark graphite), one cobalt primary for actions only, a WCAG-AA health ramp for simulation state, IBM Plex Sans + Mono via `next/font`, Lucide icons with one icon per component kind, and an "A as a graph" logo. Details in [06 · Design system](06-ui-ux.md#design-system).
**Alternatives:** Inter + a default palette (generic); a blueprint-blue theme (cliché, competes with state colours); emoji icons (inconsistent rendering).
**Consequences:** State colours never collide with the brand colour; every text role passes 4.5:1; fonts are self-hosted (no third-party origin in the CSP).

## ADR-016 · Pluggable model provider; Gemini's free tier by default
**Status:** Accepted · 2026-10-02 · amends ADR-008
**Context:** The Anthropic API needs paid credits, and the project has no budget for them. The AI tier and the eval still need a real model.
**Decision:** The harness calls an `LlmProvider` (`ai/src/llm/providers/`). It keeps the algorithm (repair turn, `max_tokens` retry, guardrails, budget, error mapping), and each provider turns one request into one model turn. The default is `gemini` (`@google/genai`, `gemini-3.8-flash`, JSON-schema structured output via `responseJsonSchema`, thinking `low`). `anthropic` keeps the ADR-008 path. Selection: `ARCHIE_PROVIDER`, else Claude when only `ANTHROPIC_API_KEY` is set. `ARCHIE_MODEL` overrides the model.
**Alternatives:** Groq (free and fast, but JSON mode rather than schema-enforced output, so more repair turns); Ollama (free, but local only and won't run on the deployed demo).
**Consequences:** It costs nothing to run. Free-tier prompts may be used by Google to improve its products; boards in the demo are public anyway, and the README says so. Thinking tokens count toward Gemini's output cap, so its cap is 8,000 (vs 4,000). Caching is implicit (`cachedContentTokenCount`); the system prompt stays byte-stable. Eval results record the provider's model, so B1 numbers name the model they came from.

## ADR-017 · Free-tier quota guards and a Groq fallback
**Status:** Accepted · 2026-10-02 · extends ADR-016
**Context:** Gemini's free tier has per-project limits (shown in AI Studio, with the day resetting at Pacific midnight), and in testing it returned 503 "high demand" on about one call in three, with some calls taking 17–69 s. Running out of quota or hanging must not break the AI tier, and nothing should spend requests that are bound to fail.
**Decision:** Free Gemini quotas are **per model per project**: a live 429 named `GenerateRequestsPerDayPerProjectPerModel-FreeTier` with a limit of 20. So the chain is a ladder: `gemini-2.5-flash` (about 1.8 s with thinking off, 3/3 correct and no errors in testing), then `gemini-3.5-flash-lite`, `gemini-3.5-flash`, `gemini-3.8-flash` (often 503), then Groq. Each model gets a `QuotaGuard` (requests and tokens per rolling minute and per quota day, plus a cooldown after a 429 or 5xx, honouring Retry-After). Gemini calls get one attempt and a 10 s timeout. A per-day 429 cools that model down until Pacific midnight; the body's "retry in 20s" is misleading. The last step is **Groq** `openai/gpt-oss-120b`, which supports strict JSON-schema output. `gpt-oss-20b` violated our schema in testing, and `qwen/qwen3.8-27b` returned an empty edit with an invented message. A provider without room is skipped without being called. When every provider is out of room: `RATE_LIMITED` + `Retry-After`, or `DAILY_CAP_REACHED`. Default guards: Gemini 9 rpm / 19 rpd per model, Groq 28 rpm / 950 rpd / 7.6K tpm / 190K tpd. All can be overridden via env, and `GEMINI_MODELS` reorders the ladder.
**Alternatives:** SDK retries on Gemini (wastes the 20 s budget on an overloaded model); OpenRouter free models (one more account and less predictable routing); waiting in-request for quota (blows the voice latency budget).
**Consequences:** It stays free, with about 4 × 20 Gemini calls a day plus Groq, and outages degrade to another model rather than an error. Results can come from different models, so every response and eval case records the model that answered. Groq's free tier allows 8K tokens per minute and our call is about 7K, so it serves about one call per minute: it's a safety net, not a second primary. The guards are in-memory per instance (best-effort on serverless; the providers' own 429s plus the cooldown are the backstop). Responses and eval results name the model that actually answered.


## ADR-018 · Deploy as one long-running Docker container
**Status:** Accepted · 2026-10-04 · amends docs/25 (Vercel serverless as the default)
**Context:** The AI budget is protected in memory: free-tier quota guards per model (ADR-017), per-IP token buckets and the daily cap. On serverless functions each instance has its own copy, so N warm instances allow N× the requests the free tier tolerates, and the guards silently stop guarding. Judges also need a one-command way to run the app.
**Decision:** A multi-stage `Dockerfile` builds Next's standalone output (`ARCHIE_STANDALONE=1`: a minimal `server.js` plus only the traced `node_modules`) into a non-root `node:22-alpine` image with a `HEALTHCHECK` on `/api/health`. Keys are runtime environment variables (`--env-file`), never in the build context (`.dockerignore`) or the image. The image is stamped with its git SHA (`ARCHIE_VERSION`, shown by `/api/health`). CI builds it and smoke-tests the running container on every PR (`scripts/docker-smoke.sh`). Deploy it as a single instance on any container host.
**Alternatives:** Vercel serverless (no ops, but per-instance quota state; would need Redis/KV for shared counters, which conflicts with ADR-003's no-server-state); `next start` on a VM (works, but no reproducible artifact).
**Consequences:** Quota and rate limits are exact for a single instance; scaling out later needs a shared store for the counters. Standalone output is opt-in, so `npm start` and the e2e suite are unchanged. The image runs anywhere Docker does, so a reviewer can try it locally with `docker compose up --build`.

## ADR-019 · Conversation memory lives on the board, client-side
**Status:** Accepted · 2026-10-05
**Context:** The AI only saw the last five utterances that changed the board, never its own answers, so follow-ups ("what's the bottleneck?" → "fix it") had nothing to refer to. Users also had no record of questions and answers once the answer card closed.
**Decision:** Each board keeps a `chat` log (≤ 200 turns) in IndexedDB next to its graph, shown in a Chat tab. Each `/api/command` call sends the last 10 non-error turns as `conversation` (≤ 600 chars each), rendered as an escaped `<conversation>` block and treated as untrusted data (G-07).
**Alternatives:** Server-side sessions (breaks ADR-003's no-server-state and the privacy promise); send the whole log (unbounded tokens on free tiers); keep only `history` (no answers, the original problem).
**Consequences:** The server stays stateless and logs no text; the token cost is bounded (≈ 1.5k worst case). Share links and exports don't carry the chat. The single-turn eval numbers don't measure multi-turn behaviour; a follow-up eval category is future work.

## ADR-020 · Node shapes by family; brand logos only from labels
**Status:** Accepted · 2026-10-05 · extends docs/06 · Icons
**Context:** Every node was the same rectangle with a grey glyph, so a board didn't read like an architecture diagram at a glance.
**Decision:** Shapes by family (pill, hexagon, rect, cylinder, pipe, dotted rect) drawn as SVG paths inside the unchanged 184×72 footprint; state drives the stroke through CSS variables. Brand marks (simple-icons, CC0, monochrome) appear only when the label names the product and the kind fits, loaded as a lazy chunk.
**Alternatives:** Brand logo per kind (claims a product the user never chose and the simulator doesn't model); full-colour logos (clash with the palette and the state colours); a different footprint per shape (would change ELK layout and edge anchoring).
**Consequences:** Layout, handles, tests and export geometry are unchanged; the board route stays under budget (291.6 KB). The SVG/PNG export still draws rectangles (simulator/export), which is future work.
