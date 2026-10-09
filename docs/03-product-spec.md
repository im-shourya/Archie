# 03 · Product Spec

What we're building, feature by feature, and in what order. Priority: **P0** must ship · **P1** should ship · **P2** stretch.

## Feature table

| ID | Feature | Pri | Phase | Requirements | Status |
|----|---------|-----|-------|--------------|--------|
| F-01 | Voice command bar + hands-free | P0 | 2 | FR-001, 002, 006, 007, 062 | Done (mic fallback: Phase 5) |
| F-02 | Two-tier command engine | P0 | 2, 4 | FR-003–005 | In progress (fast path done; AI tier Phase 4) |
| F-03 | Graph ops, undo/redo, event log | P0 | 1 | FR-010–013 | Done |
| F-04 | Canvas, layout, inspector | P0 | 1, 5 | FR-014–016 | In progress (inspector editing: Phase 5) |
| F-05 | Simulator | P0 | 3 | FR-020–024, 026 | Done |
| F-06 | Failure injection | P0 | 3 | FR-025, 027 | Done (SPOF scan: Phase 6) |
| F-07 | AI guardrails | P0 | 4 | FR-030–033, 035 | Planned |
| F-08 | Ask the board | P0 | 4 | FR-034 | Planned |
| F-09 | Local boards + templates | P0 | 1 | FR-040, 041 | Done |
| F-10 | Interview mode | P1 | 6 | FR-050–053 | Done |
| F-11 | Design review | P1 | 6 | FR-054 | Done |
| F-12 | Share + export | P1 | 7 | FR-042, 043 | Done |
| F-13 | Session replay | P1 | 7 | FR-044 | Done |
| F-14 | Eval report page | P1 | 7 | FR-060, 061 | Done |
| F-15 | Cost estimate | P1 | 6 | FR-028 | Done |
| F-16 | Multiplayer board | P2 | — | — | Backlog |
| F-17 | `docker-compose.yml` export | P2 | — | — | Backlog |
| F-18 | Regions / zones | P2 | — | — | Backlog |

## F-01 · Voice command bar

- A single input pinned to the bottom of the board, built for Wispr Flow dictation.
- **Hands-free** (`H`): when the text stops changing for 1.2 s, it submits. A thin progress ring shows the countdown and any keypress cancels it.
- Badge after each command: tier + latency.
- `↑`/`↓` history. The placeholder rotates real examples: *"Add a Redis cache in front of Postgres"*, *"Kill the cache"*.
- Mic fallback button (Web Speech API), hidden if the browser doesn't support it.

## F-02 · Two-tier command engine

| Tier | Where | Handles | Latency target |
|------|-------|---------|----------------|
| Fast path | browser, `ai/fastpath` | undo/redo, kill/recover, delete, connect, replicas/shards, workload, sim/view actions | P50 < 10 ms |
| AI | backend, `ai/llm` | multi-component descriptions, refactors, insertions, questions | P50 < 3 s |

Spec: [13-command-understanding.md](13-command-understanding.md).

## F-03 · Graph ops

10 op types, atomic batches, snapshot undo/redo (ADR-011), an event log, and version numbers. Spec: [08-graph-operations.md](08-graph-operations.md).

## F-04 · Canvas

React Flow with custom node cards (icon, label, `×N` replicas badge, ρ bar, status colour), ELK layered layout in a Web Worker, animated position transitions, a pulse on changed nodes, and an inspector panel. Spec: [06-ui-ux.md](06-ui-ux.md).

## F-05 · Simulator

Per node: λ, ρ, mean latency, errors, backlog. System: p50/p95/p99, success rate, throughput, bottleneck with explanation. Re-runs on every change in < 5 ms. Spec: [09](09-simulation-engine.md), [10](10-traffic-model.md).

## F-06 · Failure injection

`fail` / `recover` by voice; LB reroute, SQL failover, cache degradation, queue backlog; SPOF scan (P1). Spec: [11-failure-model.md](11-failure-model.md).

## F-07 · AI guardrails

Clarify / confirm / noop / repair / bounds / op budget. Spec: [14-ai-guardrails.md](14-ai-guardrails.md).

## F-08 · Ask the board

*"Why is checkout slow?"* → an answer citing simulator numbers, with node chips that highlight on hover.

## F-09 · Boards & templates

Auto-saved to IndexedDB; Home lists recent boards (name, node count, updated). Templates: `three-tier`, `url-shortener`, `chat`.

## F-10 · Interview mode

Six problems: URL shortener, rate limiter, chat, news feed, ride dispatch, video streaming, each with a reference design golden-tested to pass every check. Requirements set the workload automatically. A live SLO checklist computed by the simulator at the problem's peak (availability, read/write p99, headroom, single-failure survival, cost), one interviewer question per turn (grounded in a node or a failing check, deterministic hints when the AI is unavailable, at most 8 AI turns, TTS optional), and a final scorecard (computed checks + an evidence-checked rubric over scalability, availability, data modelling, trade-offs and communication; the overall score is computed in code).

## F-11 · Design review

Up to 6 findings `{severity, nodeIds, title, detail, fix?}`: deterministic rule findings (SPOFs, hot components, uncached read paths, budget) whose fixes are found by simulation, plus up to 4 AI findings whose fixes pass `validateBatch`. "Apply fix" runs the ops through the store (undoable, logged as "review fix"). Works with the AI down (rules only).

## F-12 · Share & export

`/s#v1:<lz>` read-only viewer with "Duplicate". Export Mermaid, PNG/SVG, Markdown design doc (components, workload, sim numbers, findings) and JSON.

## F-13 · Session replay

A timeline scrubber over the event log, replaying batches from an empty board.

## F-14 · Eval report

`/evals`: overall + per-category accuracy, false-action rate, fast-path hit rate, latency P50/P70/P95/P100 per tier, and the date/commit of the run.

## MVP definition

**The MVP is F-01 → F-09.** The demo must show: describe → draw → load → bottleneck explained → fix → fail → clarify → answer. F-10 is the headline P1 and should be built if Phase 6 starts by Sunday morning.
