# Eval notes (docs/22 · Human review)

## Test split, run 2 · 2026-10-04 · commit `61ad8e5` · prompt `8259bf6e5201` + G-13

Re-run once after the G-13 guard (a generic "the database" matching two components becomes a question). 33/34 = 97.1%, kind accuracy 97.1%, **0 false actions**, over-clarify 0%, warm P50 2.39 s, P95 5.38 s, P99 15.1 s (a case retried while every provider was briefly busy, then Groq). Models: gemini-3.5-flash-lite (19), gemini-3.5-flash (9), Groq gpt-oss-120b (3).

| Case | Expected | Got | Why |
|------|----------|-----|-----|
| modify-06 · "each api server can handle two thousand requests a second" | ops: capacityRps 2000 | noop | As in run 1: 2,000 rps is the default, so the model said there was nothing to change |

- ambiguity-08 passed (clarify). The guard or the model may have asked; the result is the same for the user.
- dictation-noise-02 passed with no change aimed at it: run-to-run variance on free-tier models. Treat the gap between 91.2% and 97.1% as fix + variance, not fix alone.
- **Answer groundedness 66.7%:** one of three answers cited a number that isn't in the simulator context (a new miss; run 1 was 100%).

## Final held-out test split · 2026-10-04 · commit `84949a6` · prompt `8259bf6e5201`

34 cases, run once on the final build. Task accuracy 91.2% (31/34), kind accuracy 94.1%, over-clarify 0%, fast-path precision 100%, answer groundedness 100%. **False-action rate 11.1%: one of the nine hold-back cases.** Warm AI P50 2.27 s, P95 6.74 s (N = 30). Models: gemini-2.5-flash (11), gemini-3.5-flash-lite (16), gemini-3.5-flash (4).

| Case | Expected | Got | Why |
|------|----------|-----|-----|
| ambiguity-08 · "connect the workers to the database" (two databases) | clarify | ops: email-workers → orders-db (write) | **False action.** A plausible guess (the email workers are fed by the orders queue), but two databases match "the database", so the label is to ask. With nine hold-back cases one miss is 11%; the ≤ 2% target needs zero |
| modify-06 · "each api server can handle two thousand requests a second" | ops: capacityRps 2000 | answer | 2,000 rps is the catalog default for a service, so the model said it already is. The board was left unchanged. Arguably a weak label; kept as written (labels are never changed after a run) |
| dictation-noise-02 · "post gress with two replicas behind an api" | 2 read-replica nodes | one sql node with replicas: 2 | Same miss as Phase 4: "replicas" read as identical copies, not read replicas |

## Dev split · 2026-10-04 · prompt `8259bf6e5201`

58 cases: 48/48 answered correctly, 0 false actions, 10 timed out on an overloaded free tier before the provider chain kept time for the fallback (`10f0e67`).

## Not done

The 20-random-results read for quality (odd labels, verbose messages) wasn't done as a separate pass; the failing results above were read in full.
