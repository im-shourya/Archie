# 00 · Project Overview

> Read this first. It explains the whole project in under 5 minutes and tells you (or an AI agent) which doc to open next.

## Project name

**Archie**

## One-line description

A voice-first system-design board. Describe an architecture out loud, watch it draw itself, then put real traffic through it, break it, and get questioned by an AI interviewer that grades with a simulator.

## Problem

System design is a *spoken* skill (interviews, design reviews, whiteboarding), but every tool for it is mouse-driven, and the diagrams are dead: a box labelled "Postgres" can't tell you it saturates at 5,000 writes/s. Interview prep gives no feedback on whether a design would actually hold up.

## Solution

- **Voice → typed graph ops.** One dictation-friendly command bar (built for Wispr Flow). A deterministic local grammar handles common commands in milliseconds, and Claude handles open-ended language, emitting **validated ops**. The board is never regenerated.
- **A real simulator.** A deterministic queueing model computes load, utilization, latency (p50/p99), errors, backlog and cost. Every red node explains itself with numbers.
- **Guardrails.** Ambiguity → clarify, destructive → confirm, off-topic → no-op, invalid → repair or clarify.
- **Interview mode.** SLO checks computed by the simulator, plus an AI interviewer that probes the weakest point.
- **Measured.** An eval set with accuracy per category, and latency P50/P70/P95/P100 per tier.

## Target users

Students preparing for system-design interviews · engineers sanity-checking a design · mentors teaching *why* caches, replicas and queues exist.

## Core features

| ID | Feature | Priority |
|----|---------|----------|
| F-01 | Voice command bar + hands-free mode | P0 |
| F-02 | Two-tier command engine (fast path + AI) | P0 |
| F-03 | Graph ops, validation, undo/redo, event log | P0 |
| F-04 | Canvas with auto-layout + animated traffic | P0 |
| F-05 | Simulator (traffic, queueing, latency, errors) | P0 |
| F-06 | Failure injection | P0 |
| F-07 | AI guardrails (clarify / confirm / noop / repair) | P0 |
| F-08 | Ask the board (grounded answers) | P0 |
| F-09 | Local boards + templates | P0 |
| F-10 | Interview mode + SLO checks + scorecard | P1 |
| F-11 | Design review + apply fix | P1 |
| F-12 | Share links + exports | P1 |
| F-13 | Session replay | P1 |
| F-14 | Eval & latency report page | P1 |

Full detail: [03-product-spec.md](03-product-spec.md).

## Tech stack

