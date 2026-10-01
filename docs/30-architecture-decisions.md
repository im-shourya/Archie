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
