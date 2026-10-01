# 02 · Requirements

The master checklist. Every requirement has an ID, a priority, a phase, and a test. Status values: `Planned` · `In progress` · `Done` · `Cut`.

## Functional requirements

### Voice & commands (F-01, F-02)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-001 | The command bar accepts dictated or typed text. `Enter` submits, `/` or `⌘K` focuses it | P0 | 2 | Planned |
| FR-002 | Hands-free mode auto-submits when the input is unchanged for 1.2 s | P0 | 2 | Planned |
| FR-003 | The fast path converts deterministic commands (undo, kill, connect, replicas, workload…) to ops **locally** | P0 | 2 | Planned |
| FR-004 | The fast path returns *no result* when any reference is ambiguous or words are left unparsed | P0 | 2 | Planned |
| FR-005 | Commands not handled by the fast path are sent to the AI tier, which returns typed ops | P0 | 4 | Planned |
| FR-006 | The command bar shows the tier and latency of each command (`⚡ local · 4 ms`, `✦ AI · 1.8 s`) | P0 | 2 | Planned |
| FR-007 | Command history is recallable with `↑`/`↓` | P1 | 2 | Planned |

### Graph (F-03, F-04)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-010 | All graph changes happen through ops applied as an **atomic batch** | P0 | 1 | Planned |
| FR-011 | Ops are validated (references, kinds, bounds, cycles) before any is applied | P0 | 1 | Planned |
| FR-012 | Undo/redo work per batch | P0 | 1 | Planned |
| FR-013 | Every batch is logged with its utterance, tier, and timestamp | P0 | 1 | Planned |
| FR-014 | The canvas renders the graph with automatic layered layout; dragged nodes stay pinned | P0 | 1 | Planned |
| FR-015 | Nodes added or changed by the last batch are highlighted briefly | P0 | 1 | Planned |
| FR-016 | The inspector shows a node's props, live metrics and explanation; props are editable | P0 | 5 | Planned |

### Simulation (F-05, F-06)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-020 | The workload (rps, read ratio, peak multiplier) is settable by voice | P0 | 2 | Planned |
| FR-021 | The simulator computes per-node arrival rate, utilization, mean latency, error rate, backlog | P0 | 3 | Planned |
| FR-022 | The simulator computes end-to-end p50/p95/p99 (read and write), success rate, throughput | P0 | 3 | Planned |
| FR-023 | The highest-utilization node is highlighted with a numeric explanation | P0 | 3 | Planned |
| FR-024 | Edge animation density is proportional to rps; failed traffic is shown distinctly | P0 | 3 | Planned |
| FR-025 | Nodes can be failed/recovered by voice; effects (reroute, failover, degradation) are simulated | P0 | 3 | Planned |
| FR-026 | Simulation re-runs automatically after every change | P0 | 3 | Planned |
| FR-027 | SPOF scan identifies nodes whose failure drops success below 99% | P1 | 6 | Planned |
| FR-028 | An estimated monthly cost is shown | P1 | 6 | Planned |

### AI & guardrails (F-07, F-08)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-030 | Ambiguous commands produce a clarifying question with selectable options | P0 | 4 | Planned |
| FR-031 | Commands removing > 3 nodes or clearing the board require confirmation | P0 | 4 | Planned |
| FR-032 | Off-topic input produces a no-op message and leaves the board unchanged | P0 | 4 | Planned |
| FR-033 | Invalid AI ops trigger one repair attempt, then fall back to clarify | P0 | 4 | Planned |
| FR-034 | Questions about the board are answered using the current graph + simulation, with highlighted nodes | P0 | 4 | Planned |
| FR-035 | If the board changed while the AI was thinking, ops are re-validated before applying | P0 | 4 | Planned |

### Boards (F-09, F-12, F-13)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-040 | Boards auto-save locally; Home lists recent boards | P0 | 1 | Planned |
| FR-041 | Templates: three-tier, URL shortener, chat | P0 | 1 | Planned |
| FR-042 | Read-only share link (graph in the URL hash) with "Duplicate" | P1 | 7 | Planned |
| FR-043 | Export Mermaid, PNG/SVG, design doc (Markdown), JSON | P1 | 7 | Planned |
| FR-044 | Session replay scrubs through the event log | P1 | 7 | Planned |

