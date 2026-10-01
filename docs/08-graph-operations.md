# 08 · Graph Operations

Every change to a graph, whether from the fast path, the AI, the inspector, a review fix, or undo, is a **batch of ops** applied by one function. The contract is in [`specs/command-schema.json`](../specs/command-schema.json) (`$defs/Op`).

## Op catalogue

| Op | Fields | Semantics |
|----|--------|-----------|
| `addNode` | `id?`, `kind`, `label`, `props?` | Adds a node storing `replicas: 1`, the kind's *initial* props (e.g. cache `hitRate 0.9`, sql primary `shards/role/failover`) and `props`. Capacity/latency/cost stay unset and resolve from the catalog at read time (`effectiveProps`). If `id` is omitted, it's derived from the label |
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
applyBatch(graph: Graph, ops: unknown[]): { ok: true; graph: Graph; changedNodeIds: string[] }
                                        | { ok: false; errors: OpError[] }
```

1. Each op is parsed with Zod, then validated against the state produced by the ops before it. Later ops may reference ids created by earlier ops in the same batch.
2. If any op fails, return `ok: false` with **every** error (not just the first). The input graph is untouched.
3. Otherwise return a new graph with `version + 1` and the ids of nodes the batch touched (for the pulse animation).
4. Pure function: no I/O, no time, no randomness. `validateBatch` runs the same checks without returning the graph.

## Validation errors

| Code | When |
|------|------|
| `INVALID_OP` | op shape is wrong (unknown `type`, bad id format, extra fields) |
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

Undo restores **exact graph snapshots** ([ADR-011](30-architecture-decisions.md)), not inverse ops:

- Each applied batch pushes the previous graph to `undo[]` and clears `redo[]`.
- Undo swaps the current graph with the top of `undo[]`, redo does the reverse. The restored graph gets `version = current + 1` so versions only move forward (FR-035).
- History depth: 200 graphs (structurally shared, so cheap). Undo/redo are logged as events (`source: 'undo' | 'redo'`, no ops).
- Dragging a node (`pinned`) is a layout change: saved, but not an undo step.

## Event log

```ts
interface BoardEvent {
  id: string;                 // ulid
  at: number;                 // epoch ms
  utterance: string | null;   // null for inspector/drag edits
  source: 'fastpath' | 'ai' | 'inspector' | 'review-fix' | 'undo' | 'redo' | 'template';
  ops: Op[];                  // empty for undo/redo
  versionAfter: number;
  timings?: { totalMs: number; llmMs?: number };
}
```

Used by: session replay (F-13), "bring it back" style references, the design doc export, and debugging.

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
