# 36 · Phase 8 Plan: Record and Submit

**Goal:** submit Archie once, complete, by **Mon 5 Oct 2026, 21:00 IST** (hard deadline Tue 6 Oct 23:59): a public repo whose README a judge trusts, a 2–4 minute video that shows Wispr Flow building it and the product working, and the form filled. [99](99-challenge.md) wins over anything here.
**Branch:** `fix/*` only, for anything found while rehearsing · **Time box:** Mon 5 Oct, 09:00–21:00 IST · **Specs:** [99](99-challenge.md) (rules, script, checklist), [29](29-roadmap.md), [31](31-project-state.md), [25](25-deployment.md)

> 🎙 Kickoff prompt: *"Do Phase 8 from doc 36. Start with the pre-flight list."*

## What exists already

| Piece | State |
|-------|-------|
| Live app | <https://archie-rb2x.onrender.com>, smoke green, AI answering (deployed eval 6/6, warm P50 2.4 s) |
| Numbers | Held-out test split 91.2% (one false action, published), `/evals`, README Results table, `evals/notes.md` |
| Features to demo | voice commands (fast path + AI), simulator with explanations, failure + blast radius, Inspector, interview + scorecard, review + SPOF, share, export, replay |
| Repo | **private**; history scanned clean (no keys, no `.env`, no `.claude/`) |
| Wispr Flow signup via the referral link | **not confirmed** in any doc (doc 31, Next tasks 1) |

## Hard rules (from doc 99, checked first)

- [ ] **Wispr Flow account created via <https://ref.wisprflow.ai/hhg>.** Any other signup means the submission doesn't count. Screenshot the account page.
- [ ] Every instruction to the agent in the video is **dictated with Wispr Flow**, with its overlay visible.
- [ ] The video shows the **process**, not only the result.
- [ ] Submit **once**, only when final.

## Pre-flight (owner, Mon morning, before 12:30 IST)

1. **Rotate the keys** that were used for the test deploy: create new Gemini and Groq keys, delete the old ones, update Render → Environment (then Manual Deploy) and `.env.local`.
2. GitHub → Settings → Variables → Actions: `ARCHIE_URL = https://archie-rb2x.onrender.com` (turns on keep-warm; not set yet).
3. `scripts/deploy-smoke.sh https://archie-rb2x.onrender.com --ai` → green (1 AI call).
4. Confirm the Wispr Flow referral signup (rule 1) and keep the screenshot outside the repo.

## Optional engineering (12:30–15:00, cut in this order)

From the work log's open list. Each is a `fix/*` branch → PR → merge, and none may start after 15:00.

| # | Item | Cost | Why |
|---|------|------|-----|
| 1 | Ambiguous-reference guard (a generic "the database" matching 2+ components becomes a clarify) + an offline check over all 92 cases + **one** test-split re-run, publishing both runs | 45 min, ~31 calls | Removes the only false action; a vague command in the demo can't silently pick one |
| 2 | Release: CHANGELOG `v1.0.0` + tag, README live link already in | 10 min | Judges see a finished version |
| 3 | Dev split re-run on the final harness | ~52 calls | Replaces the dev run that had 10 free-tier timeouts. **Cut first** if the quota is tight |

## Quota budget (Mon, the new Gemini account, reset 12:30 IST)

| Use | Calls |
|-----|-------|
| Pre-flight smoke | 1 |
| Optional #1 test re-run | ≤ 31 |
| Rehearsal (twice through the AI beats) | ≤ 12 |
| Recording (two takes of the AI beats) | ≤ 12 |
| Spare | ≥ 20 |

Most demo beats run on the **fast path (no quota)**. If Gemini runs out, Groq answers more slowly; the 429 and degraded states are real and look fine on camera.

## Demo script (~3 min, from doc 99, with tested commands)

Record on the live site in a fresh browser profile (light theme, 1440×900, zoom 100%), Wispr Flow overlay visible. ⚡ = fast path, instant and no quota; 🤖 = AI tier.

| Time | Beat | Say (exactly) | Expected on screen |
|------|------|---------------|--------------------|
| 0:00–0:15 | Hook | *"System design is done by talking, so I built a whiteboard that listens, simulates and argues back, entirely by voice with Wispr Flow."* | Home page |
| 0:15–1:15 | Build montage | clips of dictated prompts ("Do Phase 3 from doc 29"), the agent writing code, tests going green; 4–8× speed with 2–3 real-time moments | editor + agent + Wispr overlay |
| 1:15 | Describe | 🤖 *"Users hit two load balancers, thirty API servers, Postgres with two read replicas, and Redis."* | the graph draws itself (eval case create-01, passing) |
| 1:30 | Load | ⚡ *"Send fifty thousand requests a second, ninety percent reads."* | Postgres turns red and the bottleneck note shows the math (ρ above 1) |
| 1:45 | Fix | ⚡ *"Shard Postgres into two."* | Postgres recovers, success rises |
| 1:55 | Break | ⚡ *"Kill Redis."* | success falls, blast radius panel, replicas saturate |
| 2:05 | Ask | 🤖 *"Where's the bottleneck?"* | answer card citing the simulator's numbers, Postgres highlighted |
| 2:15 | Guardrails | 🤖 *"Clear the board."* | confirm dialog: nothing deleted until confirmed (eval destructive-01) |
| 2:25 | Interview | open **Practice an interview** → URL shortener | live SLO checklist, a grounded question |
| 2:40 | Share / Evals | **Share** → open the link; then `/evals` | read-only copy; 91.2% held out, latency percentiles |
| 2:50 | Close | *"Zero lines typed by hand."* + repo link | README |

Before recording, rehearse the 🤖 beats once on the live site: the AI path varies, and a second take is cheaper than an edit. Don't demo "connect the workers to the database" on a board with two databases unless optional #1 has shipped; that is the published false action.

## Submission (19:30–21:00)

Doc 99's checklist, with the commands this repo uses:

- [ ] `main` green in CI; the live URL passes `deploy-smoke.sh --ai`
- [ ] README: live link, numbers table, setup steps, "Built with Wispr Flow" section with the **video link** (added in a `docs/` PR)
- [ ] `git ls-files | grep -c '^.claude/'` → `0`
- [ ] `git log -p --all | grep -cE "AIza[0-9A-Za-z_-]{30,}|gsk_[0-9A-Za-z]{20,}|sk-ant-"` → `0` (scanned clean on 2026-10-04; re-run)
- [ ] The commit email question decided (it becomes public with the repo)
- [ ] **Repo → public**; open the README logged-out: images load, links work
- [ ] Video uploaded (YouTube unlisted or Drive "anyone with the link"), plays logged-out
- [ ] Form <https://forms.gle/Lv9wF8gYVHdEqfJW8>: repo link + video link
- [ ] Screenshot of the confirmation (kept outside the repo)

## Risks

| Risk | Mitigation |
|------|------------|
| Render cold start while a judge opens the link | keep-warm (needs `ARCHIE_URL`); README says the first load can take a minute |
| AI quota or a slow free-tier model during recording | most beats are ⚡; rehearse the 🤖 beats; Groq fallback; keep a good take rather than retrying live |
| The submission doesn't count (referral, voice-only) | pre-flight 4 and the hard-rules list come first |
| A late fix breaks `main` | nothing new after 15:00; every change through a PR with CI |
| Keys exposed again | keys go into Render and `.env.local` only; never into chat |

## After submitting

Delete `.github/workflows/keep-warm.yml` after judging, then the v1.x backlog in doc 29.
