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
| Utilization (`sql`, `nosql`) | `ρ = λ_read / (shards × readCap) + λ_write / (shards × writeCap)` |
| Mean latency (`ρ < 1`) | `W = s / (1 − ρ)`, `s` = mean service time (`latencyMs`) |
| Saturated (`ρ ≥ 1`) | served fraction `1/ρ`, **error fraction `e = 1 − 1/ρ`**, `W` reported as saturated (capped at 50 × s for Monte Carlo) |
| Forwarded rate | `λ_out = λ_in × (1 − e)`, so overload upstream shields downstream |

Status bands: `healthy` ρ < 0.7 · `warm` 0.7–0.9 · `hot` 0.9–1.0 · `saturated` ≥ 1 · `down`.

## End-to-end latency (step 5)

Seeded Monte Carlo, 10,000 requests:

1. Draw read vs write by `readRatio`.
2. Start at a `client` (weighted by split). At each node: add a sample from `Exp(mean = W)`, the exact M/M/1 sojourn-time distribution.
3. Routing nodes: pick one target by split weights. Compute nodes: visit **every** dependency matching the request's class (sequential calls, latencies add). Cache-aside: hit with probability `hitRate` → skip the DB for reads.
4. A request touching a saturated node fails with probability `e` (counted, not timed).
5. Queue (`async` edge): stop the walk after the enqueue (the async work isn't on the request path).
6. Report p50/p95/p99 for reads and writes, plus the overall success rate.

## Aggregates (step 6)

- `throughput` = successful requests/s at the clients.
- `successRate` = Monte Carlo success fraction (cross-checked against the analytic product of `1 − e` along paths; mismatch > 1% → warning in dev).
- `bottleneck` = node with max ρ (ties → closest to clients). `null` if max ρ < 0.7.
- `costMonthly` = Σ `replicas × shards × costPerReplica`.

## Explanations (step 7)

Template-based, never LLM-generated. Every sentence includes the inputs and the result:

| Status | Template |
|--------|----------|
| saturated (sql) | `{reads}/s reads + {writes}/s writes on {shards} shard(s) (capacity {readCap}/{writeCap} per shard) → ρ = {rho} → {err}% of requests dropped. Consider: {suggestions}.` |
| saturated (generic) | `{λ} rps on {replicas} × {cap} rps → ρ = {rho} → {err}% dropped. Consider: more replicas, a cache, or a queue.` |
| hot | `ρ = {rho}: under 10% headroom; latency is {W/s}× the unloaded value.` |
| down | `Down. {rerouteSummary}` |
| cache | `Hit rate {h}: absorbing {λ×h} of {λ} reads/s.` |

Suggestions are rule-based per kind (sql → shards / read replicas / cache; service → replicas; external → cache or queue).

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

Golden tests with hand-computed numbers ([10](10-traffic-model.md) worked example), property tests (λ conservation at routing nodes, ρ monotonic in rps, determinism), and benches at 10/50/100/200 nodes ([24](24-latency-benchmark.md)).
