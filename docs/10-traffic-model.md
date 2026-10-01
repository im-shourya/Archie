# 10 · Traffic Model

How requests flow through the graph (step 2 of [09](09-simulation-engine.md)).

## Workload

```
λ_total = rps × peakMultiplier
λ_read  = λ_total × readRatio
λ_write = λ_total × (1 − readRatio)
```

Injected at `client` nodes. With multiple clients, it's split by outgoing weight (even by default).

## Node classes & forwarding rules

Nodes are visited in topological order. Each node forwards its **served** traffic (`λ × (1 − e)`).

| Class | Kinds | Rule |
|-------|-------|------|
| **Routing** | `client`, `lb`, `gateway` | **Split** across healthy outgoing `call` edges, by `weight` (even by default). A `traffic` filter on an edge restricts which class goes there |
| **Edge cache** | `cdn` | Reads × (1 − hitRate) forwarded; writes forwarded; split like routing |
| **Compute** | `service`, `worker`, `search`, `external`, `objectstore` | **Fan-out**: each request calls *every* outgoing dependency whose `traffic` filter matches its class (read/write) |
| **Cache-aside** | compute node with edges to cache `C` and datastore(s) `D` | `C` receives reads. `D` receives reads × (1 − C.hitRate) + all writes. Multiple caches: hit rates combine as `1 − Π(1 − h_i)`. `C` down → h = 0 |
| **Datastore** | `sql`, `nosql`, `cache` | Terminal unless it has outgoing edges |
| **SQL replicas** | `sql(primary)` with `replication` edges to `sql(replica)` | **Writes** stay on the primary. **Reads** arriving at the primary are spread evenly over the healthy primary + replicas |
| **Queue** | `queue` (reached by an `async` edge, or `insertBetween`) | Upstream path ends at the enqueue. Consumers (outgoing edges) receive `drain = min(λ_in, Σ consumer capacity)`. `backlogGrowth = max(0, λ_in − drain)` msg/s |

## Worked example (golden test `three-tier-50k`)

**Graph:** `client → lb (×2) → api (×30) → {redis (cache, h = 0.9, read), pg (sql primary, shards 1)}`, `pg ⇢ pg-r1, pg-r2` (replication).
**Workload:** 50,000 rps, readRatio 0.9 → **45,000 reads/s, 5,000 writes/s**.

| Node | λ | Capacity | ρ | Result |
|------|---|----------|---|--------|
| lb | 50,000 | 2 × 50,000 = 100,000 | 0.50 | healthy |
| api | 50,000 | 30 × 2,000 = 60,000 | 0.833 | warm, `W = 20 / 0.167 ≈ 120 ms` |
| redis | 45,000 reads | 100,000 | 0.45 | healthy |
| pg (primary) | reads 4,500 ÷ 3 = 1,500; writes 5,000 | 10,000 / 4,000 | 1,500/10,000 + 5,000/4,000 = **1.40** | **saturated**, e = 1 − 1/1.4 = **28.6%** |
| pg-r1, pg-r2 | 1,500 reads each | 10,000 | 0.15 | healthy |

Explanation: *"pg: 1,500 reads/s + 5,000 writes/s on 1 shard (capacity 10,000/4,000) → ρ = 1.40 → 28.6% of requests dropped. Consider: shard the database, or reduce writes."*

**Fix: "shard Postgres into two."** → pg ρ = 1,500/20,000 + 5,000/8,000 = 0.075 + 0.625 = **0.70** → warm, e = 0.

The demo template (`three-tier`) ships with exactly this graph, so the demo numbers match the golden test.

## Queue example (golden test `write-queue`)

`api → kafka (async) → writer (worker ×4, 500 msg/s) → pg`. Writes 5,000/s:
`drain = min(5,000, 4 × 500) = 2,000` → **backlogGrowth = 3,000 msg/s** (≈ 10.8 M messages/hour). The API's write latency drops to the enqueue time, but the backlog explains *why* that isn't free: *"Consumers drain 2,000/s of 5,000/s, so the backlog grows by 3,000 msg/s. Add 6 more writer replicas."*

## Edge metrics

`edges[id].rps` = traffic sent along the edge after filtering/splitting. `errorRps` = the share that will fail downstream (drawn as red particles).

## Property tests

- Conservation: Σ outgoing = served incoming at routing nodes.
- Monotonicity: increasing rps never decreases any node's ρ.
- Cache-aside: DB reads scale exactly with `(1 − h)`.
- Determinism: identical results for identical graphs.
