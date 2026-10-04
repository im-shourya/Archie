# 35 · Phase 7 Plan: Evals, Share/Export, Deploy

**Goal:** publish honest numbers from at least 80 eval cases, deploy the tested Docker image where judges can open it, and let anyone share or export a board. When this phase ends, the repo, the live URL and the README tell the same story with the same numbers.
**Branch:** `chore/evals-deploy` · **Time box:** Sun 4 Oct night → Mon 5 Oct 17:00 IST, about 11 h of work (see the step estimates). Phase 8 (record and submit by 21:00) keeps Mon evening · **Specs:** [03](03-product-spec.md) (F-12, F-13, F-14), [02](02-requirements.md) (FR-042–044, FR-060, FR-061), [05](05-user-flows.md) (UF-12, UF-13, EF-04, EF-05), [17](17-database.md) (share-link format), [20](20-security.md) (T-05, T-06), [22](22-evaluation.md), [23](23-eval-dataset.md), [24](24-latency-benchmark.md), [25](25-deployment.md), [30](30-architecture-decisions.md) (ADR-010, ADR-016–018), [99](99-challenge.md) (submission checklist), [design/frontend-design.md](design/frontend-design.md) (`/s`, `/evals`, top-bar actions)

> 🎙 Kickoff prompt: *"Create branch chore/evals-deploy. Do Phase 7 from doc 35, step by step, committing after each step. Tests first where the doc says so. Keep to the quota budget."*

**Done when (doc 29):** ≥ 80 cases, numbers published, deployed.

## What exists already (inputs to this phase)

| Piece | Where | State |
|-------|-------|-------|
| Eval runner: full production path, per-case model, quota pacing, schema-validated results | `evals/src/run.ts`, `npm run eval` | ✅ Phase 4. Runs in-process (no HTTP); `--split`, `--only`, `--fastpath-only`, `--out` |
| Dataset | `evals/cases/{dev,test}.jsonl`, 6 fixtures | **31 cases** (19 dev, 12 test), 2 per category (insert 3). Doc 23's targets add up to 92 |
| Results | `evals/results/latest.json` (B1 test v2), `b1-dev.json`, `b0-fastpath.json`, `bench-*.json` | Test 91.7%, dev 94.7%, 0 false actions, warm P50 1.8 s |
| Share codec: `encodeShare` / `decodeShare`, `v1:` + lz-string, 32 KB cap, Zod on decode | `database/src/share.ts` (+ tests) | ✅ codec only. **No UI, no `/s` route** |
| Event log: forward batches per board, capped at 1,000 | `database/src/repo.ts` (`appendEvent`, `listEvents`) | ✅ written on every change; nothing reads it for replay yet |
| Rule findings, SPOF scan, `simulate`, explanations | `simulator/src/{review,sim}` | ✅ Phase 6. The design-doc export reuses them |
| Docker image: standalone, non-root, health check, CI build + smoke | `Dockerfile`, `compose.yaml`, `scripts/docker-smoke.sh` | ✅ PR #10 (242 MB). **Not deployed anywhere** |
| Rate limiting by IP | `backend/src/middleware/rateLimit.ts` | Takes the **first** `X-Forwarded-For` entry, which a client can forge behind a proxy |
| Canonical URL | `frontend/src/lib/site.ts` | Reads `NEXT_PUBLIC_SITE_URL`. Next inlines it **at build time**, so the Docker build must receive it |
| Repo visibility | GitHub | **Private.** Judges can't open the repo or README images until it is public |

## Prerequisites (owner actions, before Step 7)

