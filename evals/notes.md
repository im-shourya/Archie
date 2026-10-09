# Eval notes (docs/22 · Human review)

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
