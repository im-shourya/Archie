# 16 · API

The source of truth is [`specs/openapi.yaml`](../specs/openapi.yaml). This doc is the readable version. Implemented as a **Hono** app (`backend/`) mounted at `/api/*` in Next.js ([04](04-system-architecture.md)). JSON in/out. The server is stateless: the client always sends the current graph.

Most interactions never reach the API. Fast-path commands, the simulator, undo/redo, save/share and exports all run **in the browser** (`src/core`). The API exists only for LLM calls.

**Error shape (all endpoints):**

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "utterance is required", "details": {} } }
```

| Code | HTTP |
|------|------|
| `VALIDATION_ERROR` | 400 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `LLM_REFUSED` | 422 |
| `ACCESS_CODE_REQUIRED` | 401 |
| `NOT_FOUND` | 404 |
| `RATE_LIMITED` | 429 (+ `Retry-After`) |
| `DAILY_CAP_REACHED` | 429 |
| `LLM_UPSTREAM` | 502 |
| `LLM_UNAVAILABLE` | 503 |
| `INTERNAL` | 500 |

Shared types: `Graph` ([07](07-graph-model.md)), `Op` ([08](08-graph-operations.md)), `SimResult` ([09](09-simulation-engine.md)). Errors and retries: [15](15-ai-retry-recovery.md).

## Backend structure

```
backend/src/
  app.ts                 # Hono app: basePath('/api'), middleware, routes
  middleware/
    requestId.ts         # X-Request-Id in/out
    rateLimit.ts         # per-IP token bucket + daily cap
    accessCode.ts        # optional ARCHIE_ACCESS_CODE (see 18)
    errors.ts            # AppError → { error: { code, message } }
    logger.ts            # structured JSON logs (see 26)
  routes/
    command.ts  review.ts  problems.ts  interview.ts  health.ts
```

Request pipeline: `requestId → logger → accessCode → rateLimit → zValidator(body) → route → ai/llm harness → response`.

All responses include `X-Request-Id`. All bodies are capped at 256 KB.

---

## `POST /api/command`

The AI tier of the command bar. It's only called when the fast path returns `null`.

**Request**

```json
{
  "utterance": "put a redis cache in front of postgres and give the api five servers",
  "graph": { "nodes": [], "edges": [], "workload": { "rps": 20000, "readRatio": 0.9, "peakMultiplier": 1 }, "version": 12 },
  "selection": ["api"],
  "history": ["users hit a load balancer...", "send twenty thousand rps"],
  "conversation": [
    { "role": "user", "text": "what's the bottleneck?" },
    { "role": "assistant", "text": "Postgres (primary) at ρ 1.40." }
  ],
  "mode": "design",
  "baseVersion": 12
}
```

| Field | Rules |
|-------|-------|
| `utterance` | 1–4000 chars |
| `baseVersion` | integer, the graph version when the command was sent |
| `graph` | valid `Graph`, ≤ 200 nodes |
| `selection` | node ids, optional |
| `history` | ≤ 5 previous utterances |
| `conversation` | optional, ≤ 10 earlier chat turns `{ role: "user" \| "assistant", text ≤ 600 }`, oldest first ([12 · Conversation memory](12-ai-architecture.md)) |
| `mode` | `design` \| `interview` |

**Response `200`**: one of five kinds.

```json
{
  "kind": "ops",
  "ops": [
    { "type": "addNode", "id": "redis", "kind": "cache", "label": "Redis", "props": { "hitRate": 0.9 } },
    { "type": "connect", "from": "api", "to": "redis", "traffic": "read" },
    { "type": "replicate", "id": "api", "replicas": 5 }
  ],
  "message": "Added Redis (cache-aside, 90% hit rate) and scaled the API to 5 replicas.",
  "options": [],
  "focusNodeIds": ["redis", "api"],
  "baseVersion": 12,
  "timings": { "contextMs": 2, "llmMs": 1640, "validateMs": 1, "totalMs": 1650 },
  "attempts": 1,
  "model":"gemini-2.5-flash"
}
```

| `kind` | Client behaviour |
|--------|------------------|
| `ops` | `applyBatch` → layout → simulate → log event |
| `clarify` | show `message` + `options` as chips. Choosing one re-sends the utterance with the choice appended |
| `confirm` | show `message` + Confirm/Cancel. Confirm applies the held `ops` locally (no second call) |
| `answer` | show `message` in the answer card and highlight `focusNodeIds` |
| `noop` | show `message` as a toast. Board unchanged |

**Concurrency:** if the client's graph `version` ≠ `baseVersion` when the response arrives (the user edited meanwhile), the client re-validates the ops against the current graph. If they're invalid, it shows "board changed, please repeat".

---

## `POST /api/review` — P1

Design review of the current board.

**Request** `{ "graph": Graph, "problemId"?: ProblemId }` (requirements come from the problem). The server runs `simulate()`, `spofScan()` and the deterministic `ruleFindings()` itself; the model may add up to 4 findings. 5/min/IP. With the AI unavailable, the response is the rule findings with `aiAvailable: false` (HTTP 200).

**Response**

```json
{
  "findings": [
    {
      "severity": "high",
      "nodeIds": ["postgres-primary"],
      "title": "Write path saturates at peak",
      "detail": "5,000 writes/s vs 4,000 capacity (ρ = 1.25). 20% of writes dropped.",
      "fix": { "summary": "Buffer writes through a queue", "ops": [] }
    }
  ],
  "timings": {}
}
```

Each finding also has `id` (`rule:spof:redis`, `ai:0`) and `source` (`rule | ai`); the response adds `aiAvailable`, `model`, `timings`. `severity`: `high | medium | low`, sorted high → low, at most 6. Rule fixes are found by simulation; AI `fix.ops` must pass `validateBatch` or the fix is dropped (the finding stays). "Apply fix" runs them through `applyBatch`.

---

## `GET /api/problems` — P1

Interview problem bank (static).

```json
{ "items": [ { "id": "url-shortener", "title": "Design a URL shortener", "difficulty": "easy", "brief": "…",
  "requirements": { "dau": 10000000, "peakRps": 40000, "readRatio": 0.95, "p99Ms": 200, "p99WriteMs": 300, "availability": 0.999, "monthlyBudget": 2500 },
  "hints": [ { "check": "general", "question": "…" } ] } ] }
