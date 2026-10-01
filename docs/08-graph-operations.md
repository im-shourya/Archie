# 08 · Graph Operations

Every change to a graph, whether from the fast path, the AI, the inspector, a review fix, or undo, is a **batch of ops** applied by one function. The contract is in [`specs/command-schema.json`](../specs/command-schema.json) (`$defs/Op`).

## Op catalogue

| Op | Fields | Semantics |
|----|--------|-----------|
| `addNode` | `id?`, `kind`, `label`, `props?` | Adds a node with catalog defaults merged with `props`. If `id` is omitted, it's derived from the label |
| `removeNode` | `id` | Removes the node **and its edges** |
| `updateNode` | `id`, `label?`, `props?` | Shallow-merges props; `null` resets a prop to the catalog default |
| `connect` | `from`, `to`, `kind?='call'`, `traffic?='all'`, `weight?` | Adds an edge; error if it already exists |
| `disconnect` | `from`, `to` | Removes the edge |
| `replicate` | `id`, `replicas` | Sets replica count (sugar for `updateNode`) |
| `insertBetween` | `from`, `to`, `node` | Removes `from→to`, adds `node`, connects `from→node→to` (keeping edge kind/traffic). Used for "put X in front of Y" |
| `setWorkload` | `rps?`, `readRatio?`, `peakMultiplier?` | Merges into the workload |
| `fail` | `id` | `status = 'down'` |
| `recover` | `id` | `status = 'up'` |

## `applyBatch(graph, ops)`

```ts
applyBatch(graph: Graph, ops: Op[]): { ok: true; graph: Graph; inverse: Op[] }
                                   | { ok: false; errors: OpError[] }
```

1. **Validate all ops first** against a working copy, in order. Later ops may reference ids created by earlier ops in the same batch.
2. If any error → return `ok: false` with **every** error (not just the first). The graph is untouched.
3. Apply to an immutable copy (structural sharing), then `version + 1`.
4. Compute `inverse` (ops that restore the previous graph exactly, in reverse order). Example: `removeNode` → `addNode` (with the original props/status) + `connect` for each removed edge.
5. Pure function: no I/O, no time, no randomness.

## Validation errors

| Code | When |
|------|------|
| `UNKNOWN_NODE` | id not found (and not created earlier in the batch) |
| `DUPLICATE_ID` | `addNode` id already exists |
| `DUPLICATE_EDGE` / `UNKNOWN_EDGE` | connect existing / disconnect missing |
| `BAD_KIND` | unknown kind, or prop not allowed for the kind (GI-04) |
| `BAD_EDGE` | replication edge rule (GI-03), self-loop |
| `OUT_OF_BOUNDS` | numeric bounds (GI-05), size limits (GI-06) |
| `CYCLE` | creates a `call` cycle (GI-07) |
| `TOO_MANY_OPS` | > 25 ops in one batch |
| `EMPTY_BATCH` | 0 ops for a `kind: ops` result |

```ts
interface OpError { opIndex: number; code: OpErrorCode; message: string; nodeId?: string }
```

Messages are written for humans **and** for the repair prompt ([15](15-ai-retry-recovery.md)), for example: `op 2 (connect): node "postgres" not found; existing sql nodes: "postgres-primary", "orders-db"`.

## Undo / redo

- Each applied batch pushes `{ ops, inverse }` to `undo[]` and clears `redo[]`.
- Undo applies `inverse` (as a batch) and moves the entry to `redo[]`. Redo re-applies `ops`.
- History depth: 200 batches. Undo/redo are themselves logged as events (`tier: 'local'`, `kind: 'undo'`).

## Event log

```ts
interface BoardEvent {
  id: string;                 // ulid
  at: number;                 // epoch ms
  utterance: string | null;   // null for inspector/drag edits
  source: 'fastpath' | 'ai' | 'inspector' | 'review-fix' | 'undo' | 'redo' | 'template';
  ops: Op[]; inverse: Op[];
  versionAfter: number;
  timings?: { totalMs: number; llmMs?: number };
}
```

Used by: undo/redo, session replay (F-13), "bring it back" style references, the design doc export, and debugging.

## Concurrency (AI responses)

The client records `baseVersion` when sending a command. When the response arrives:

- If `graph.version === baseVersion` → apply.
- Else → `validateBatch(currentGraph, ops)`. If valid, apply; if not, toast *"Board changed while I was thinking, please repeat."* (FR-035)

## Examples

**"Add a Redis cache in front of Postgres."** Caches are *cache-aside*: a sibling dependency of the service, **not** inline between the service and the DB. The simulator applies the hit rate to the service's DB reads ([10](10-traffic-model.md)).

```json
[{ "type": "addNode", "id": "redis", "kind": "cache", "label": "Redis", "props": { "hitRate": 0.9 } },
 { "type": "connect", "from": "api", "to": "redis", "traffic": "read" }]
```

**"Put a Kafka queue in front of the writes."** Queues *are* inline, so use `insertBetween`:

```json
[{ "type": "insertBetween", "from": "api", "to": "postgres-primary",
   "node": { "id": "kafka", "kind": "queue", "label": "Kafka" } }]
```

Rule: `insertBetween` is for inline components only (LB, gateway, queue, CDN). Caches use `addNode` + `connect`. This distinction is a worked example in the prompt and an eval category (`insert`).
