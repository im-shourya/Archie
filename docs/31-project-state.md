# 31 · Project State

Where the project is **right now**. Update at the end of every phase (and whenever something is blocked). The roadmap is [29](29-roadmap.md).

## Current phase

**Phase 5 done** (`feat/design-system`) ([33-phase-5-plan.md](33-phase-5-plan.md)): design-system audit with a token contract test, the Inspector (FR-016), the phone bottom sheet (both known mobile bugs closed), the Web Speech mic fallback (FR-062), the access-code dialog, an axe gate (0 serious/critical across 36 audits) with a keyboard journey, reduced-motion e2e, and a bundle measurement. **One criterion is open:** the board route ships 318.7 KB of gzipped JS against a 300 KB target (see Open items).

**Phase 4 done** (`feat/ai-harness`, merged in #7) ([32-phase-4-plan.md](32-phase-4-plan.md)): schemas + context DSL, system prompt, harness with repair and guardrails, `/api/command` with rate limiting, the AI tier in the command bar, and the eval runner with 31 cases. All of it is tested with a mocked model. Running on free tiers: a Gemini model ladder → Groq fallback with quota guards ([ADR-016/017](30-architecture-decisions.md)). **Phase 4 acceptance criteria all met (2026-10-02):** 29/31 eval cases (93.5%), 0 false actions, warm P50 1.8–1.9 s. Out-of-bounds numbers are now caught in code (G-05). **Merged in #7 (`727deeb`).**

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
- [x] Out-of-bounds numbers → clarify (G-05 in code + prompt); re-run dev 94.7%, test 91.7%, 0 false actions
- [x] Request budget enforced even when an SDK ignores abort (a live case hung for 96 s)
- [x] Merged in #7 (CI green; production build checked with `npm start` + a real `/api/command` call)
- [x] Phase 5: token audit + contract test, Inspector, bottom sheet + portrait layout, mic fallback, access-code dialog, axe gate + keyboard journey, reduced-motion e2e, `bundle:size` + CI ratchet, visual QA at 360/768/1280/1440 in both themes, README screenshots

## Blocked

_Nothing._ Free quotas are about 20 calls/day per Gemini model (4-model ladder) plus Groq. Eval runs are budgeted accordingly.

## Known bugs

_None open._ Fixed in Phase 5: wide graphs rendered tiny on phones and portrait tablets; on phones the command toast could overlap the panel; canvas nodes had no keyboard focus ring.

## Open items

- **NFR-015 bundle budget:** `/b/[id]` is 318.7 KB gzipped (target < 300). zod 4's classic API is ≈ 90 KB of it because the simulator validates ops in the browser; `zod/mini` is ≈ 5 KB for the same schemas (measured with esbuild). The fix moves the shared schemas (simulator, database, AI wire format) to `zod/mini` or validates client-side with a mini copy; it needs the AI eval re-run, so it gets its own PR. CI holds a 320 KB ratchet meanwhile.

## Open questions

- Custom domain for the demo? (optional)
- License: MIT assumed. Change before the first public push if needed.

## Next tasks

1. Sign up for Wispr Flow via <https://ref.wisprflow.ai/hhg>
2. Test screen recording with the Wispr overlay visible
3. Make the repository public before submitting (it's private, so the repo link and README images won't open for judges)
4. Rotate the Gemini and Groq keys (they were pasted in chat)
5. Bundle: move client-side validation to `zod/mini` (NFR-015), then drop the CI ratchet to 300 KB
6. 🎙 Phase 6: interview mode and design review

## Metrics snapshot

| Metric | Value |
|--------|-------|
| Eval cases | 31 / 92 (19 dev, 12 test) |
| Task accuracy (dev / test) | 94.7% / 91.7% (all 31: 93.5%) |
| False-action rate (dev / test) | 0% / 0% |
| Fast-path P50 / P100 | 0.006 ms / 0.138 ms |
| Simulator P95 @ 100 nodes | 2.327 ms |
| Fast path on eval cases (B0) | 2/31 handled, precision 100% |
| AI warm P50 / P95 (test) | 1.8 s / 11.9 s (P95 = a fallback hop on the free tier) |
| Tests | 431 unit/property/contract · 128 e2e (desktop + Pixel 7) |
| Accessibility (axe, WCAG 2.2 A/AA) | 0 serious/critical over 36 audits |
| Board route initial JS (gzip) | 318.7 KB (target < 300) · Home 238.6 KB |

## Last updated

2026-10-03
