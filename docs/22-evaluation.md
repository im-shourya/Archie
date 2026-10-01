# 22 · Evaluation

How we know the command understanding is good, and how we stop it getting worse. Dataset: [23](23-eval-dataset.md). Latency: [24](24-latency-benchmark.md). Result contract: [`specs/evaluation-schema.json`](../specs/evaluation-schema.json).

## What "good" means

1. **It does what you meant.** The resulting graph satisfies the case's assertions.
2. **It doesn't act when it shouldn't.** Ambiguous → clarify, destructive → confirm, off-topic → noop.
3. **It doesn't over-ask.** Clear commands are executed, not questioned.
4. **It's fast enough to talk to.** See [24](24-latency-benchmark.md).

## Pipeline under test

The **full** production path, not just the model:

```
case.utterance + fixtures[case.fixture]
  → fastpath.parse → (null) → harness.run (real Claude) → guardrails
  → applyBatch → simulate → assertions
```

## Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Kind accuracy** | `result.kind === expect.kind` | ≥ 95% |
| **Task accuracy** | kind correct **and** all graph assertions pass | ≥ 90% (NFR-006) |
| **False-action rate** | expected clarify/confirm/noop, but ops were applied | ≤ 2% (NFR-007) |
| **Over-clarify rate** | expected ops, got clarify | ≤ 10% |
| **Fast-path precision** | fast path produced ops and they're correct | **100%** (it must abstain rather than guess) |
| **Fast-path coverage** | share of cases the fast path handled | report only (≈ 40–60% expected) |
| **Repair rate** | cases needing the repair turn | report; investigate if > 10% |
| **Answer groundedness** | `question` cases: every number in the answer exists in the sim context (auto-check) | ≥ 95% |
| **Cache hit rate** | calls with `cache_read_input_tokens > 0` | ≥ 90% after the first call |

All metrics are reported overall and **per category** ([23](23-eval-dataset.md)).

## Assertions (graph checks)

Structural, not exact-match, so different-but-correct op lists pass:

```json
{ "nodeExists": { "kind": "cache" } }
{ "node": "api", "props": { "replicas": 5 } }
{ "edgeExists": { "fromKind": "service", "toKind": "cache", "traffic": "read" } }
{ "edgeAbsent": { "from": "api", "to": "pg" } }
{ "nodeCount": { "kind": "sql", "eq": 3 } }
{ "workload": { "rps": 50000, "readRatio": 0.9 } }
{ "status": { "node": "redis", "eq": "down" } }
{ "unchanged": true }
{ "answerMentions": ["pg", "1.4"] }
{ "focusIncludes": ["pg"] }
```

## Baseline & comparisons

| Run | Description |
|-----|-------------|
| B0 | Fast path only (AI disabled): coverage + precision baseline |
| B1 | Fast path + AI, `claude-opus-5-5`, effort `low` (default config) |
| B2+ | Variants: prompt changes, effort `medium`, other models via `ARCHIE_MODEL` (only if the owner decides) |

Results table (filled by `npm run eval -- --report`):

| Run | Task acc. | False-action | Over-clarify | AI P50 | AI P95 | Notes |
|-----|-----------|--------------|--------------|--------|--------|-------|
| B0 | — | — | — | — | — | |
| B1 | — | — | — | — | — | |

**Decision rule:** a change ships only if task accuracy doesn't drop, false-action stays ≤ 2%, and P95 latency doesn't regress > 20%. One metric improving isn't enough.

## Regression testing

- `npm run eval` on the **dev** split while iterating on prompts.
- The **test** split is run only before merging prompt/harness changes and for the final report (prevents overfitting the prompt to the test set).
- Every eval failure found in manual use becomes a new case (the dataset only grows).

## Human review

Before the final report: manually read 20 random AI results (ops + message) for quality issues assertions can't catch (odd labels, verbose messages). Record findings in `evals/notes.md`.

## Acceptance criteria for submission

- [ ] ≥ 80 cases, every category ≥ 5 cases
- [ ] Test-split task accuracy ≥ 90%, false-action ≤ 2%, fast-path precision 100%
- [ ] Report committed (`evals/results/latest.json`) and rendered on `/evals` + README