### Interview & review (F-10, F-11)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-050 | Problem bank with requirements (DAU, peak rps, read ratio, p99, availability) | P1 | 6 | Planned |
| FR-051 | SLO checks are computed by the simulator, not the LLM | P1 | 6 | Planned |
| FR-052 | The interviewer asks one question at a time, targeted at the weakest point, optionally read aloud | P1 | 6 | Planned |
| FR-053 | The scorecard combines SLO checks and a 5-dimension rubric with cited evidence | P1 | 6 | Planned |
| FR-054 | Design review returns findings with severity and an optional fix as validated ops | P1 | 6 | Planned |

### Evals (F-14)

| ID | Requirement | Pri | Phase | Status |
|----|-------------|-----|-------|--------|
| FR-060 | `npm run eval` runs every case end to end and writes a results JSON | P0 | 4 | Planned |
| FR-061 | `/evals` renders accuracy per category and latency percentiles per tier | P1 | 7 | Planned |
| FR-062 | Mic button fallback (Web Speech API) for users without Wispr Flow | P1 | 5 | Planned |

## Non-functional requirements

| ID | Requirement | Target | Verified by |
|----|-------------|--------|-------------|
| NFR-001 | Fast-path latency | P50 < 10 ms, P100 < 50 ms | `bench:fast` |
| NFR-002 | AI command latency (server, warm) | P50 < 3 s, P95 < 6 s | `npm run eval` timings |
| NFR-003 | `simulate()` latency at 100 nodes | P95 < 5 ms | `bench:sim` |
| NFR-004 | Layout at 50 nodes, off main thread | < 100 ms | `bench:layout` |
| NFR-005 | Canvas frame rate with traffic animation, 50 nodes | ≥ 50 fps | manual + Performance panel |
| NFR-006 | Command accuracy on the held-out test split | ≥ 90% overall | eval report |
| NFR-007 | False-action rate (acted when it should have clarified/confirmed/noop'd) | ≤ 2% | eval report |
| NFR-008 | Simulator determinism (same graph → identical result) | 100% | unit test |
| NFR-009 | Anthropic API key never reaches the browser | 0 occurrences in client bundle | CI grep on `.next/static` |
| NFR-010 | All API input validated with size caps | 100% routes | contract tests |
| NFR-011 | Rate limit on AI routes | 20/min/IP command, 6/min/IP interview/review | integration test |
| NFR-012 | Accessibility | WCAG 2.2 AA contrast, full keyboard operation | axe + manual |
| NFR-013 | Responsive | usable from 360 px width | Playwright viewport tests |
| NFR-014 | Reduced motion | traffic animation off when `prefers-reduced-motion` | e2e test |
| NFR-015 | Board route initial JS | < 300 KB gzipped (ELK lazy-loaded) | build report |
| NFR-016 | Graceful AI outage | fast path, simulator, undo, save keep working; banner shown | e2e with API mocked down |
| NFR-017 | Persistence | board survives refresh and browser restart | e2e test |
| NFR-018 | Repo hygiene | no secrets, `.claude/` never committed | CI + local hooks |

## Traceability

| Req | Spec doc | Module | Test |
|-----|----------|--------|------|
| FR-003/004 | [13](13-command-understanding.md) | `ai/src/fastpath` | `ai/src/fastpath/*.test.ts` |
| FR-005, 030–035 | [12](12-ai-architecture.md), [14](14-ai-guardrails.md), [15](15-ai-retry-recovery.md) | `ai/src/llm/harness.ts` | `ai/src/llm/harness.test.ts`, evals |
| FR-010–013 | [08](08-graph-operations.md) | `simulator/src/graph/ops.ts` | `ops.test.ts`, `validate.test.ts` |
| FR-014–016 | [06](06-ui-ux.md) | `frontend/src/features/board` | e2e `board.spec.ts` |
| FR-020–028 | [09](09-simulation-engine.md)–[11](11-failure-model.md) | `simulator/src/sim` | golden tests `sim.golden.test.ts` |
| FR-040–044 | [17](17-database.md) | `database/src` | `repo.test.ts`, `share.test.ts` |
| FR-050–054 | [12](12-ai-architecture.md) | `simulator/src/interview`, `ai/src/llm` | `slo.test.ts`, evals |
| FR-060–061 | [22](22-evaluation.md)–[24](24-latency-benchmark.md) | `evals/` | — |
| NFR-001–005 | [24](24-latency-benchmark.md), [27](27-performance.md) | — | benches |
| NFR-009–011 | [20](20-security.md) | `backend/src` | `tests/integration` |