```

Cacheable (`max-age=3600`). Reference designs (the answer key) are never served.

## `POST /api/interview/turn` — P1

**Request**

```json
{
  "problemId": "news-feed",
  "graph": {},
  "transcript": [ { "role": "interviewer", "text": "..." }, { "role": "candidate", "text": "..." } ]
}
```

Request also accepts `changes` (≤ 10 recent utterances); the transcript is ≤ 20 turns of ≤ 1,000 chars. The server computes `simulate()`, `spofScan()` and `sloChecks()` at the problem's peak and asks **one** question aimed at the weakest point. A question with no real node and no failing targeted check is replaced by the problem's next hint (`source: "fallback"`, no second model call). 10/min/IP.

**Response**

```json
{
  "question": "Your fan-out happens on the write path. What happens when a user with 30M followers posts?",
  "focusNodeIds": ["feed-service"],
  "checks": [ { "id": "p99-read", "label": "Read p99 ≤ 300 ms", "pass": false, "actual": "412 ms", "nodeIds": [] } ],
  "source": "ai",
  "done": false,
  "model": "gemini-2.5-flash",
  "timings": { "contextMs": 12, "llmMs": 1800, "totalMs": 1815 }
}
```

## `POST /api/interview/score` — P1

**Request** `{ "problemId", "graph", "transcript" }`

**Response**

```json
{
  "checks": [ { "id": "p99", "pass": true, "actual": "142 ms" }, { "id": "spof", "pass": false, "actual": "redis is a SPOF" } ],
  "rubric": [
    { "dimension": "scalability", "score": 4, "evidence": "Read replicas + cache keep ρ < 0.7 at peak.", "nodeIds": ["redis"] }
  ],
  "overall": 3.8,
  "summary": "Solid read path; write path and single-cache dependency need work."
}
```

Dimensions: `scalability · availability · data-modelling · trade-offs · communication`, always all five in that order. Code clamps scores to 1–5; an item without evidence (or, except communication, without a real node id) becomes 3 with `unsupported: true`; `overall` is the mean, computed in code. Checks are recomputed by the simulator. 10/min/IP.

---

## `GET /api/health`

```json
{
  "ok": true,
  "llm": "configured",
  "provider": "gemini",
  "fallback": "groq",
  "model": "gemini-2.5-flash",
  "quota": {
    "gemini:gemini-2.5-flash": { "minute": { "requests": 2, "tokens": 12400 }, "day": { "requests": 11, "tokens": 70100 }, "coolingDownMs": 0, "limits": { "rpm": 9, "rpd": 19 } },
    "gemini:gemini-3.8-flash": { "minute": { "requests": 0, "tokens": 0 }, "day": { "requests": 19, "tokens": 121000 }, "coolingDownMs": 31500000, "limits": { "rpm": 9, "rpd": 19 } },
    "groq:openai/gpt-oss-120b": { "minute": { "requests": 0, "tokens": 0 }, "day": { "requests": 3, "tokens": 21000 }, "coolingDownMs": 0, "limits": { "rpm": 28, "tpm": 7600 } }
  },
  "version": "dev"
}
```

Never calls the LLM. `quota` is the in-memory guard state of this server instance (ADR-017).

---

## Client-side modules (not HTTP, listed for completeness)

| Module | Function |
|--------|----------|
| `@archie/ai/fastpath` | `parseCommand(utterance, graph, ctx) → { kind: 'ops' \| 'action', … } \| null` |
| `@archie/simulator` | `applyBatch(graph, ops) → { ok, graph, changedNodeIds } \| { ok: false, errors }` |
| `@archie/simulator` | `simulate(graph) → SimResult` |
| `@archie/database` | `encodeShare({ name, graph })` · `decodeShare(hash)` (Zod-validated) |
| export (Phase 7) | `toMermaid(graph) → string` |
| export (Phase 7) | `toDesignDoc(graph, sim, findings?) → markdown` |
| `@archie/database` | `getRepository()` → `listBoards · getBoard · saveBoard · deleteBoard · appendEvent · listEvents` (IndexedDB, memory fallback) |
