# 02 · Requirements

The master checklist. Every requirement has an ID, a priority, a phase, and a test. Status values: `Planned` · `In progress` · `Done` · `Cut`. Last reviewed during Phase 7 (2026-10-04): share, export, replay and `/evals` are built; the final eval run and the deployment are still open.

## Functional requirements

### Voice & commands (F-01, F-02)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-001 | The command bar accepts dictated or typed text. `Enter` submits, `/` or `⌘K` focuses it | P0 | 2 | Done |
| FR-002 | Hands-free mode auto-submits when the input is unchanged for 1.2 s | P0 | 2 | Done |
| FR-003 | The fast path converts deterministic commands (undo, kill, connect, replicas, workload…) to ops **locally** | P0 | 2 | Done |
| FR-004 | The fast path returns *no result* when any reference is ambiguous or words are left unparsed | P0 | 2 | Done |
| FR-005 | Commands not handled by the fast path are sent to the AI tier, which returns typed ops | P0 | 4 | Planned |
| FR-006 | The command bar shows the tier and latency of each command (`local · 4 ms` (lightning icon), `AI · 1.8 s` (sparkles icon)) | P0 | 2 | Done |
| FR-007 | Command history is recallable with `↑`/`↓` | P1 | 2 | Done |

### Graph (F-03, F-04)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-010 | All graph changes happen through ops applied as an **atomic batch** | P0 | 1 | Done |
| FR-011 | Ops are validated (references, kinds, bounds, cycles) before any is applied | P0 | 1 | Done |
| FR-012 | Undo/redo work per batch | P0 | 1 | Done |
| FR-013 | Every batch is logged with its utterance, tier, and timestamp | P0 | 1 | Done |
| FR-014 | The canvas renders the graph with automatic layered layout; dragged nodes stay pinned | P0 | 1 | Done |
| FR-015 | Nodes added or changed by the last batch are highlighted briefly | P0 | 1 | Done |
| FR-016 | The inspector shows a node's props, live metrics and explanation; props are editable | P0 | 5 | Done |

### Simulation (F-05, F-06)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-020 | The workload (rps, read ratio, peak multiplier) is settable by voice | P0 | 2 | Done |
| FR-021 | The simulator computes per-node arrival rate, utilization, mean latency, error rate, backlog | P0 | 3 | Done |
| FR-022 | The simulator computes end-to-end p50/p95/p99 (read and write), success rate, throughput | P0 | 3 | Done |
| FR-023 | The highest-utilization node is highlighted with a numeric explanation | P0 | 3 | Done |
| FR-024 | Edge animation density is proportional to rps; failed traffic is shown distinctly | P0 | 3 | Done |
| FR-025 | Nodes can be failed/recovered by voice; effects (reroute, failover, degradation) are simulated | P0 | 3 | Done |
| FR-026 | Simulation re-runs automatically after every change | P0 | 3 | Done |
| FR-027 | SPOF scan identifies components whose single-instance loss costs ≥ 5% of successful requests (doc 11) | P1 | 6 | Done |
| FR-028 | An estimated monthly cost is shown | P1 | 6 | Done |

### AI & guardrails (F-07, F-08)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-030 | Ambiguous commands produce a clarifying question with selectable options | P0 | 4 | Done |
| FR-031 | Commands removing > 3 nodes or clearing the board require confirmation | P0 | 4 | Done |
| FR-032 | Off-topic input produces a no-op message and leaves the board unchanged | P0 | 4 | Done |
| FR-033 | Invalid AI ops trigger one repair attempt, then fall back to clarify | P0 | 4 | Done |
| FR-034 | Questions about the board are answered using the current graph + simulation, with highlighted nodes | P0 | 4 | Done |
| FR-035 | If the board changed while the AI was thinking, ops are re-validated before applying | P0 | 4 | Done |

### Boards (F-09, F-12, F-13)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-040 | Boards auto-save locally; Home lists recent boards | P0 | 1 | Done |
| FR-041 | Templates: three-tier, URL shortener, chat | P0 | 1 | Done |
| FR-042 | Read-only share link (graph in the URL hash) with "Duplicate" | P1 | 7 | Done |
| FR-043 | Export Mermaid, PNG/SVG, design doc (Markdown), JSON; Open file imports JSON | P1 | 7 | Done |
| FR-044 | Session replay scrubs through the event log | P1 | 7 | Done |

### Interview & review (F-10, F-11)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-050 | Problem bank with requirements (DAU, peak rps, read ratio, p99, availability) | P1 | 6 | Done |
| FR-051 | SLO checks are computed by the simulator, not the LLM | P1 | 6 | Done |
| FR-052 | The interviewer asks one question at a time, targeted at the weakest point, optionally read aloud | P1 | 6 | Done |
| FR-053 | The scorecard combines SLO checks and a 5-dimension rubric with cited evidence | P1 | 6 | Done |
| FR-054 | Design review returns findings with severity and an optional fix as validated ops | P1 | 6 | Done |

