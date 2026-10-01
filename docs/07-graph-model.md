# 07 · Graph Model

The domain model. The machine-readable contract is [`specs/graph-schema.json`](../specs/graph-schema.json), and `simulator/src/graph/types.ts` (Zod) must match it.

## Concepts

| Concept | Meaning |
|---------|---------|
| **Board** | A saved design: name, graph, event log, mode, timestamps |
| **Graph** | Nodes + edges + workload + version |
| **Node** | One architectural component of a `kind`, possibly replicated or sharded |
| **Edge** | A directed dependency: `from` calls / sends to / replicates to `to` |
| **Workload** | The traffic entering at `client` nodes |
| **Op** | An atomic change instruction ([08](08-graph-operations.md)) |
| **Batch** | The ops produced by one command, applied atomically |
| **Event** | A logged batch with its utterance, source, ops and timings (undo uses graph snapshots, ADR-011) |

## Types

```ts
type NodeKind = 'client' | 'cdn' | 'lb' | 'gateway' | 'service' | 'worker' | 'cache'
              | 'sql' | 'nosql' | 'queue' | 'objectstore' | 'search' | 'external';

interface ArchNode {
  id: string;            // slug, ^[a-z][a-z0-9-]{0,39}$, unique, stable
  kind: NodeKind;
  label: string;         // 1–60 chars, display only
  props: NodeProps;
  status: 'up' | 'down';
  pinned?: { x: number; y: number };
}

interface NodeProps {
  replicas: number;          // 1..1000  (stateless scale-out / read replicas are separate nodes)
  shards?: number;           // 1..256   sql / nosql only: multiplies capacity
  capacityRps?: number;      // per replica, overrides catalog
  readCapacity?: number;     // sql, per shard
  writeCapacity?: number;    // sql, per shard
  latencyMs?: number;        // mean service time, overrides catalog
  hitRate?: number;          // cache / cdn, 0..1
  role?: 'primary' | 'replica';   // sql
  failover?: boolean;        // sql primary
  costPerReplica?: number;   // USD / month, overrides catalog
}

interface ArchEdge {
  id: string;                // `${from}->${to}`
  from: string; to: string;
  kind: 'call' | 'async' | 'replication';
  traffic: 'all' | 'read' | 'write';
  weight?: number;           // split weight for routing nodes, > 0
}

interface Workload { rps: number; readRatio: number; peakMultiplier: number }

interface Graph { nodes: ArchNode[]; edges: ArchEdge[]; workload: Workload; version: number }
```

## Component catalog (defaults)

Teaching estimates, overridable per node. Lives in `simulator/src/graph/catalog.ts`.

| Kind | Capacity / replica | Mean latency | Extra defaults | Cost / replica / mo |
|------|--------------------|--------------|----------------|---------------------|
| `client` | — (source) | 0 ms | — | 0 |
| `cdn` | 100,000 rps | 5 ms | `hitRate 0.8` | 50 |
| `lb` | 50,000 rps | 1 ms | — | 20 |
| `gateway` | 20,000 rps | 3 ms | — | 30 |
| `service` | 2,000 rps | 20 ms | — | 70 |
| `worker` | 500 msg/s | 50 ms | — | 70 |
| `cache` | 100,000 rps | 1 ms | `hitRate 0.9` | 120 |
| `sql` | read 10,000 · write 4,000 per shard | 5 ms | `role primary`, `failover false` | 400 |
| `nosql` | 20,000 rps per shard | 4 ms | — | 300 |
| `queue` | 50,000 msg/s | 2 ms | — | 100 |
| `objectstore` | 5,000 rps | 30 ms | — | 25 |
| `search` | 3,000 rps | 15 ms | — | 250 |
| `external` | 1,000 rps | 150 ms | — | 0 |

## Invariants (checked by `validate.ts`)

| ID | Invariant |
|----|-----------|
| GI-01 | Node ids are unique and match the slug pattern |
| GI-02 | Every edge references existing nodes; no self-loops; at most one edge per `(from, to)` |
| GI-03 | `replication` edges go `sql(primary)` → `sql(replica)` only |
| GI-04 | `hitRate` only on `cache`/`cdn`; `shards` only on `sql`/`nosql`; `role`/`failover` only on `sql` |
| GI-05 | Bounds: replicas 1..1000, shards 1..256, rps 0..10,000,000, ratios 0..1, latency 0..60,000 ms |
| GI-06 | ≤ 200 nodes, ≤ 600 edges |
| GI-07 | Cycles over `call` edges are rejected (`CYCLE`); `async` edges may close loops (queues) |
| GI-08 | At least one `client` must exist for simulation (warning, not error) |

## Ids & naming

- Ids come from labels: `"Postgres (primary)"` → `postgres-primary`; on collision, append `-2`, `-3`.
- Ids never change on rename (the label changes, the id stays), so event logs and share links stay valid.
- The fuzzy resolver ([13](13-command-understanding.md)) matches id, label, kind and aliases (`db`, `database` → `sql|nosql`; `cache` → `cache`; `lb` → `load balancer`).

## Versioning

- `graph.version` increments on every applied batch. It's used for the AI concurrency check (FR-035).
- Persisted boards carry `schemaVersion` ([17](17-database.md)); share links carry a `v1:` prefix.