| Area | Choice |
|------|--------|
| Frontend | Next.js (App Router) + React + TypeScript, React Flow (`@xyflow/react`), elkjs, Zustand |
| Backend | Hono (TypeScript), mounted in Next.js at `/api/*` via `hono/vercel` |
| Simulator | Pure TypeScript package (no runtime deps) |
| AI | Claude API, `@anthropic-ai/sdk`, model `claude-opus-5-5`, structured outputs |
| Database | No server DB. IndexedDB in the browser (`idb`), share links in the URL hash ([ADR-003](30-architecture-decisions.md)) |
| Authentication | None (no accounts). Rate limits + optional access code ([ADR-004](30-architecture-decisions.md)) |
| Validation / contracts | Zod in code, JSON Schema + OpenAPI in `specs/` |
| Testing | Vitest, Playwright, custom eval runner |
| Deployment | Vercel (single deploy), GitHub Actions CI |
| Design | IBM Plex Sans + Mono (`next/font`), Lucide icons, semantic CSS tokens ([06](06-ui-ux.md#design-system)) |
| Voice | Wispr Flow (system-wide dictation), Web Speech API fallback (planned) |

## High-level flow

```
                 🎙 Wispr Flow dictation
                          │ text
                          ▼
┌──────────────────────── Browser ─────────────────────────┐
│ Command bar ──► Fast path (ai/fastpath) ──hit──► Ops      │
│                      │ miss                        │      │
│                      ▼                             ▼      │
│              POST /api/command ◄───────── applyBatch()    │
│                      │                     (simulator)    │
│                      │                             │      │
│                      │                     simulate() ──► Canvas + Metrics
│                      │                             │      │
│                      │                     IndexedDB (database)
└──────────────────────┼─────────────────────────────────────┘
                       ▼
┌──────────── Backend (Hono in Next.js) ─────────────┐
│ rate limit → validate → AI harness (ai/llm)         │
│    → Claude API (structured output)                 │
│    → validate ops (simulator) → repair → guardrails │
└─────────────────────────────────────────────────────┘
```

## Project status

**Development**: Phases 0–3 built (scaffold, graph engine + canvas, voice fast path, simulator). Live status: [31-project-state.md](31-project-state.md).

## Repository structure

```
archie/
├── frontend/     Next.js app: pages, canvas, command bar, panels   → 05, 06
├── backend/      Hono API: routes, rate limit, error mapping       → 16
├── simulator/    graph model, ops, simulation engine (pure TS)     → 07–11
├── ai/           fastpath/ (browser-safe) + llm/ (server-only)     → 12–15
├── database/     IndexedDB repository, migrations, share codec     → 17
├── evals/        eval cases, runner, results                       → 22–24
├── tests/        integration + e2e (Playwright)                    → 21
├── infra/        Vercel config, CI helpers                         → 25
├── specs/        JSON Schemas + OpenAPI (machine-readable contracts)
├── docs/         this documentation
└── .github/      CI workflow, issue + PR templates
```

## Doc map

| Layer | Docs |
|-------|------|
| **Product** | [01 idea](01-idea.md) · [02 requirements](02-requirements.md) · [03 product spec](03-product-spec.md) · [05 user flows](05-user-flows.md) · [06 UI/UX](06-ui-ux.md) · [29 roadmap](29-roadmap.md) |
| **Architecture** | [04 system](04-system-architecture.md) · [07 graph model](07-graph-model.md) · [08 graph ops](08-graph-operations.md) · [16 API](16-api.md) · [17 database](17-database.md) · [30 ADRs](30-architecture-decisions.md) |
| **Simulation** | [09 engine](09-simulation-engine.md) · [10 traffic](10-traffic-model.md) · [11 failure](11-failure-model.md) |
| **AI** | [12 architecture](12-ai-architecture.md) · [13 command understanding](13-command-understanding.md) · [14 guardrails](14-ai-guardrails.md) · [15 retry & recovery](15-ai-retry-recovery.md) |
| **Security** | [18 authentication](18-authentication.md) · [19 authorization](19-authorization.md) · [20 security](20-security.md) |
| **Quality** | [21 testing](21-testing.md) · [22 evaluation](22-evaluation.md) · [23 eval dataset](23-eval-dataset.md) · [24 latency benchmark](24-latency-benchmark.md) |
| **Operations** | [25 deployment](25-deployment.md) · [26 monitoring](26-monitoring.md) · [27 performance](27-performance.md) · [28 disaster recovery](28-disaster-recovery.md) |
| **Tracking** | [31 project state](31-project-state.md) · [32 Phase 4 plan](32-phase-4-plan.md) · [33 Phase 5 plan](33-phase-5-plan.md) · [34 Phase 6 plan](34-phase-6-plan.md) · [35 Phase 7 plan](35-phase-7-plan.md) · [36 Phase 8 plan](36-phase-8-plan.md) · [frontend design](design/frontend-design.md) · [99 challenge rules](99-challenge.md) |

## For AI agents building this repo

1. Read `00` → `02` → `04`, then the docs for the area you're working in.
2. Every feature has an ID (`F-xx`), every requirement has an ID (`FR-xxx` / `NFR-xxx`), and [02](02-requirements.md) maps each to a module and test. Reference IDs in commits and PRs.
3. `specs/*.json` and `specs/openapi.yaml` are the **contracts**. Zod schemas in code must match them (enforced by `tests/contracts`).
4. Don't invent architecture. If something isn't specified, propose an ADR in [30](30-architecture-decisions.md) first.
5. Update [31-project-state.md](31-project-state.md) at the end of every phase.
6. Never commit `.claude/`.
