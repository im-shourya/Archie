# 31 · Project State

Where the project is **right now**. Update at the end of every phase (and whenever something is blocked). The roadmap is [29](29-roadmap.md).

## Current phase

**Phase 0 · Setup**: scaffold built on `chore/scaffold` (PR pending). Next: Phase 1.

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
- [ ] Phase 1: core graph + canvas

## Blocked

_Nothing._

## Known bugs

_None yet._

## Open questions

- Custom domain for the demo? (optional)
- License: MIT assumed. Change before the first public push if needed.

## Next tasks

1. Sign up for Wispr Flow via <https://ref.wisprflow.ai/hhg>
2. Test screen recording with the Wispr overlay visible
3. Merge the Phase 0 PR
4. 🎙 Phase 1 prompt from [29](29-roadmap.md)

## Metrics snapshot

| Metric | Value |
|--------|-------|
| Eval cases | 0 / 92 |
| Task accuracy (test) | — |
| Fast-path P50 | — |
| AI P50 / P95 | — |

## Last updated

2026-10-01
