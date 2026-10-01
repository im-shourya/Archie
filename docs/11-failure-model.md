# 11 · Failure Model

How `status: 'down'` changes the simulation, and how failure is injected and explained.

## Injection

| Command | Op |
|---------|----|
| 🎙 "kill / take down / fail redis" | `fail { id: "redis" }` |
| 🎙 "bring it back", "recover redis" | `recover { id }` (`it` = last failed node, from the event log) |
| 🎙 "kill one API server" | `replicate { id: "api", replicas: n − 1 }` (a partial failure is just fewer replicas) |
| Inspector toggle | same ops, `source: 'inspector'` |

## Semantics by kind

| Down node | Effect | Explanation template |
|-----------|--------|----------------------|
| Routing target (behind `lb` / `gateway` / `client` split) | Removed from the split; the remaining targets absorb its share | *"Down: traffic rerouted to {n} healthy targets."* |
| Only target of a routing node | Requests through that branch **fail** | *"Down: no healthy target, so {λ} rps fail at {parent}."* |
| `cache` | Hit rate → 0 for its consumers (**degrade**, don't fail) | *"Cache down: {consumer} sends all {λ} reads to {db} (was {λ×(1−h)})."* |
| `sql` primary, `failover: true`, healthy replica | First healthy replica (by id) is promoted: takes writes, read pool shrinks by 1 | *"Primary down: {replica} promoted. Writes now on {replica}."* |
| `sql` primary, no failover | Writes fail; reads continue on replicas (if any) | *"Primary down, no failover: writes fail; reads served by replicas."* |
| `sql` replica | Removed from the read pool | — |
| `queue` | Producers' async writes fail | *"Queue down: {λ} msg/s rejected."* |
| Queue consumer (`worker`) | Drain drops, backlog grows; **producers still succeed** | *"Consumers down: backlog grows by {λ} msg/s; requests still succeed (async)."* |
| Compute dependency (`service` → `external` …) | Requests that need it fail (fan-out = all-or-nothing per request class) | *"{dep} down: {λ} rps that depend on it fail."* |
| `client` | No traffic from that client | — |

A down node renders dashed and dimmed with ✕ and its explanation. Red particles and "N% fail" edge labels show where requests die. The explanation strings above are golden-tested exactly (`sim.golden.test.ts`).

## Blast radius

After `fail`, the metrics panel shows a diff against the pre-failure sim:

```
Blast radius · Redis down
  Success  96.3% → 54.5%
  Read p99 ~0.6 s → ~1.3 s
  Now hot: Postgres replica 1, Postgres replica 2
```

(three-tier at 50k rps). The "before" is the last `SimResult` of a graph with no failed components (`useSimulation`).

## SPOF scan (FR-027, P1)

```
for each node n (status up, kind ≠ client):
    sim' = simulate(graph with n down)
    if sim'.e2e.successRate < 0.99 → n is a SPOF (record the drop)
```

≤ 200 sims × < 5 ms = < 1 s worst case; run in a Web Worker, debounced 1 s after the last change. Results: a SPOF badge on nodes, a list in the metrics panel, and an input to the review/interview prompts. The interview SLO "survives any single-node failure" = the SPOF list is empty.

## Not modelled

Partial network partitions, gray failures (slow but up), retries/timeouts amplifying load (retry storms), and replication lag after failover. These are listed on `/about` and are candidates for P2.
