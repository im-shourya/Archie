# 29 · Roadmap

Where the project is going. Live status is in [31-project-state.md](31-project-state.md). Each phase is one branch + one PR ([CONTRIBUTING](../CONTRIBUTING.md)).

**Build order principle:** core engine → UI → AI. The simulator and op engine make the demo *correct*; the AI plugs into an engine that already validates and simulates.

| Day | Phase | Branch | Done when |
|-----|-------|--------|-----------|
| Thu 1 Oct | 0 Setup | `chore/scaffold` | monorepo builds, CI green, `/api/health` ok |
| Thu 1 Oct | 1 Core graph + canvas | `feat/core-graph` | template renders; ops/undo tested |
| Fri 2 Oct | 2 Fast path + command bar | `feat/fastpath` | voice commands work locally < 10 ms |
| Fri 2 Oct | 3 Simulator | `feat/simulator` | golden tests pass; red bottleneck + particles |
| Sat 3 Oct | 4 AI harness + evals v1 | `feat/ai-harness` | 5 result kinds work; 30 cases ≥ 85% |
| Sat 3 Oct | 5 Design pass | `feat/design-system` | tokens, dark mode, responsive, a11y |
| Sun 4 Oct | 6 Interview + review + SPOF | `feat/interview` | scorecard end to end |
| Sun 4 Oct | 7 Evals + ship | `chore/evals-deploy` | ≥ 80 cases, numbers published, deployed |
| Mon 5 Oct | 8 Record + submit | — | form submitted by 21:00 |
| Tue 6 Oct | Buffer | `fix/*` only | — |

**Cut line (decide Sat 22:00):** drop F-13 replay, F-11 review, the `/evals` *page* (keep numbers in the README), in that order. **Never cut:** F-05 simulator, F-07 guardrails, eval numbers.

---

## Phase 0 · Setup

**Status:** ✅ merged in #2 (Wispr Flow signup and recording are on you).
- [ ] Wispr Flow account via <https://ref.wisprflow.ai/hhg> (screenshot)
- [ ] Recording test: screen + mic + Wispr overlay
- [ ] npm workspaces: `frontend backend simulator ai database evals`, TS project references, shared `tsconfig.base.json`, ESLint (with the `ai/llm` import ban), Prettier, Vitest
- [ ] Next.js app in `frontend/`; Hono app in `backend/` mounted at `/api/[[...route]]`; `/api/health`
- [ ] `.env.example` check; CI workflow green
> 🎙 *"Read docs 00, 04 and 29. Do Phase 0: set up the npm workspaces monorepo exactly as in 04-system-architecture. Don't touch .claude."*

## Phase 1 · Core graph + canvas (F-03, F-04, F-09)

**Status:** ✅ merged in #3.
- [ ] `simulator/graph`: types (match `specs/graph-schema.json`), catalog, ops, validate, ids, inverse
- [ ] Tests first: atomicity, inverse, every error code; contract test vs specs
- [ ] `database`: repo + schema + share codec; fake-indexeddb tests
- [ ] Frontend: Zustand store, React Flow node cards, ELK worker, pulse, templates, Home recent list
> 🎙 *"Phase 1. Follow docs 07, 08 and 17 exactly. Write the applyBatch tests first."*

## Phase 2 · Fast path + command bar (F-01, F-02)

**Status:** ✅ merged in #4.
- [ ] normalize, grammar, resolve per doc 13; abstain rule
- [ ] Command bar: history, tier/latency badge, hands-free 1.2 s, toasts with Undo
- [ ] `bench:fast`
> 🎙 *"Phase 2, doc 13. The fast path must return null instead of guessing."*

## Phase 3 · Simulator (F-05, F-06)

**Status:** ✅ built on `feat/simulator`.
- [ ] propagate, queueing, failures, montecarlo, explain per docs 09–11
- [ ] Golden tests (`three-tier-50k`, `three-tier-sharded`, `write-queue`, `cache-down`, `primary-failover`, `lb-reroute`) + property tests + `bench:sim`
- [ ] UI: status colours, particle overlay, bottleneck callout, metrics panel, blast-radius diff
> 🎙 *"Phase 3. Implement docs 09, 10 and 11. Golden tests with the numbers from doc 10 first."*

## Phase 4 · AI harness (F-02, F-07, F-08)

**Detailed plan:** [32-phase-4-plan.md](32-phase-4-plan.md) (steps, files, contracts, tests, acceptance criteria).
- [ ] `ai/llm`: client, prompts (12 worked examples), context DSL, schemas, harness, guardrails
- [ ] Backend routes + middleware (requestId, logger, rateLimit, accessCode, errors)
- [ ] Client: `useCommand` (fast path → API → 5 kinds), clarify chips, confirm dialog, answer card, degraded banner
- [ ] `evals/` runner + 30 cases across all categories
> 🎙 *"Phase 4. Build the harness from docs 12 to 15, then the eval runner from doc 22 with thirty cases."*

## Phase 5 · Design pass (doc 06)
- [ ] **design-system-decision** skill → fill the design-system section of doc 06
- [ ] Tokens, light/dark, node cards, panels, mobile bottom sheet, reduced motion, axe pass
- [ ] Mic fallback (FR-062)
> 🎙 *"Phase 5. Use the design-system-decision skill, then frontend-quality, and update doc 06."*

## Phase 6 · Interview, review, SPOF, cost (F-10, F-11, F-15)
- [ ] problems + `sloChecks` (tests), SPOF worker, cost
- [ ] `/api/interview/turn|score`, `/api/review`; interview panel + TTS + scorecard; review findings + apply fix

## Phase 7 · Evals + ship (F-12, F-13, F-14)
- [ ] ≥ 92 cases, dev/test split, run, fix the top failing categories, final test-split run
- [ ] All benches; `results/latest.json` committed; `/evals` page
- [ ] Share links, exports, replay (if not cut)
- [ ] Deploy (doc 25 checklist); README via **readme-maintenance**; CHANGELOG `v1.0.0`

## Phase 8 · Record + submit
- [ ] Follow [99-challenge.md](99-challenge.md): video script + submission checklist

## After the challenge (v1.x / v2)
- Multiplayer boards (Yjs), accounts + cloud sync (supersedes ADR-003/004), regions/zones, hot-key skew, retry storms, `docker-compose` export, cost optimiser.
