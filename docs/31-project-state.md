# 31 · Project State

Where the project is **right now**. Update at the end of every phase (and whenever something is blocked). The roadmap is [29](29-roadmap.md).

## Current phase

**Phase 4 built** on `feat/ai-harness` ([32-phase-4-plan.md](32-phase-4-plan.md)): schemas + context DSL, system prompt, harness with repair and guardrails, `/api/command` with rate limiting, the AI tier in the command bar, and the eval runner with 31 cases. All of it is tested with a mocked model. Running on free tiers: a Gemini model ladder → Groq fallback with quota guards ([ADR-016/017](30-architecture-decisions.md)). **Real-model B1 (2026-10-02):** dev 84.2%, test 83.3% task accuracy, warm P50 1.9–2.7 s, but a **25% false-action rate on test (1 of 4: an out-of-bounds number was applied)**. Out-of-bounds handling is the next fix.

## Completed

- [x] Idea chosen: Archie (replaced the Mnemo idea as too basic for HH Goa)
- [x] Documentation set `docs/00–31` + `99-challenge.md`
- [x] Machine-readable contracts in `specs/`
- [x] Root files: README, LICENSE, SECURITY, CONTRIBUTING, CHANGELOG, `.env.example`
- [x] `.github/` CI workflow, issue + PR templates
- [x] Local skills moved to `.claude/skills/` (gitignored + pre-commit/pre-push hooks)

## In progress

- [ ] Wispr Flow signup via the referral link
- [x] Phase 0 scaffold: workspaces, Next.js + Hono `/api`, health, lint, typecheck, Vitest, Playwright
- [x] Phase 1: graph model, op engine (10 ops, 11 error codes), templates, contract tests vs `specs/`, IndexedDB repository + share codec, board store with snapshot undo, React Flow canvas with ELK worker layout, Home + `/b/new` + `/b/[id]`
- [x] Phase 2: fast path (numbers, normalization, reference resolution, 19 rules, abstains when unsure), command bar with latency badge, hands-free mode, history, toast with Undo, `bench:fast`
- [x] Phase 3: simulation engine (propagation, cache-aside, SQL clusters + failover, queues, exact success, seeded Monte Carlo, explanations), golden + property + contract tests, `bench:sim`, board UI (status, ρ bars, animated traffic, bottleneck callout, metrics panel, blast radius)
- [x] Brand and design system (logo, tokens, Plex, Lucide, light/dark), SEO (metadata, OG image, manifest, robots, sitemap, JSON-LD), README rewrite, docs audit (statuses, stale undo/emoji references)
- [x] Phase 4 code: harness, `/api/command`, command bar AI tier, eval runner + 31 cases (mocked-model tests)
- [x] Phase 4 real-model checks: schema accepted live, B1 dev + test run
- [ ] Out-of-bounds numbers → clarify (bounds 0/2; test false action); then re-run dev, then test

## Blocked

_Nothing._ Free quotas are about 20 calls/day per Gemini model (4-model ladder) plus Groq. Eval runs are budgeted accordingly.

## Known bugs

- Wide graphs render small on phones (fit-to-view). Addressed in the Phase 5 mobile pass.
- On phones the command toast can overlap the history panel. Phase 5 mobile pass.

## Open questions

- Custom domain for the demo? (optional)
- License: MIT assumed. Change before the first public push if needed.

## Next tasks

1. Sign up for Wispr Flow via <https://ref.wisprflow.ai/hhg>
2. Test screen recording with the Wispr overlay visible
3. Make the repository public before submitting (it's private, so the repo link and README images won't open for judges)
4. Fix out-of-bounds → clarify (prompt rule + maybe a code check), re-run dev then test, and keep false actions ≤ 2%
5. Rotate the Gemini and Groq keys (they were pasted in chat)
6. 🎙 Phase 5 per [29-roadmap.md](29-roadmap.md)

## Metrics snapshot

| Metric | Value |
|--------|-------|
| Eval cases | 31 / 92 (19 dev, 12 test) |
| Task accuracy (dev / test) | 84.2% / 83.3% |
| False-action rate (dev / test) | 0% / 25% (1 of 4) |
| Fast-path P50 / P100 | 0.006 ms / 0.138 ms |
| Simulator P95 @ 100 nodes | 2.327 ms |
| Fast path on eval cases (B0) | 2/31 handled, precision 100% |
| AI warm P50 / P95 (test) | 2.7 s / 3.65 s (free-tier Gemini) |

## Last updated

2026-10-02
