# 31 · Project State

Where the project is **right now**. Update at the end of every phase (and whenever something is blocked). The roadmap is [29](29-roadmap.md).

## Current phase

**Phase 7 in progress** (`chore/evals-deploy`, [35-phase-7-plan.md](35-phase-7-plan.md)). Done: the dataset is at 92 cases (58 dev / 34 test, frozen per line), B0 and benches refreshed, dev-driven fixes (an outage rule in the prompt, a deadline-aware provider chain, two runner fixes), `/evals`, share links with Duplicate, exports (JSON, Mermaid, design doc, SVG, PNG) with Open file, replay, and the deploy code (`render.yaml`, the client-IP header, `deploy-smoke.sh`, keep-warm). **Open:** the final held-out test-split run (Mon 5 Oct after the 12:30 IST quota reset) and the Render service, which needs the owner's account and rotated keys.

**Phase 6 done** (`feat/interview`) ([34-phase-6-plan.md](34-phase-6-plan.md)): SPOF scan, six interview problems with simulator-computed SLO checks and golden-tested reference designs, `/api/interview/turn`, `/api/interview/score` and `/api/review` on a shared structured-output session, interview mode with a live checklist, grounded questions and a scorecard, design review with simulator-proven fixes, the phone ⋯ menu and the `/design` style guide. `zod/mini` on the client closed the bundle gap (318.7 → 260.6 KB). Every acceptance criterion met.

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
- [x] Docker image (ADR-018): standalone build, non-root runtime, health check, CI build + smoke test
- [x] Phase 6: SPOF scan, problem bank + sloChecks, interview turn/score and review endpoints, interview mode + scorecard, review panel + ⋯ menu, `/design`, bundle back under budget
- [x] Phase 5: token audit + contract test, Inspector, bottom sheet + portrait layout, mic fallback, access-code dialog, axe gate + keyboard journey, reduced-motion e2e, `bundle:size` + CI ratchet, visual QA at 360/768/1280/1440 in both themes, README screenshots

## Blocked

_Nothing._ Free quotas are about 20 calls/day per Gemini model (4-model ladder) plus Groq. Eval runs are budgeted accordingly.

## Known bugs

_None open._ Fixed in Phase 5: wide graphs rendered tiny on phones and portrait tablets; on phones the command toast could overlap the panel; canvas nodes had no keyboard focus ring.

## Open items

_None._ (NFR-015 closed in Phase 6: 260.6 KB with `zod/mini` on the client.)

## Open questions

- Custom domain for the demo? (optional)
- License: MIT assumed. Change before the first public push if needed.

## Next tasks

1. Sign up for Wispr Flow via <https://ref.wisprflow.ai/hhg>
2. Test screen recording with the Wispr overlay visible
3. Make the repository public before submitting (it's private, so the repo link and README images won't open for judges)
4. Rotate the Gemini and Groq keys (they were pasted in chat). **Before** the Phase 7 deploy: the live service only gets the new keys
5. Create a Render account (free web service) for the Phase 7 deploy
6. 🎙 Phase 7 from [doc 35](35-phase-7-plan.md): evals to 92 cases, share/export, deploy the Docker image (ADR-018) on Render

## Metrics snapshot

| Metric | Value |
|--------|-------|
| Eval cases | 92 (58 dev, 34 test); last test-split run is still the 12-case one from Phase 4 |
| Task accuracy (dev / test) | dev 58 cases: 82.8% (48/48 answered correct, 10 free-tier timeouts before the fallback fix) · test: 91.7% on the Phase 4 split, final 34-case run pending |
| False-action rate (dev / test) | 0% / 0% |
| Fast-path P50 / P100 | 0.006 ms / 0.138 ms |
| Simulator P95 @ 100 nodes | 2.327 ms |
| Fast path on eval cases (B0) | 8/92 handled, precision 100% |
| AI warm P50 / P95 (test) | 1.8 s / 11.9 s (P95 = a fallback hop on the free tier) |
| Tests | 577 unit/property/contract · 240 e2e (desktop + Pixel 7) |
| Accessibility (axe, WCAG 2.2 A/AA) | 0 serious/critical over 36 audits |
| Board route initial JS (gzip) | 263.8 KB (target < 300) |
| SPOF scan P95 @ 100 nodes | 21.3 ms |
| Interview turn / score / review (live, free tier) | 1.8–2.9 s / 3.6 s / 8.5 s |

## Last updated

2026-10-04