### Evals (F-14)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-060 | `npm run eval` runs every case end to end and writes a results JSON | P0 | 4 | Done |
| FR-061 | `/evals` renders accuracy per category and latency percentiles per tier | P1 | 7 | Done |
| FR-062 | Mic button fallback (Web Speech API) for users without Wispr Flow | P1 | 5 | Done |

## Non-functional requirements

| ID | Requirement | Target | Verified by | Status |
|----|-------------|--------|-------------|--------|
| NFR-001 | Fast-path latency | P50 < 10 ms, P100 < 50 ms | `bench:fast` | ✅ P50 0.006 ms, P100 0.138 ms |
| NFR-002 | AI command latency (server, warm) | P50 < 3 s, P95 < 6 s | `npm run eval` timings | Phase 4 |
| NFR-003 | `simulate()` latency at 100 nodes | P95 < 5 ms | `bench:sim` | ✅ P95 2.33 ms |
| NFR-004 | Layout at 50 nodes, off main thread | < 100 ms | `bench:layout` | Not yet benchmarked |
| NFR-005 | Canvas frame rate with traffic animation, 50 nodes | ≥ 50 fps | manual + Performance panel | Not yet measured |
| NFR-006 | Command accuracy on the held-out test split | ≥ 90% overall | eval report | Phase 4 |
| NFR-007 | False-action rate (acted when it should have clarified/confirmed/noop'd) | ≤ 2% | eval report | Phase 4 |
| NFR-008 | Simulator determinism (same graph → identical result) | 100% | unit test | ✅ unit test |
| NFR-009 | Anthropic API key never reaches the browser | 0 occurrences in client bundle | CI grep on `.next/static` | ✅ CI grep (no LLM code yet) |
| NFR-010 | All API input validated with size caps | 100% routes | contract tests | ✅ 256 KB body limit + Zod on `/api/command` (≤ 4,000-char utterance, ≤ 200 nodes) |
| NFR-011 | Rate limit on AI routes | 20/min/IP command, 6/min/IP interview/review | integration test | ✅ command (integration tests); interview/review in Phase 6 |
| NFR-012 | Accessibility | WCAG 2.2 AA contrast, full keyboard operation | axe + manual | ✅ axe gate: 0 serious/critical over 9 states × light/dark × desktop/phone; keyboard journey e2e |
| NFR-013 | Responsive | usable from 360 px width | Playwright viewport tests | ✅ bottom sheet, toast placement and label legibility e2e (Pixel 7, 768 px tablet, landscape) |
| NFR-014 | Reduced motion | traffic animation off when `prefers-reduced-motion` | e2e test | ✅ e2e: no particles, outline flash instead of pulse, static shimmer |
| NFR-015 | Board route initial JS | < 300 KB gzipped (ELK lazy-loaded) | build report | Measured: 318.7 KB (over by 18.7 KB; zod classic ≈ 90 KB). CI ratchet at 320 KB until zod/mini |
| NFR-016 | Graceful AI outage | fast path, simulator, undo, save keep working; banner shown | e2e with API mocked down | ✅ degraded-mode e2e |
| NFR-017 | Persistence | board survives refresh and browser restart | e2e test | ✅ e2e reload test |
| NFR-018 | Repo hygiene | no secrets, `.claude/` never committed | CI + local hooks | ✅ hooks + CI guard |

## Traceability

| Req | Spec doc | Module | Test |
|-----|----------|--------|------|
| FR-003/004 | [13](13-command-understanding.md) | `ai/src/fastpath` | `ai/src/fastpath/*.test.ts` |
| FR-005, 030–035 | [12](12-ai-architecture.md), [14](14-ai-guardrails.md), [15](15-ai-retry-recovery.md) | `ai/src/llm/harness.ts` | `ai/src/llm/harness.test.ts`, evals |
| FR-010–013 | [08](08-graph-operations.md) | `simulator/src/graph/ops.ts` | `ops.test.ts`, `validate.test.ts` |
| FR-014–016 | [06](06-ui-ux.md) | `frontend/src/features/board` | e2e `board.spec.ts` |
| FR-020–028 | [09](09-simulation-engine.md)–[11](11-failure-model.md) | `simulator/src/sim` | golden tests `sim.golden.test.ts` |
| FR-040–044 | [17](17-database.md) | `database/src` | `repo.test.ts`, `share.test.ts` |
| FR-050–054 | [12](12-ai-architecture.md), [34](34-phase-6-plan.md) | `simulator/src/{interview,review}`, `ai/src/llm/{interview,score,review}.ts` | `problems.test.ts`, `rules.test.ts`, `interview.test.ts`, `score.test.ts`, `review.test.ts`, e2e `interview`/`review` |
| FR-060–061 | [22](22-evaluation.md)–[24](24-latency-benchmark.md) | `evals/`, `frontend/src/app/evals` | `dataset.test.ts`, `report.test.ts`, e2e `evals` |
| NFR-001–005 | [24](24-latency-benchmark.md), [27](27-performance.md) | — | benches |
| NFR-009–011 | [20](20-security.md) | `backend/src` | `tests/integration` |
