# 24 · Latency Benchmark

Real numbers across real queries, not a lucky run.

## What we measure

| Benchmark | Command | Unit under test | Target |
|-----------|---------|-----------------|--------|
| Fast path | `npm run bench:fast` | `normalize + grammar + resolve + applyBatch` for every fast-path-eligible eval utterance | P50 < 10 ms, P100 < 50 ms (NFR-001) |
| Simulator | `npm run bench:sim` | `simulate()` on generated graphs of 10 / 50 / 100 / 200 nodes | P95 < 5 ms @ 100 (NFR-003) |
| Layout | `npm run bench:layout` | ELK layered layout, 10 / 50 / 100 nodes (Node, worker-equivalent) | < 100 ms @ 50 (NFR-004) |
| AI command | `npm run eval` (timings) | `/api/command` server time: context + Claude + validate + repair | P50 < 3 s, P95 < 6 s (NFR-002) |
| End-to-end (user-perceived) | Playwright trace on the deployed site | submit → canvas updated | report only |

## Method

- **Percentiles:** P50, P70, P95, P99, P100 (max), plus mean and N. P100 is always reported. No outlier trimming.
- **Local benches:** 50 warm-up iterations discarded, then ≥ 1,000 iterations per input, `performance.now()`. Report per input-size bucket.
- **AI timings:** every eval case run once per run (N ≥ 80). Timings come from the harness (`timings.*`). The first call (cache cold) is reported separately from the warm calls.
- **Environment recorded** in the results: machine (CPU, RAM), Node version, region of the deployment if remote, model, effort, date, commit.
- Run AI benchmarks against the **deployed** backend too (`EVAL_BASE_URL=https://…`) to include network and serverless cold starts. Report local and deployed separately.

## Breakdown (AI path)

```
totalMs = contextMs + llmMs (+ repair llmMs) + validateMs + guardrailMs
```

Reported per percentile, so a slow tail can be attributed (e.g. P95 dominated by repair turns or cold starts).

## Results format

Written into `evals/results/latest.json` → `latency` ([`specs/evaluation-schema.json`](../specs/evaluation-schema.json)), rendered on `/evals` and copied into the README:

| Tier | N | P50 | P70 | P95 | P99 | P100 |
|------|---|-----|-----|-----|-----|------|
| ⚡ Fast path (Apple M4, Node 22, `c055a5e`) | 14000 | 0.006 ms | 0.008 ms | 0.014 ms | 0.015 ms | 0.138 ms |
| ✦ AI (warm) | — | — | — | — | — | — |
| ✦ AI (cold) | — | — | — | — | — | — |
| Simulator @100 | — | — | — | — | — | — |
| Layout @50 | — | — | — | — | — | — |

## Honesty rules

- Never publish a number that wasn't produced by the committed scripts at the committed commit.
- If a target is missed, publish the miss with a sentence on why and what would fix it.
- Re-run on the final build before submission ([99](99-challenge.md) checklist).
