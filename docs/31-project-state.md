# 31 · Project State

Where the project is **right now**. Update at the end of every phase (and whenever something is blocked). The roadmap is [29](29-roadmap.md).

## Current phase

**Phase 2 · Fast path + command bar**: built on `feat/fastpath` (PR pending). Next: Phase 3 (simulator).

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
- [ ] Phase 3: simulator

## Blocked

_Nothing._

## Known bugs

- Wide graphs render small on phones (fit-to-view). Addressed in the Phase 5 mobile pass.
- On phones the command toast can overlap the history panel. Phase 5 mobile pass.

## Open questions

- Custom domain for the demo? (optional)
- License: MIT assumed. Change before the first public push if needed.

## Next tasks

1. Sign up for Wispr Flow via <https://ref.wisprflow.ai/hhg>
2. Test screen recording with the Wispr overlay visible
3. Merge the Phase 2 PR
4. 🎙 Phase 3 prompt from [29](29-roadmap.md)

## Metrics snapshot

| Metric | Value |
|--------|-------|
| Eval cases | 0 / 92 |
| Task accuracy (test) | — |
| Fast-path P50 / P100 | 0.006 ms / 0.138 ms |
| AI P50 / P95 | — |

## Last updated

2026-10-01