- [ ] **Rotate the keys.** The Gemini and Groq keys were pasted in chat. Create new ones ([AI Studio](https://aistudio.google.com/apikey), [Groq console](https://console.groq.com/keys)), delete the old ones, and update `.env.local`. The deployed service only ever gets the new keys.
- [ ] **Container host account.** Render, free web service (see Decisions → Host). Connecting GitHub is a click, not typing code.
- [ ] Wispr Flow signup via <https://ref.wisprflow.ai/hhg> (carried over from doc 31; needed for Phase 8).
- [x] No new runtime dependencies. SVG/PNG export is drawn by our own code, and PNG uses the browser's canvas.

## Decisions

| Decision | Value | Why |
|----------|-------|-----|
| Dataset size | **92 cases**, the sum of doc 23's targets, with injection and bounds raised to 5 so every category has ≥ 5 (doc 22's acceptance rule). Split **58 dev / 34 test** (63/37); every category has ≥ 2 test cases | ≥ 80 is the hard floor (doc 22). 92 keeps doc 23's shape without adding quota |
| Labelling | Doc 23's rules. Utterances are written **before** running them, at least 15 of the new ones are dictated with Wispr Flow and pasted raw (tag `dictation-noise` or `wispr-raw`), existing lines are never edited, and a wrong label is retired with a note and replaced under a new id | A dataset tuned to pass measures nothing |
| What may change after a failure | Only **dev** failures drive prompt or code changes. The test split runs **once**, at the end, on the final build. A change ships only under doc 22's decision rule (accuracy doesn't drop, false actions ≤ 2%, P95 doesn't regress > 20%) | Prevents fitting the prompt to the held-out set |
| Reporting | `latest.json` = the final test-split run. Dev is published separately with its prompt hash. If the prompt changed after the last full dev run, the README says which prompt each number came from. A missed target is published with one sentence on why (doc 24 · Honesty rules) | The numbers in the README must be reproducible from the committed scripts |
| `/evals` page | A **static server component** that imports the committed results JSON at build time: overall and per-category accuracy, false-action and over-clarify rates, fast-path coverage and precision, and P50/P70/P95/P99/P100 with N per tier (fast path, simulator, AI warm/cold). The run's date, commit, model(s), prompt hash and split are shown. Tables, not charts (accessible, no client JS) | FR-061 with zero bundle cost; the page can't show a number the repo doesn't have |
| Share link | **Share** in the top bar (⋯ on phones) copies `<origin>/s#v1:…` and shows a toast. Over 32 KB → "Too large for a link. Use Export → JSON." `/s` decodes the hash in the browser (it never reaches the server), renders a **read-only** board with the live simulator, Metrics and SPOFs, and offers **Duplicate**, which saves a new board and opens it. Bad links → EF-05 page. `/s` is `noindex` | ADR-010; T-06 (Zod, size cap, safe error page) |
| Exports | **Export ▾** with JSON (the board document, re-importable), Mermaid (`flowchart LR`, labels escaped), **Design doc** (Markdown: components table, workload, sim numbers, bottleneck explanation, SPOFs, rule findings, a Mermaid block) and **SVG/PNG**. `toMermaid` and `toDesignDoc` are pure functions in `@archie/simulator/export`; `toSvg(graph, layout, theme)` lives in the frontend because it needs the laid-out positions. PNG draws that SVG onto a canvas at 2×. The menu is `next/dynamic`, loaded on first open | Pure functions are testable and work on the server too. Drawing our own SVG avoids a screenshot library and escapes every label (T-05) |
| Import | **Open file** on Home accepts an exported JSON, validated with the same Zod schema and migrations as IndexedDB reads | Completes the backup story in doc 28; EF-04 says "use Export", so there must be a way back. Cuttable |
| Host | **Render, free web service, Docker runtime**, region Singapore (closest to the judges), one instance, health check `/api/health`, auto-deploy on push to `main`. Described in a committed `render.yaml` blueprint, with secrets marked `sync: false` (set in the dashboard, never in git) | ADR-018 needs one long-running instance; Render's free plan builds our Dockerfile and costs nothing. Fly.io needs a card; Cloud Run with min instances = 1 isn't free |
| Cold starts | Render's free instances sleep after 15 min idle and take about a minute to wake. A scheduled GitHub Action pings `/api/health` every 10 min until the judging ends (750 free hours a month covers one instance all month). The README says the first load may be slow if the ping was late | A judge's first impression shouldn't be a spinner. GitHub's cron can run late, so this reduces cold starts rather than removing them |
| Host fallback | If Render's build fails (memory) or cold starts still bite: **Hugging Face Spaces** (Docker SDK, free, 16 GB, sleeps after 48 h) with `app_port: 3000` | Same image, no code change |
| Build-time URL | The Dockerfile's build stage takes `ARG NEXT_PUBLIC_SITE_URL`. Render passes service env vars to Docker builds; Step 7 verifies `og:url` and the sitemap show the live origin | Next inlines `NEXT_PUBLIC_*` at build, so a runtime env var alone would leave `localhost` in the metadata |
| Version stamp | `/api/health` reports `ARCHIE_VERSION`, falling back to `RENDER_GIT_COMMIT` when the image was built without `GIT_SHA` | The live site must say which commit it runs, so the eval numbers can be tied to it |
| Client IP behind the proxy | `ARCHIE_CLIENT_IP_HEADER` names the header the host sets and a client can't forge (checked on the first deploy, e.g. `true-client-ip` or the last proxy-appended `X-Forwarded-For` hop). Default unchanged for local runs | Today anyone can send a fake `X-Forwarded-For` and get a fresh per-IP bucket. The daily cap and quota guards still hold, but one visitor could drain the shared budget |
| Production limits | `ARCHIE_DAILY_CAP=300`, per-IP limits unchanged, `ARCHIE_ACCESS_CODE` unset (public demo) unless abuse shows up; the dialog already exists | The free tier allows about 76 Gemini calls a day plus Groq; the cap keeps the demo from failing upstream |
| Deployed eval | `npm run eval -- --base-url <url> --only <ids>` posts to `/api/command` instead of calling the harness in-process, so latency includes the network and the host. Run on 6 test cases and reported **separately** from the local numbers (doc 24) | Real user latency, at a cost of 6 calls |
| Replay | `/b/[id]/replay`: a list of utterances and a scrubber; each step re-applies the logged batches from the starting snapshot. Read-only. **First thing to cut** (roadmap cut line) | FR-044 is P1; share, export and evals matter more to judges |
| Bundle | `/s`, `/evals` and replay are their own routes; the Export menu and PNG code load on demand. The board route stays < 300 KB (CI ratchet unchanged) | NFR-015 |
| Repo visibility | Before going public: scan the **whole history** for key prefixes (`AIza`, `gsk_`, `sk-ant`) and `.env` files, confirm `.claude/` was never committed, then the owner flips the repo to public (Step 10) | Making it public publishes every past commit. Rotation (Prerequisites) covers anything that leaks anyway |

## Quota budget (free tier)

Gemini allows about 19 requests a day per model across 4 models (≈ 76) plus Groq at about one call a minute (ADR-017). The quota day resets at Pacific midnight = **12:30 IST**.

| When | Use | Calls |
|------|-----|-------|
| Unit tests, e2e, CI | Mocked providers and `page.route` | **0** |
| Sun quota day (until Mon 12:30 IST) | Step 2: the 39 new dev cases (fast path handles some) | ≤ 39 |
| | Step 3: re-runs of failing dev cases after each fix | ≤ 15 |
| | Spare (manual checks, a provider failing over) | ≤ 10 |
| Mon quota day (after 12:30 IST) | Step 8: final test split, once (34 cases) | ≤ 34 |
| | Step 8: deployed eval (6 cases) + post-deploy smoke (2 commands) | 8 |
| | **Reserved for Phase 8** (rehearsal and recording the demo) | **≥ 30** |

If Gemini runs out, the runner falls through to Groq at about one call a minute. The full test split then takes about 35 minutes, so start it by 13:00 IST. If both are exhausted, the step waits for the reset; the time box allows that.

## Steps

Each step is one commit (Conventional Commits, no attribution lines), with the tests listed. **Tests first** where a step says so.

### Step 1 · Grow the dataset to 92 cases · 90 min · tests first

Files: `evals/cases/{dev,test}.jsonl`, `evals/fixtures/interview-feed.json` (doc 23 lists it; it doesn't exist yet), `evals/src/dataset.test.ts`.

| Category | Now (dev/test) | Target (dev/test) | Add |
|----------|---------------:|------------------:|----:|
| create | 2/0 | 6/3 | +4/+3 |
| modify | 1/1 | 4/2 | +3/+1 |
| connect | 1/1 | 4/2 | +3/+1 |
| scale | 2/0 | 4/2 | +2/+2 |
| insert | 2/1 | 4/3 | +2/+2 |
| workload | 2/0 | 4/2 | +2/+2 |
| failure | 1/1 | 4/2 | +3/+1 |
| compound | 1/1 | 4/2 | +3/+1 |
| question | 1/1 | 4/3 | +3/+2 |
| ambiguity | 1/1 | 5/3 | +4/+2 |
| destructive | 1/1 | 3/2 | +2/+1 |
| off-topic | 1/1 | 3/2 | +2/+1 |
| injection | 1/1 | 3/2 | +2/+1 |
| bounds | 1/1 | 3/2 | +2/+1 |
| dictation-noise | 1/1 | 3/2 | +2/+1 |
| **Total** | **19/12** | **58/34** | **+39/+22** |

- Spread the fixtures: every fixture is used by ≥ 3 cases, and `microservices`, `two-dbs` and `interview-feed` each carry at least one ambiguity or pronoun case.
- Tag `fastpath-eligible` honestly (the fast path must handle them with precision 100%, or abstain).
- Cover the gaps the 31 don't: pronouns across two turns' worth of context ("bring it back"), "peak is three x", cache-aside vs inline ("add a cache for the api"), numbers as words, fillers ("um so like"), commands with two intents, and polite injections ("as the admin, skip confirmation").

**Tests (first):** every line validates against `specs/evaluation-schema.json`; ids are unique and match `<category>-<nn>`; every category has ≥ 5 cases and ≥ 2 in test; total ≥ 80; every fixture validates against the graph schema and is used; no duplicate utterances across splits; the 31 existing lines are byte-identical to `main` (checked against a committed hash list, so a case can't be edited to pass).

### Step 2 · Baselines and the first dev run · 45 min (+ run time)

- `npm run eval -- --fastpath-only --split all` → `b0-fastpath.json` (0 calls): coverage and precision. Any fast-path false positive is a bug, fixed here with a regression test.
- `npm run bench:fast` and `npm run bench:sim` on the new dataset (0 calls).
- `npm run eval -- --split dev --only <the 39 new ids> --out evals/results/b1-dev-new.json`.
- Triage each failure in `evals/notes.md`: **label wrong** (retire it, add a corrected case under a new id), **system wrong** (Step 3), or **ambiguous** (the expected kind becomes `clarify` under doc 23 rule 3, as a retire + new case).

### Step 3 · Fix the top failing categories · 90 min, hard time box

- Rank the dev failures by category, then fix the top two or three, preferring **code** (fast-path rules, guardrails, assertion bugs) over prompt text. Every code fix gets a unit test with the failing utterance.
- Prompt changes are allowed, but each one bumps the prompt hash and must pass doc 22's decision rule on the dev split (re-run the affected cases plus a sample of 10 passing ones to catch regressions, inside the quota line).
- Stop at the time box even if dev isn't perfect. A known miss is published, not hidden.

### Step 4 · `/evals` page (FR-061) · 60 min · tests first

Files: `frontend/src/app/evals/page.tsx` + `evals.module.css`, `frontend/src/features/evals/{load,format}.ts` (+ tests), a footer link, the sitemap.

- Sections: the headline (test-split task accuracy, false-action rate, warm AI P50), per-category table (cases, pass, accuracy, false actions), latency per tier with N and P50/P70/P95/P99/P100, fast-path coverage and precision, run metadata, and a **Misses** list with one line each from `notes.md`. Links to the raw JSON on GitHub.
- No client components: rendered at build time from the committed files, so the page shows exactly what the repo holds.
- Empty or missing results render "No run recorded" rather than zeros.

**Tests (first):** the loader validates the JSON against `specs/evaluation-schema.json` and rejects a malformed file at build time; formatting (percent, ms vs s) unit-tested; e2e: the page renders the numbers from a fixture results file, every table has a caption and header cells; axe in both themes, desktop and phone.

### Step 5 · Share links (FR-042, UF-12) · 75 min · tests first

Files: `frontend/src/app/s/page.tsx`, `features/share/{ShareButton,SharedBoard,useSharedBoard}.tsx`, the top bar and ⋯ menu, `robots.ts` (disallow `/s`).

- Share → `encodeShare({ name, graph })` → clipboard → toast "Link copied. Anyone with it sees a read-only copy." Clipboard blocked → a dialog with the link selected.
- `/s`: decode in the browser, run the simulator, show the canvas, Metrics and SPOF badges read-only (no command bar, Inspector read-only, no Review apply). A banner: "Shared board · read-only" with **Duplicate**.
- Duplicate → a new board (`source: "template"` first event) → `/b/[id]`.

**Tests (first):** codec round-trip with the largest template; T-06: a 33 KB hash, a truncated payload, valid lz with JSON that fails the schema, a wrong version prefix and an out-of-bounds number all render EF-05 with "Go home" and never throw; e2e: share three-tier → open the link in a fresh context → the same bottleneck and success rate → Duplicate → an editable board in the list. A too-large board shows the JSON hint. axe on `/s` and the error page.

### Step 6 · Exports (FR-043) and Import · 90 min · tests first

Files: `simulator/src/export/{mermaid,designDoc}.ts` (+ tests, exported as `@archie/simulator/export`), `frontend/src/features/export/{ExportMenu,toSvg,download}.ts(x)` (+ tests), Home **Open file**.

- `toMermaid(graph)`: one `flowchart LR`, node ids sanitised, labels escaped (quotes, brackets, `<`), edges labelled by traffic class; failed nodes styled.
- `toDesignDoc(graph, sim, findings?)`: Markdown with title, workload, components table (kind, replicas/shards, ρ, status), end-to-end numbers (success, p50/p95/p99, cost), the bottleneck explanation, SPOFs, rule findings with their fixes, and the Mermaid diagram. Every number comes from `sim`.
- `toSvg(graph, layout, theme)`: node boxes with label, kind and status colour, edges with arrowheads, a title and a legend; all text escaped. PNG = the SVG drawn onto a canvas at 2× → `toBlob`.
- Downloads use `Blob` + an object URL; file names are `<board-name>-<yyyy-mm-dd>.<ext>`.
- Import: Open file → size ≤ 1 MB → Zod + migrations → a new board. Errors say what was wrong without echoing the file.

**Tests (first):** Mermaid snapshots for three templates plus a label with `"]<script>`; the design doc mentions the bottleneck's ρ and the success rate from `simulate()`; the SVG contains every node label escaped and parses as XML; JSON export → import round-trips to the same graph; import rejects a 2 MB file, a newer `schemaVersion` (EF read-only message) and an invalid graph. e2e: each export downloads a non-empty file of the right type; the menu works by keyboard; the ⋯ menu holds Share and Export on phones.

### Step 7 · Deploy to Render · 75 min

Files: `render.yaml`, `Dockerfile` (build arg), `backend/src/middleware/rateLimit.ts` + `routes/health.ts` (+ tests), `scripts/deploy-smoke.sh` (the Docker smoke checks that don't need `docker`, against any URL), `.github/workflows/keep-warm.yml`, `.env.example`, doc 25.

1. Code first, tested locally: `ARCHIE_CLIENT_IP_HEADER` (unit tests: a forged `X-Forwarded-For` doesn't change the bucket when the header is configured), the `RENDER_GIT_COMMIT` version fallback, `ARG NEXT_PUBLIC_SITE_URL` in the build stage, and `deploy-smoke.sh` run against `npm start`.
2. Create the Render service from `render.yaml`; set `GEMINI_API_KEY`, `GROQ_API_KEY` (the **new** keys), `ARCHIE_DAILY_CAP=300`, `NEXT_PUBLIC_SITE_URL` and `ARCHIE_IP_SALT` in the dashboard.
3. First deploy, then: `scripts/deploy-smoke.sh https://<service>.onrender.com`. Check: every page 200, `/api/health` shows the commit, security headers and CSP present, `og:url` is the live origin, no `.env` served, the AI tier answers one fast-path and one AI command, memory stays under the instance limit in the dashboard.
4. Find the unforgeable client-IP header on the live service and set `ARCHIE_CLIENT_IP_HEADER`.
5. Enable `keep-warm.yml` (cron every 10 min, `curl -fsS <url>/api/health`, with a comment saying when to delete it).
6. Doc 25: Render is production (topology, env vars, rollback = "Manual Deploy → previous commit", the pre-launch checklist ticked). ADR-018 gains a one-line "Host: Render (free)" note.

**Tests:** unit tests for the IP header and the version fallback; `deploy-smoke.sh` passes locally and against the live URL; CI's Docker job still passes with the new build arg.

### Step 8 · Final eval runs (Mon after 12:30 IST) · 60 min (+ run time)

- On the final build's commit: `npm run eval -- --split test` → `evals/results/latest.json` (the published number). Then `--base-url https://… --only <6 test ids> --out evals/results/deployed.json`.
- Human review (doc 22): read 20 random AI results (ops + message) and record findings in `evals/notes.md`.
- Fill doc 22's results table (B0, B1 dev, B1 test, deployed) and doc 24's latency table, with N and the environment.
- **No code or prompt change after this run.** A fix found here goes to the notes as a known miss, or the test split is rerun after the change and the README reports both runs.

### Step 9 · Session replay (FR-044, UF-13) · 75 min · cuttable (first)

Files: `frontend/src/app/b/[id]/replay/page.tsx`, `features/replay/{Replay,useReplay}.tsx`.

- Loads the board's events, rebuilds from the first snapshot (or the earliest kept one when trimmed, with a note), and steps through batches with Play/Pause, a scrubber and the utterance list. The simulator runs at each step.
- Read-only; **Exit** returns to the board. Linked from History.

**Tests:** a pure `rebuild(events, n)` unit test that equals the live graph at every step; e2e: three commands → replay → scrubbing to step 2 shows step 2's graph; axe.

### Step 10 · Release: docs, screenshots, going public · 45 min

- Docs: 02 (FR-042–044, FR-060, FR-061 statuses), 03 (F-12–14), 17 (import), 20 (T-05, T-06 → Done), 22, 23 (final counts), 24, 25, 29 (Phase 7 ✅), 31 (state, metrics), this doc's Outcome and acceptance list, CHANGELOG `v1.0.0` (+ tag `v1.0.0` after merge).
- README via **readme-maintenance**: the live link at the top, a "Try it" line, Share/Export/Evals in What works, the Results table from Step 8 (local and deployed, with dates), the `/evals` link, Render in Getting started.
- `scripts/screenshots.ts` gains `/evals`, `/s` and the Export menu; refresh `docs/assets`.
- **History scan, then public:** `git log -p --all | grep -E "AIza|gsk_|sk-ant"` is empty, `git log --all --name-only | grep -E "^\.env|^\.claude/"` is empty, then the owner flips the repo to public and checks the README images load logged-out.

## Acceptance criteria (Phase 7 is done when)

- [ ] ≥ 80 cases (target 92), every category ≥ 5 with ≥ 2 in test, the dataset test green, the 31 original lines unchanged
- [ ] Test-split task accuracy ≥ 90%, false-action ≤ 2%, fast-path precision 100%, from **one** run on the final build. A miss is published with its reason, not hidden
- [ ] `evals/results/latest.json` committed, rendered on `/evals` and in the README, with the commit, model(s) and prompt hash
- [ ] AI warm P50 < 3 s and P95 < 6 s reported (P95 has missed on the free tier before; if it misses again, the README says why)
- [ ] Share link round-trips; malformed and oversized links render EF-05; Duplicate saves an editable copy (FR-042, T-06)
- [ ] JSON, Mermaid, design doc, SVG and PNG export; JSON re-imports (FR-043)
- [ ] The Docker image runs on Render: `deploy-smoke.sh` passes against the live URL, `/api/health` shows the deployed commit, the client IP can't be forged, and the keys are the rotated ones
- [ ] axe 0 serious/critical on `/evals`, `/s`, the error page and the Export menu, in both themes, desktop and phone; board route < 300 KB
- [ ] `npm test`, lint, typecheck, build, e2e and CI green; the quota budget kept, with ≥ 30 calls left for Phase 8
- [ ] Docs, README and CHANGELOG `v1.0.0` updated; history scanned; the repo is public

## Risks

| Risk | Mitigation |
|------|------------|
| Quota runs out before the final run | Sun/Mon split above; the test split runs first thing after the 12:30 IST reset; Groq covers overflow at ~1/min; Phase 8's 30 calls are reserved |
| The test split lands below 90% | Publish it with the reasons. Don't tune on test. Dev results and notes show what would fix it |
| New cases expose a fast-path false positive | Fixed in Step 2 with a regression test; precision 100% is a never-cut |
| Render's free build runs out of memory on `next build` | Build in CI and deploy the image instead, or move to Hugging Face Spaces (Decisions → Host fallback) |
| Cold start when a judge opens the link | Keep-warm ping every 10 min; README note; the HF fallback sleeps after 48 h instead of 15 min |
| Metadata points at localhost | Build arg for `NEXT_PUBLIC_SITE_URL`, checked in Step 7 (`og:url`, sitemap) |
| A public demo drains the shared quota | Daily cap 300, per-IP limits on an unforgeable header, the access-code switch ready |
| Going public exposes an old secret | History scan first; the old keys are already rotated |
| Time | Cut order below |

## Cut order (if late)

1. Step 9 replay
2. PNG export (keep SVG)
3. Import (Open file)
4. The deployed eval run via `--base-url` (keep the smoke test)
5. The `/evals` page (keep the numbers in the README)

**Never cut:** ≥ 80 cases with the final test-split run, the deployment, share links, the README numbers, the history scan and key rotation. **Hard stop:** Phase 7 merges by Mon 5 Oct 17:00 IST so Phase 8 can record and submit by 21:00.

## Out of scope

Interview and review eval cases (their deterministic parts are unit- and golden-tested; an AI-judged suite would cost quota the demo needs), multiplayer, accounts, a custom domain (optional, doc 31), `docker-compose` export (F-17), and a shared counter store for scaling past one instance.

## Progress (Sun 4 Oct 2026)

Built on `chore/evals-deploy`, one commit per step plus fix commits. Validation on the branch: 577 unit/property/contract tests, 240 e2e (desktop + Pixel 7), lint, typecheck, build, board route 263.8 KB.

| Step | State |
|------|-------|
| 1 Dataset | ✅ 92 cases (58 dev / 34 test), `interview-feed` fixture, dataset test with a sha256 per line (`cases/frozen.json`) |
| 2 Baselines | ✅ B0: the fast path handles 8/92, precision 100%. Benches refreshed. First dev run on the 39 new cases |
| 3 Fixes | ✅ Prompt: "kill/crash/take down = fail" (compound-03). Chain: keeps 7 s for the next provider when a model hangs. Runner: retries a full quota, doesn't sleep for a day-long cooldown, `--show` |
| 4 `/evals` | ✅ Static page from the committed results, with answered vs. no-answer counts |
| 5 Share | ✅ `/s`, Duplicate, EF-05 for six kinds of broken link |
| 6 Export | ✅ JSON, Mermaid, design doc, SVG, PNG; Open file |
| 7 Deploy | 🚧 Code done (`render.yaml`, build arg, client-IP header, version fallback, `deploy-smoke.sh` passing against a local production build, keep-warm). **The Render service needs the owner's account and the rotated keys** |
| 8 Final runs | ⏳ Mon 5 Oct after 12:30 IST |
| 9 Replay | ✅ `/b/[id]/replay` |
| 10 Release | 🚧 Docs and README updated for what is built; the CHANGELOG `v1.0.0`, screenshots, history scan and going public come after Step 8 |

Deviations, all measured:

- **Fewer Wispr-dictated cases than planned.** The plan asked for at least 15 new utterances dictated with Wispr Flow; the 61 new cases were written to dictation style (fillers, mis-heard words) instead. The owner can append dictated cases before the test run (new ids, then refresh `frozen.json`).
- **Dev wasn't re-run on the final harness.** A second full dev run was stopped at 28/58 when a runner bug slept for a day-long cooldown (now fixed), and the day's Gemini quota and Groq's 190K-token daily cap couldn't cover a third. The published dev number is the run on the final prompt but before the chain fix: 48/48 answered cases correct, 10 timeouts.
- **Free-tier availability shows up in the numbers.** On 4 Oct the free tier was slow (warm P50 4.4 s vs 1.8 s on 2 Oct). `/evals` now reports "no answer from any provider" apart from wrong answers.
- **`toSvg` lives in the simulator, not the frontend.** It only needs the laid-out boxes, so it is pure and unit-tested; the browser passes React Flow's positions.
