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
baseline = successRate(graph)                     # exact (ADR-013), no Monte Carlo
for each node n (status up, kind ≠ client):
    n' = n with replicas − 1   if n.replicas ≥ 2  # losing one instance
         n down                otherwise          # SQL failover still applies
    after = successRate(graph with n')
    if (baseline − after) / baseline ≥ 5% → n is a SPOF (record after)
```

**Why this rule (measured in Phase 6, doc 34):** the first draft ("fail the whole node; SPOF if success < 99%") failed twice against the simulator. On an overloaded board every failure lands below 99% (three-tier sits at 96.3%, so Postgres with failover counted for losing 1 point), and compute nodes call every dependency (doc 10), so failing a whole 3-broker Kafka always breaks the path. No design could pass. Losing *one instance* matches what an interviewer means by "survives any single failure"; the proportional threshold keeps a hopeless one-box design (1% success) from passing.

Results on the templates: three-tier → only Redis (the 2 LBs and 30 API servers survive a loss); URL shortener → the single CDN, LB and datastore; chat → the single gateway, Kafka and message store, plus the chat service, whose 8 replicas can't absorb losing one (N+1). Cost: P95 21 ms at 100 components (`bench:sim`), so it runs in a deferred render, not a worker. Results: a SPOF badge on nodes, a Metrics section, the Inspector line "If one instance fails: success 96.3% → 54.5%", the review rules, and the interview check "Survives any single failure".

## Not modelled

Partial network partitions, gray failures (slow but up), retries/timeouts amplifying load (retry storms), and replication lag after failover. These are listed on `/about` and are candidates for P2.
