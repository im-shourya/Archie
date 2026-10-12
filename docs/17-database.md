# 17 · Database & Persistence

## Decision: no server database

Archie has **no server-side database** ([ADR-003](30-architecture-decisions.md)). Boards are personal and single-user, and shareable via URL. A server DB would add accounts, migrations, hosting cost and a privacy surface for no user benefit in this version.

Persistence happens in three places:

| Store | Where | Holds | Package |
|-------|-------|-------|---------|
| **IndexedDB** `archie` | user's browser | boards, event logs, settings | `@archie/database` |
| **URL hash** `/s#v1:…` | the link itself | one graph snapshot (read-only share) | `@archie/database/share` |
| **Repo file** `evals/results/latest.json` | git | eval + benchmark results (static, rendered on `/evals`) | `evals/` |

## IndexedDB schema (`database/src/schema.ts`)

DB name `archie`, version `1`, via `idb`.

### Object store `boards` (keyPath `id`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (ulid) | primary key |
| `name` | string | 1–80 chars, default "Untitled board" |
| `schemaVersion` | number | board document version (currently `1`) |
| `graph` | `Graph` | [07](07-graph-model.md) |
| `mode` | `'design' \| 'interview'` | |
| `problemId` | string \| null | interview mode |
| `interview` | `{ transcript: Turn[]; scorecard?: Scorecard }` \| null | |
| `chat` | `ChatTurn[]`, optional | the Chat panel's log (see Chat below). Absent on boards saved before 1.2.0 |
| `createdAt` / `updatedAt` | number (epoch ms) | |

Index: `by-updatedAt` (for the recent list).

### Object store `events` (keyPath `id`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | ulid | sortable by time |
| `boardId` | string | FK → boards.id |
| `event` | `BoardEvent` | [08](08-graph-operations.md) |

Index: `by-board` (`boardId`). Capped at 1,000 events per board (oldest trimmed; replay starts from a snapshot when trimmed).

### Object store `settings` (keyPath `key`)

`handsFree: boolean`, `tts: boolean`, `theme: 'system' | 'light' | 'dark'`, `seenTips: string[]`.

## Repository API (`database/src/repo.ts`)

```ts
listBoards(): Promise<BoardSummary[]>          // id, name, nodeCount, updatedAt
getBoard(id): Promise<Board | null>
saveBoard(board): Promise<void>                // debounced 500 ms by the caller
deleteBoard(id): Promise<void>                 // also deletes events
appendEvent(boardId, event): Promise<void>
listEvents(boardId): Promise<BoardEvent[]>
getSetting<K>(key) / setSetting<K>(key, value)
```

Every read is validated with Zod. Corrupt records are skipped and reported in the console, never crash the app.

## Migrations

- **IndexedDB structure** (stores/indexes): `upgrade(db, oldVersion)` in `schema.ts`, one `case` per version.
- **Board documents**: `schemaVersion` + pure migration functions `migrations/board.v1-to-v2.ts`, applied on read and written back on the next save. Each migration has a fixture test.

### Chat

`ChatTurn = { id, at, role: "user" | "assistant", text (1–4000), kind?, focus? }`, where `kind` is how Archie handled it (`ops`, `local`, `answer`, `clarify`, `confirm`, `noop`, `error`) and `focus` keeps the node ids an answer pointed at (≤ 20). Capped at 200 turns per board (oldest drop off). Saved with the board through the same 500 ms debounced write, so it needs no new object store and no DB migration.

The chat stays on the device: share links and JSON exports carry only `name` and `graph`. The last 10 non-error turns go to `/api/command` as `conversation` ([16](16-api.md)), and the server doesn't log their text ([26](26-monitoring.md)).

## Share-link format (`database/src/share.ts`)

```
/s#v1:<lz-string compressToEncodedURIComponent(JSON.stringify({ name, graph }))>
```

- The hash is never sent to the server.
- Decoding: prefix check → decompress → `JSON.parse` → Zod `Graph` validation → bounds (GI-05/06). Any failure → EF-05.
- Size guard: refuse to create links > 32 KB (≈ 150+ nodes). Suggest JSON export instead.

## Fallback

If IndexedDB is unavailable (some private modes), the repository switches to an in-memory implementation and the UI shows EF-04. Export JSON remains available.

## Data lifecycle

| Data | Created | Deleted |
|------|---------|---------|
| Board + events | New board / Duplicate / template | User deletes board; browser data cleared |
| Chat log | Every command and reply | Clear chat; board deleted; browser data cleared |
| Share link | User clicks Share | Never stored by us |
| Server logs | AI request | Vercel log retention; contains requestId, timings, token usage, **no utterance text** ([26](26-monitoring.md)) |
