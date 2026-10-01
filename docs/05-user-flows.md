# 05 · User Flows

Each flow lists its steps, the system response, and the requirement it exercises. 🎙 = said with Wispr Flow (or typed).

## Overall journey

```
Home ──► New board / Template ──► Describe ──► Load ──► Find bottleneck ──► Fix
  │                                                                   │
  └──► Interview me ──► Problem ──► Design ──► Questions ──► Scorecard │
                                                                      ▼
                                              Fail things ──► Review ──► Share / Export
```

## UF-01 · First run

1. Open `/` → pitch, **New board**, **Interview me**, templates, and (empty) recent boards.
2. Click **New board** → `/b/new` → redirect to `/b/{id}`.
3. Empty board shows a centred hint with three example sentences, and the command bar is focused.
4. A one-time tooltip on the hands-free toggle: *"Using Wispr Flow? Turn on hands-free and just talk."*

## UF-02 · Describe a system (F-01, F-02, F-03)

1. 🎙 *"Users hit two load balancers, thirty API servers behind them, Postgres primary with two read replicas, and a Redis cache."*
2. Fast path misses (multi-component) → command bar shows "✦ thinking…" and a ghost shimmer on the canvas.
3. AI returns `kind: ops` (7 addNode + connects, with replicas set in props).
4. Nodes animate in, the layout settles, new nodes pulse, and a toast says *"Added 7 components"* with **Undo**.
5. The result is the `three-tier` golden graph ([10](10-traffic-model.md)), so the numbers below match the tests.
6. Badge: `✦ AI · 1.9 s`.

## UF-03 · Load the system (F-05)

1. 🎙 *"Send fifty thousand requests a second, ninety percent reads."*
2. Fast path hit → `setWorkload` → badge `⚡ local · 3 ms`.
3. Simulation runs; particles flow; `postgres-primary` turns red.
4. Bottleneck callout above the node: *"1,500 reads/s + 5,000 writes/s on 1 shard (capacity 10,000 reads / 4,000 writes per shard) → ρ = 1.40 → 28.6% of its requests dropped. Consider: shard the database, or reduce writes."*
5. Metrics panel: success **96.3%** (every write and a third of cache-miss reads touch pg: 0.9 × 0.9905 + 0.1 × 0.7143), throughput 48.1k rps, p50/p95/p99 for reads and writes, cost.

## UF-04 · Fix it (F-02, F-05)

1. 🎙 *"Shard Postgres into two."*
2. Fast path → `updateNode {shards: 2}` → ρ drops to 0.70, the node turns warm (amber), success **100%**. The bottleneck moves to the API (ρ 0.83).
3. The event log shows both utterances. **Undo** brings the red back (great for the demo).

## UF-05 · Break it (F-06)

1. 🎙 *"Kill Redis."* → fast path → `fail redis` → node greyed with a ✕.
2. Cache hit rate → 0: reads to the Postgres cluster go from 4,500/s to 45,000/s (15,000 per pool member), both replicas saturate. The blast-radius panel shows success **96.3% → 54.5%**, read p99 ~0.6 s → ~1.3 s, and lists the newly hot replicas.
3. 🎙 *"Bring it back."* → `recover redis` (the reference resolves from the last event).

## UF-06 · Clarify (F-07)

1. Board has `orders-db` and `users-db`. 🎙 *"Connect the payment service to the database."*
2. AI → `kind: clarify`, message *"Which database?"*, chips **orders-db** · **users-db**.
3. User taps a chip **or** says *"orders"* → the original utterance is re-sent with the choice → ops.

## UF-07 · Confirm destructive (F-07)

1. 🎙 *"Clear the board."* → `kind: confirm`, *"This removes 11 components."* → **Remove** / **Cancel**.
2. Confirm applies the held ops locally (no second AI call). It's still undoable.

## UF-08 · Off-topic (F-07)

🎙 *"What's the weather in Goa?"* → `kind: noop` → toast *"I can only help with this design."* The board is untouched.

## UF-09 · Ask the board (F-08)

🎙 *"Where's the single point of failure?"* → `kind: answer` → answer card: *"The load balancer: it's the only path from clients, and killing it drops success to 0%."* plus chip `lb`, which highlights the node on hover.

## UF-10 · Interview (F-10)

1. `/interview` → pick **Design a news feed** → board opens in interview mode with the problem card and requirements.
2. The SLO checklist starts all-red (empty board).
3. The user designs by voice; checks turn green live as the simulator re-runs.
4. Every few changes (or on **Next question**), the interviewer asks one targeted question (TTS on).
5. The user answers by voice in the interview panel (the transcript is kept).
6. **Finish** → scorecard: checks ✅/❌ with actual numbers, rubric 1–5 × 5 with evidence, summary.

## UF-11 · Review (F-11)

**Review** → 3–6 findings ordered by severity → **Apply fix** on one → ops validated and applied → re-simulated → the finding is marked resolved.

## UF-12 · Share & export (F-12)

**Share** → copies `/s#v1:…` → the recipient sees a read-only board with a live sim → **Duplicate** saves it to their boards. **Export ▾** → Mermaid / PNG / SVG / Design doc / JSON.

## UF-13 · Replay (F-13)

`/b/{id}/replay` → timeline of utterances → scrub or play → the board rebuilds step by step.

## Error flows

| Flow | Trigger | User sees |
|------|---------|-----------|
| EF-01 | AI down / rate limited | Toast: "AI unavailable, local commands still work" + `Retry`; banner if persistent |
| EF-02 | Board changed during an AI call | Toast: "Board changed while I was thinking, please repeat" |
| EF-03 | Model refused | Toast: "I can't help with that one." |
| EF-04 | IndexedDB blocked | Banner: "This browser won't save boards. Use Export." |
| EF-05 | Bad share link | Page: "This link is broken or from a newer version." + Home |
| EF-06 | Daily cap reached | Banner: "Demo AI quota used up for today. Local commands still work." |
