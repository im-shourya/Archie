# 04 · System Architecture

## Architecture style

**Thick client, thin backend, shared pure core.** This is a TypeScript monorepo (npm workspaces). The graph model, op engine and simulator are a pure package that runs identically in the browser, on the server and in tests. The backend exists to keep the API key secret and run the AI harness. One deploy (Vercel): the Hono backend is mounted inside Next.js.

```
                        ┌──────────────────────────────────────────────┐
  🎙 Wispr Flow ──text──►│ frontend (Next.js, browser)                   │
                        │  CommandBar ─► ai/fastpath ─► simulator.ops   │
                        │       │            (local, <10 ms)    │       │
                        │       │ miss                          ▼       │
                        │       │                     simulator.simulate│
                        │       │                               │       │
                        │       │                 Canvas · Metrics · Inspector
                        │       │                               │       │
                        │       │                     database (IndexedDB)
                        └───────┼───────────────────────────────────────┘
                                │ HTTPS  POST /api/command
                        ┌───────▼───────────────────────────────────────┐
                        │ backend (Hono, mounted at /api in Next.js)    │
                        │  requestId → rateLimit → zod validate         │
                        │  → ai/llm harness ─────────► LLM API       │
                        │       ▲   validate / repair / guardrails      │
                        │       └── simulator (validateBatch, simulate) │
                        └───────────────────────────────────────────────┘
```

## Components (workspace packages)

| Package | Path | Runs in | Responsibility | May import |
|---------|------|---------|----------------|------------|
| `@archie/simulator` | `simulator/` | browser, server, tests | graph types, catalog, ops, validation, simulation, SLO checks, exports | nothing internal (zero runtime deps except `zod`) |
| `@archie/ai` | `ai/` | `fastpath/` browser + server · `llm/` **server only** | fast-path grammar; LLM harness, prompts, schemas | `@archie/simulator` |
| `@archie/database` | `database/` | browser | IndexedDB repository, schema migrations, share-link codec | `@archie/simulator` |
| `@archie/backend` | `backend/` | server (Node runtime) | Hono app: routes, middleware, error mapping | `@archie/simulator`, `@archie/ai/llm` |
| `@archie/frontend` | `frontend/` | browser + Next server | pages, canvas, panels, stores; mounts backend at `/api` | `@archie/simulator`, `@archie/ai/fastpath`, `@archie/database`, (`@archie/backend` only in the API route file) |
| `evals` | `evals/` | Node | eval runner + benches | all packages |

**Hard rule:** the frontend must never import `@archie/ai/llm` (it would ship prompts and the SDK to the browser). This is enforced by an ESLint `no-restricted-imports` rule plus the CI bundle grep (NFR-009).

### Mounting the backend

```ts
// frontend/src/app/api/[[...route]]/route.ts
import { handle } from "hono/vercel";
import { app } from "@archie/backend";
export const runtime = "nodejs";
export const maxDuration = 30;
export const GET = handle(app);
export const POST = handle(app);
```

The backend can also run standalone (`npm run dev -w backend`, port 8787) for evals and integration tests.

## Frontend → backend

- Only for AI: `POST /api/command`, `/api/review`, `/api/interview/turn`, `/api/interview/score`, plus `GET /api/problems` and `/api/health`.
- The client sends the **full current graph** (stateless backend). Requests carry `X-Request-Id` (uuid) for log correlation.
- A typed client (`frontend/src/lib/api.ts`) is generated from `specs/openapi.yaml` types and validates responses with Zod.

## Backend → database

None. There is no server database ([ADR-003](30-architecture-decisions.md)).

## Backend → AI

`ai/llm/harness.ts` → `@anthropic-ai/sdk` → LLM API (`ANTHROPIC_DEFAULT_MODEL`, structured outputs). See [12](12-ai-architecture.md).

## External services

| Service | Use | Failure behaviour |
|---------|-----|-------------------|
| LLM API | AI tier, review, interview | Degraded mode: fast path + simulator keep working ([15](15-ai-retry-recovery.md)) |
| Vercel | hosting, logs | Rollback to previous deployment ([25](25-deployment.md)) |
| Wispr Flow | dictation on the user's machine | Not a runtime dependency; typing or the mic fallback works |

## Data flows

### Command (fast path hit)

```
utterance → normalize → grammar match → resolve refs (unambiguous)
→ ops → applyBatch (validate all → apply atomically) → version++ → undo snapshot
→ layout (worker) ∥ simulate() → render → save (debounced) → event log
```

### Command (AI)

```
utterance → fastpath miss → POST /api/command {utterance, graph, selection, history}
→ backend: rate limit → validate → harness:
     context (compact DSL) → LLM parse → stop-reason checks
     → validateBatch → [repair ×1] → guardrails → response {kind, ops, …}
→ client: version check → (ops) applyBatch… | (clarify) chips | (confirm) dialog
          | (answer) answer card + highlights | (noop) toast
```

### Simulation

```
graph change or workload change → simulate(graph)
  propagate λ → queueing ρ/W/errors → failures → Monte Carlo e2e → explain
→ SimResult → node colours, edge particles, metrics panel, bottleneck callout
```

### Interview turn

```
candidate speaks/edits → POST /api/interview/turn {problemId, graph, transcript}
→ backend: simulate() + sloChecks() → the LLM → one question + focusNodeIds
→ client: interviewer panel (+ TTS), SLO checklist updates locally on every change
```

### Share

```
graph → JSON → lz-string → /s#v1:<data> (never sent to the server)
open → decode → zod validate → read-only board → Duplicate → IndexedDB
```

### Authentication flow

There are no accounts. AI routes are protected by IP rate limiting, a daily cap and an optional access code. See [18](18-authentication.md).

### Failure flow

| Failure | Detected by | Behaviour |
|---------|-------------|-----------|
| LLM timeout / 5xx / 429 | harness | SDK retries → typed error → client toast "AI unavailable, local commands still work" |
| Invalid ops from the model | `validateBatch` | repair once → clarify |
| Board changed mid-request | `baseVersion` check | re-validate → apply or "board changed, please repeat" |
| IndexedDB unavailable (private mode) | repository init | in-memory fallback + banner "won't be saved, use Export" |
| Corrupt share link | Zod decode | error page with "Go home" |
| Render error | React error boundary | panel-level fallback; board state is intact in the store |
