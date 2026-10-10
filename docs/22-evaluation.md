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
  → fastpath.parse → (null) → harness.run (real model: Gemini by default, Claude via ARCHIE_PROVIDER) → guardrails
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

Added in Phase 4 (needed by the acceptance criteria):

```json
{ "reachable": { "fromKind": "queue", "to": "pg" } }
{ "optionsMention": ["orders", "users"] }
{ "loadDrops": { "node": "pg", "class": "read" } }
{ "nodeCount": { "kind": "sql", "role": "replica", "eq": 2 } }
{ "nodeExists": { "id": "api", "labelIncludes": "checkout" } }
```

`reachable` accepts inline inserts that add hops. `optionsMention` checks that the clarify options name each candidate. `loadDrops` compares the simulator before and after (for example, a cache taking reads off the database).

## Baseline & comparisons

| Run | Description |
|-----|-------------|
| B0 | Fast path only (AI disabled): coverage + precision baseline |
| B1 | Fast path + AI, `claude-opus-5-5`, effort `low` (default config) |
| B2+ | Variants: prompt changes, effort `medium`, other models via `ARCHIE_MODEL` (only if the owner decides) |

Results table (filled by `npm run eval -- --report`):

| Run | Task acc. | False-action | Over-clarify | AI P50 | AI P95 | Notes |
|-----|-----------|--------------|--------------|--------|--------|-------|
| B0 | 6.5% | 0% | 0% | — | — | 31 cases (all splits). Fast path handled 2/31 with precision 100%, abstaining on everything else. `evals/results/b0-fastpath.json` |
| B1 dev (v1 prompt) | 84.2% | 0% | 0% | 1.9 s | 4.5 s | 2026-10-02 · 19 cases · prompt `d7d3db96cf14` |
| B1 test (v1 prompt) | 83.3% | **25%** | 0% | 2.7 s | 3.65 s | Held out. bounds-02 "fifty million rps" was **applied** (clamped) instead of clarified |
| **B1 dev (v2)** | **94.7%** | **0%** | 0% | 1.9 s | 9.8 s | prompt `531e9fe02e1c` + G-05 in code. Miss: workload-01 "fifty k rps ninety percent reads" → answer. `evals/results/b1-dev.json` |
| B1 test, 34 cases (v3), run 1 | **91.2%** | **11.1%** | 0% | 2.3 s | 6.7 s | 2026-10-04 · commit `84949a6` · held out, run once. Kind accuracy 94.1%, groundedness 100%. Misses: ambiguity-08 (connected to one of two databases instead of asking: the false action), modify-06 (answered that 2,000 rps is already the default), dictation-noise-02 (replicas, not read replicas). `evals/results/b1-test-run1.json`, [notes](../evals/notes.md) |
| **B1 test, 34 cases (v3 + G-13), run 2** | **97.1%** | **0%** | 0% | 2.4 s | 5.4 s | 2026-10-04 · commit `61ad8e5`, same prompt, plus the G-13 guard in code. One miss: modify-06 (said 2,000 rps is already the default). Groundedness fell to 66.7% (1 of 3 answers cited a number not in the context). Part of the gain is run-to-run variance: dictation-noise-02 passed with no change aimed at it. `evals/results/latest.json` |
| B1 deployed, 6 test cases | 100% | 0% | 0% | 2.4 s | 3.9 s | 2026-10-04 · Render (Singapore) via Cloudflare, timed from the client. `evals/results/deployed.json` |
| **B1 test (v2)** | **91.7%** | **0%** | 0% | 1.8 s | 11.9 s | Held out. Kind accuracy 100%. Miss: dictation-noise-02 (no replica nodes). P95 = one case that failed over Gemini 503 → 429 → Groq. `evals/results/latest.json` |
| B0 (92 cases) | 8.7% | 0% | 0% | — | — | 2026-10-04 · fast path handles 8/92, precision 100%. `evals/results/b0-fastpath.json` |
| B1 dev, 39 new cases (v2) | 82.1% | 0% | 0% | 2.6 s | 5.5 s | Prompt `531e9fe02e1c`. 32/33 answered cases correct; 6 got no answer (quota pauses, scored before the runner retried them). The miss, compound-03 ("kill redis and send sixty thousand rps"), removed Redis. `b1-dev-new-cases-prompt-v2.json` |
| **B1 dev, 58 cases (v3)** | 82.8% | **0%** | 0% | 4.4 s | 17.7 s | Prompt `8259bf6e5201`. **48/48 answered cases correct**; 10 timed out at 20 s on an overloaded free tier, all before the chain kept time for the fallback (`10f0e67`). `evals/results/b1-dev.json` |

**v1 → v2:** G-05 is now enforced in code (`ai/src/llm/bounds.ts`: an out-of-bounds number becomes a clarify stating the limit, never a clamped edit), plus prompt rules for bounds and for "delete everything → confirm". Both changes came from **dev** failures (bounds-01, injection-01). Under the decision rule: task accuracy up, false actions 25% → 0%, P50 unchanged. P95 went up because of fallback hops on the free tier, not prompt cost. All 31 cases: **29/31 = 93.5%, 0 false actions.** Free-tier runs mix models; each case records its model.

**v2 → v3 (Phase 7, from dev failures only):** one prompt rule ("kill, take down, crash… = fail; only remove/delete removes", also inside compound requests), and two harness fixes that change availability, not understanding: the chain now cuts a hung model off early enough to leave 7 s for the next provider, and the runner waits out a full quota instead of scoring it. The held-out test split is run once on the final build (doc 35 Step 8).

**Final run vs targets:** task accuracy met (91.2% ≥ 90%), fast-path precision met (100%), false-action rate missed (11.1% > 2%: one case of nine), P95 missed (6.7 s > 6 s, the free tier). The fix for the false action shipped as **G-13** (doc 14) and the split was re-run **once** (run 2), as the plan allows; both runs are published. Run 2 meets task accuracy (97.1%), false actions (0%) and P95 (5.4 s); answer groundedness (66.7%, one answer) is the new miss.

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
