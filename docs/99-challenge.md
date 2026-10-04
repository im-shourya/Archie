# 99 · Challenge Rules: Wispr Flow Shortlisting

The brief, the hard rules, and a submission checklist. If a rule here conflicts with anything else in `docs/`, **this file wins**. Phase plan: [29-roadmap.md](29-roadmap.md).

## The brief

Build **anything** using Wispr Flow, **entirely with your voice**. Any stack, any complexity. It must work well enough to demo, but it doesn't need to be production-ready.

We're building **Archie**, a voice-first system-design board with a live simulator. See [idea.md](01-idea.md).

## Hard rules (non-negotiable)

- [ ] **Wispr Flow account created via the referral link:** <https://ref.wisprflow.ai/hhg>. Any other signup = submission **not counted**.
- [ ] **Voice-only development.** Every instruction to the coding agent is dictated through Wispr Flow. No hand-typed code.
- [ ] **The video shows the process**, not just the result: Wispr Flow visibly active, me speaking, code being produced.
- [ ] **Working project** that can be demoed end to end.
- [ ] **No resubmissions:** submit once, only when final.

## Deadline

| Milestone | Date |
|-----------|------|
| Task launch | Tue 29 Sep 2026 |
| Today (planning) | Thu 1 Oct 2026 |
| **Internal target: final submit** | **Mon 5 Oct 2026, 9 PM** (buffer day) |
| **Hard deadline** | **Tue 6 Oct 2026, 11:59 PM** |

## Deliverables

1. **GitHub repo link** (public). README with what/why/how-to-run plus a short "Built with Wispr Flow" section.
2. **Demo video** (2–4 min recommended), showing Wispr Flow being used to build it.
3. **Submission form:** <https://forms.gle/Lv9wF8gYVHdEqfJW8>

## Voice-only working rules (for me, while building)

- Dictate every prompt to the coding agent with Wispr Flow. Keep the Wispr Flow indicator **on screen** while recording.
- Refer to docs by voice: *"Read doc 29, do Phase 2."* The docs exist so voice prompts can stay short.
- Fixes are dictated too: *"The cache-aside math is wrong, DB reads should drop by the hit rate."*
- Never type code by hand. Hitting Enter / clicking Approve is fine.
- Record **every session** (raw footage), even if only a few minutes make the final cut.

## Recording setup

- Screen recorder: QuickTime / OBS, 1080p, with **mic audio on** (the voice must be heard).
- Visible on screen: editor + agent panel, Wispr Flow dictation pill/overlay, browser with the app.
- Save raw clips as `rec/YYYY-MM-DD-phase-N.mov` (**outside the repo**, since videos must never be committed).

## Demo video script (target ~3 min)

| Time | Beat |
|------|------|
| 0:00–0:15 | Hook: *"System design is done by talking, so I built a whiteboard that listens, simulates, and argues back. Entirely by voice, with Wispr Flow."* |
| 0:15–1:20 | **Build montage**: dictating prompts phase by phase, agent writing code, tests going green. Speed up 4–8×, but keep 2–3 real-time moments so the voice is clearly heard. |
| 1:20–2:30 | **Product demo, all dictated**: describe a three-tier app → it draws itself → "fifty thousand rps, ninety percent reads" → Postgres goes red with the math → "add a cache" → fixed → "kill redis" → p99 spikes → ambiguous command → clarify chips → "interview me" → one sharp question + SLO checklist. |
| 2:30–2:50 | **Numbers**: `/evals` page with accuracy per category and P50/P70/P95/P100 for the fast path vs the AI path. |
| 2:50–3:00 | Close: repo link, *"zero lines typed by hand."* |

## Submission checklist (do in order, on submit day)

- [ ] Wispr Flow account confirmed as created via `ref.wisprflow.ai/hhg`
- [ ] `main` builds cleanly (`npm run build && npm test`) and the deployed URL works
- [ ] README is complete, with the demo GIF, live link, setup steps and the eval/latency numbers table
- [ ] `evals/results/latest.json` is fresh (re-run `npm run eval` on the final build)
- [ ] `.claude/` **not** in the repo: `git ls-files | grep -c '^.claude/'` → `0`
- [ ] No secrets committed: `.env*` ignored and `git log -p | grep -i "sk-ant"` is empty
- [ ] Anthropic Console spend limit set (the deployed demo is public)
- [ ] Video uploaded (YouTube unlisted / Drive "anyone with link") and plays logged-out
- [ ] Form filled: repo link + video link
- [ ] Screenshot of the form confirmation saved
