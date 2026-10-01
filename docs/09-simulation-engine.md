# 09 · Simulation Engine

`simulate(graph: Graph): SimResult`, in `simulator/src/sim/`. The output contract is [`specs/simulation-schema.json`](../specs/simulation-schema.json).

## Goals

| Goal | How |
|------|-----|
| **Explainable** | Closed-form per-node math; every number traceable to a formula ([10](10-traffic-model.md)) |
| **Fast** | O(V + E) propagation + a 10k-sample Monte Carlo; P95 < 5 ms at 100 nodes (NFR-003) |
| **Deterministic** | No `Date`, no `Math.random`; seeded PRNG (mulberry32, seed = hash of graph JSON) (NFR-008) |
| **Honest** | A *teaching model*. Assumptions are listed below and on `/about` |

## Pipeline

```
graph
  │
  ├─1─► topoSort (call + replication edges; async edges cut)  → order, cycle warnings
  ├─2─► propagate (λ_read, λ_write per node, per edge)        → 10-traffic-model
  ├─3─► failures (status=down → reroute / failover / degrade) → 11-failure-model
  │      (2 and 3 are interleaved: routing decisions read node status)
  ├─4─► queueing (ρ, W, error fraction, status band)
  ├─5─► montecarlo (10k requests → e2e p50/p95/p99, read & write)
  ├─6─► aggregate (success rate, throughput, cost, bottleneck)
  └─7─► explain (one sentence per node + bottleneck + warnings)
  ▼
SimResult
```

## Per-node queueing (step 4)

Per-replica M/M/1 approximation (replicas share load evenly):

| Quantity | Formula |
|----------|---------|
| Capacity (generic) | `μ = replicas × capacityRps` |
| Utilization (generic) | `ρ = λ / μ` |
| Utilization (`sql`) | `ρ = λ_read / (shards × readCap) + λ_write / (shards × writeCap)` |
| Utilization (`nosql`) | `ρ = λ / (shards × capacityRps)` (datastore `replicas` don't add capacity; read replicas are separate nodes) |
| Mean latency (`ρ < 1`) | `W = s / (1 − ρ)`, `s` = mean service time (`latencyMs`) |
| Saturated (`ρ ≥ 1`) | served fraction `1/ρ`, **error fraction `e = 1 − 1/ρ`**, `W` reported as saturated (capped at 50 × s for Monte Carlo) |
| Forwarded rate | `λ_out = λ_in × (1 − e)`, so overload upstream shields downstream |

Status bands: `healthy` ρ < 0.7 · `warm` 0.7–0.9 · `hot` 0.9–1.0 · `saturated` ≥ 1 · `down` · `idle` (no traffic reaches it). ρ is rounded to 9 decimals before banding so float noise (0.075 + 0.625 = 0.6999…98) can't flip a band.

## End-to-end latency (step 5)

Seeded Monte Carlo, 10,000 requests:

1. Draw read vs write by `readRatio`.
2. Start at a `client` (weighted by split). At each node: add a sample from `Exp(mean = W)`, the exact M/M/1 sojourn-time distribution.
3. Routing nodes: pick one target by split weights. Compute nodes: visit **every** dependency matching the request's class (sequential calls, latencies add). Cache-aside: hit with probability `hitRate` → skip the DB for reads.
4. A request touching a saturated node fails with probability `e` (counted, not timed).
5. Queue (`async` edge): stop the walk after the enqueue (the async work isn't on the request path).
6. Report p50/p95/p99 for reads and writes.

For speed the graph is compiled once into integer-indexed typed arrays (dependencies, cumulative routing shares, SQL pool entries), so the sampling loop allocates nothing (NFR-003).

## Aggregates (step 6)

- `throughput` = successful requests/s at the clients.
- `successRate` is computed **exactly** (`reliability.ts`): the probability a request survives every node it touches, using the same fan-out plan as propagation and Monte Carlo (routing = weighted average over healthy targets; fan-out = product; cache-aside = `h + (1 − h) × P(stores succeed)`; async = enqueue only). Monte Carlo is used for latency only, because 10k samples would add ±0.5% noise to the success rate.
- `edges[id].errorRps` = traffic on the edge × the exact failure probability downstream of it.
- `bottleneck` = node with max ρ (ties → closest to clients). `null` if max ρ < 0.7.
- `costMonthly` = Σ `replicas × shards × costPerReplica`.

## Explanations (step 7)

Template-based, never LLM-generated. Every sentence includes the inputs and the result:

| Status | Template |
|--------|----------|
| sql | `{r} reads/s + {w} writes/s on {n} shard(s) (capacity {rc} reads / {wc} writes per shard) → ρ = {rho}` + status suffix |
| generic | `{λ} rps on {replicas} × {cap} rps → ρ = {rho}` + status suffix (nosql: `on {n} shards × {cap} rps`) |
| suffix: saturated | ` → {e}% of its requests dropped. Consider: {suggestion}.` |
| suffix: exactly full (ρ = 1, e = 0) | `: running at full capacity with no headroom. Consider: {suggestion}.` |
| suffix: hot | `: under 10% headroom, so latency is {1/(1−ρ)}× the unloaded value.` |
| cache (not saturated) | `Hit rate {h}%: absorbs {λ×h} of {λ} reads/s (ρ = {rho}).` |
| queue with backlog | `Consumers drain {drain}/s of {in}/s, so the backlog grows by {b} msg/s. Add {n} more {consumer} replicas.` |
| client | `Sends {λ} rps ({r} reads, {w} writes).` |
| idle | `No traffic reaches this component.` |
| down | per kind, see [11](11-failure-model.md) |

Suggestions are rule-based: sql → "shard the database, or reduce writes" when the write term dominates ρ, else "add read replicas or a cache"; service/worker/search → "add replicas"; external → "put a cache or a queue in front of it"; nosql → "add shards". Explanations use locale-independent number formatting so results are identical on every machine.

## Output (summary)

```ts
interface SimResult {
  nodes: Record<string, NodeMetrics>;  // λRead, λWrite, rho, meanMs, errorRate, backlogGrowth?, status, explanation
  edges: Record<string, { rps: number; errorRps: number }>;
  e2e: { read: Pct; write: Pct; successRate: number; throughput: number };   // Pct = {p50,p95,p99}
  bottleneck: { id: string; rho: number; explanation: string } | null;
  costMonthly: number;
  warnings: string[];                   // cycles, no client, orphans, unreachable datastores
  seed: number;
}
```

## Assumptions & limitations (shown on `/about`)

- Poisson arrivals, exponential service times, steady state. No warm-up, no burst dynamics (use `peakMultiplier` instead).
- Even load across replicas and shards (no hot keys, unless P2 adds skew).
- Read replicas don't pay for replicated writes. Replication lag isn't modelled.
- Network latency between components isn't modelled (single region).
- Cache hit rate is a constant, not derived from working-set size.
- Capacities are teaching estimates, not vendor benchmarks.

## Testing

Golden tests with hand-computed numbers (`simulator/src/sim/sim.golden.test.ts`: three-tier-50k, three-tier-sharded, write-queue, cache-down, primary-failover, no-failover, lb-reroute, only-target-down), property tests with fast-check (no NaN/∞ or out-of-range rates under random workloads and failures, λ conservation at routing nodes, ρ monotonic in rps), determinism, and a contract test against `specs/simulation-schema.json`.

`npm run bench:sim` (synthetic graphs, 200 runs per size, commit `58a1fcd`, Apple M4, Node 22): **P95 2.327 ms at 100 nodes**, 2.816 ms at 200 nodes (target P95 < 5 ms at 100).
