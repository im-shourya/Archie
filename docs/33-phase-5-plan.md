# 33 · Phase 5 Plan: Design Pass

**Goal:** the board is fully usable by voice, keyboard, touch and screen reader at every width from 360 px up. Every component can be inspected and edited, nothing depends on Wispr Flow being installed, and the design meets doc 06 with measured accessibility and bundle size.
**Branch:** `feat/design-system` · **Time box:** Sat 3 Oct, 15:00–21:00 (6 h) · **Specs:** [06](06-ui-ux.md), [02](02-requirements.md) (FR-016, FR-062, NFR-012–015), [18](18-authentication.md) (access-code flow), [03](03-product-spec.md)

> 🎙 Kickoff prompt: *"Create branch feat/design-system. Do Phase 5 from doc 33, step by step, committing after each step. Tests first where the doc says so."*

## What exists already (inputs to this phase)

| Piece | Where | State |
|-------|-------|-------|
| Design tokens (light/dark), IBM Plex, Lucide, logo, state-first colour | `frontend/src/app/globals.css`, doc 06 · Design system, ADR-015 | ✅ shipped in #6. This phase audits it; it doesn't redo it |
| Board layout: top bar, canvas, side panel (tabs Metrics · History), command bar | `features/board/BoardScreen.tsx`, `board.module.css` | Desktop ✅; **mobile is a fixed 180 px strip** under the canvas |
| Selected-node details | `features/metrics/MetricsPanel.tsx` ("Selected · …") | Read-only. **No inspector**, no prop editing (FR-016 "In progress") |
| Command bar with AI tier (clarify, confirm, answer, errors, degraded) | `features/commandbar/*` | ✅ Phase 4. The mic icon is **decorative** (no FR-062) |
| Reduced motion | `usePrefersReducedMotion.ts`, CSS media queries | Implemented, **no e2e** (NFR-014) |
| E2E on desktop Chrome + Pixel 7 | `tests/e2e/*`, `playwright.config.ts` | ✅ 53 passing. **No axe**, no keyboard-only test |
| Access code | `backend/src/middleware/accessCode.ts` (401 `ACCESS_CODE_REQUIRED`) | Server ✅. **No client dialog** (deferred from Phase 4) |

Known bugs this phase closes (doc 31): wide graphs render tiny on phones; on phones the command toast can overlap the history panel.

## Prerequisites (before 15:00)

- [x] `npm install -D @axe-core/playwright` (dev only)
- [x] No API key needed: every AI path in e2e is mocked with `page.route`, as in Phase 4. Free quota is untouched.

## Decisions

| Decision | Value | Why |
|----------|-------|-----|
| Inspector edits | Emit ops through the store's `apply(ops, { source: "inspector" })` | One validation path (`applyBatch`); undo and the event log work for free; `inspector` is already an `EventSource` |
| Inspector inputs | Numeric fields bound to the catalog's `allowedProps` per kind; commit on Enter or blur; invalid values show the op engine's error inline | The catalog already says which props a kind accepts (GI-04); no second rulebook |
| Bottom sheet | Own component (pointer events + CSS transforms), 3 snap points: **peek 88 px** (bottleneck line) / half / full, plus a toggle button | No new dependency; keyboard and screen-reader operable via the button; `prefers-reduced-motion` snaps without animation |
| Mic fallback | Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), button shown **only when supported** | FR-062; Wispr Flow stays the primary path; no audio leaves the browser except via the browser's own engine |
| Accessibility gate | axe (WCAG 2.2 A/AA tags): **0 serious/critical** on Home, board, board + AI panels/dialog, mobile | NFR-012 says "axe + manual"; a gate, not a report |
| Bundle budget | Board route initial JS **< 300 KB gzipped**, measured from the build manifest in CI | NFR-015, unmeasured so far |
| Icons, colours, fonts | No new families or colours; reuse tokens | ADR-015 consistency (frontend-quality skill) |

## Steps

Each step is one commit (Conventional Commits, no attribution lines), with the tests listed.

### Step 1 · Design-system audit · 30 min

Use the **design-system-decision** skill on the existing system, not to redesign it. Check doc 06 against the shipped CSS for tokens, type scale, spacing, radii, elevation, focus ring, state colours, and dark-mode parity. Record any drift in doc 06 and fix it in CSS (tokens only, no new colours).

**Output:** doc 06 · Design system is accurate. Any token added or renamed is used everywhere (grep shows no raw hex outside `globals.css`).
**Tests:** a contract test that `frontend/src/**/*.module.css` contains no raw colour literals (hex/rgb/hsl) outside `globals.css`.

### Step 2 · Inspector (FR-016) · 75 min

Files: `features/inspector/Inspector.tsx`, `inspector.module.css`, and a third panel tab in `BoardScreen.tsx` (Metrics · **Inspector** · History). Selecting a node opens the Inspector tab.

- Header: kind icon, editable label, kind, status (up/down) with a Fail/Recover button.
- Props: only the kind's `allowedProps` (replicas, shards, hitRate as %, capacity, latency, failover, role for SQL).
- Live metrics (ρ, rps in/out, p99 contribution) and the simulator's explanation for this node.
- Connections: incoming/outgoing edges with traffic class; Disconnect button per edge.
- Every edit = one op batch → `apply(…, { source: "inspector", utterance: null })`; a validation error appears under the field and nothing changes.

**Tests (first):** e2e: select `api` → set replicas 12 → node shows `×12`, the toast offers Undo, Undo restores `×30`. Replicas 5000 → inline error naming the 1–1000 bound, board unchanged. Cache hit rate 95% → `hit 95%`. Fail → node status down → Recover. Keyboard only: Tab to a node, Enter selects it, the Inspector receives focus.

### Step 3 · Mobile bottom sheet + known bugs · 75 min

Files: `features/board/BottomSheet.tsx`, CSS. Under 768 px the side panel renders inside the sheet.

- Peek (88 px) shows the bottleneck line, or success % when nothing is red. Drag or tap the handle for half/full. Escape or the handle button collapses it.
- The command bar stays pinned above the safe area. Toasts, clarify chips and answer cards stack **above the sheet's top edge** (fixes the overlap bug).
- Wide graphs on phones: fit view with a mobile padding and `minZoom` that keeps labels legible; re-fit on orientation change (fixes the tiny-graph bug).
- Top-bar actions that don't fit move into a ⋯ menu (today that is only the board rename; later phases add Review, Share and Export here).

**Tests (first):** e2e (Pixel 7): the peek shows the bottleneck text; the handle expands to half then full; a fast-path command's toast is fully visible (bounding box above the sheet); the canvas's smallest node label is ≥ 10 px rendered height after fit; landscape re-fit.

### Step 4 · Mic fallback (FR-062) · 45 min

Files: `features/commandbar/useSpeech.ts`, `MicButton.tsx`.

- The button appears only if `window.SpeechRecognition || window.webkitSpeechRecognition` exists; `aria-pressed` reflects listening.
- Interim results stream into the bar (so hands-free settling and the AI tier work unchanged); the final result triggers the same submit path.
- Permission denied or no-speech → a toast that explains it and names Wispr Flow as the main path. Stops on Escape, on submit, and on tab hide.

**Tests (first):** e2e with `page.addInitScript` installing a fake `webkitSpeechRecognition` that emits interim + final results: the button toggles `aria-pressed`, the text appears, "kill redis" applies via the fast path. With no API present, the button is absent. A `not-allowed` error shows the toast.

### Step 5 · Access-code dialog (doc 18) · 30 min

Files: `features/commandbar/AccessCodeDialog.tsx`, `useCommand.ts`.

On a 401 `ACCESS_CODE_REQUIRED`: show a native `<dialog>` ("This demo needs an access code"), store the code in **sessionStorage** (never the URL), and re-send the pending utterance. On a wrong code, the dialog stays with an inline error. A 429 after wrong codes shows the countdown.

**Tests:** e2e: mocked 401 → dialog → enter code → the re-sent request carries `X-Archie-Code` → ops applied. A wrong code keeps the dialog open with an error. The code is not in `location.href`.

### Step 6 · Accessibility gate · 60 min

Files: `tests/e2e/a11y.spec.ts`, fixes wherever axe or the keyboard pass finds issues.

- axe with `wcag2a, wcag2aa, wcag21aa, wcag22aa` on: Home, empty board, three-tier board, the board with clarify chips / answer card / confirm dialog open, the Inspector, mobile with the sheet expanded, dark mode. Fail on any **serious or critical** violation.
- Keyboard-only journey: `/` focuses the bar → command → Tab to the canvas → arrow/Tab between nodes → Enter → Inspector edit → Escape back. The focus ring is always visible.
- Live regions per doc 06: toasts/answers `polite`, errors `assertive`.

**Tests:** the axe spec (8 states × 2 projects) and the keyboard journey spec.

### Step 7 · Motion and bundle budget · 30 min

- e2e with `reducedMotion: "reduce"`: no `<animateMotion>` particles, no pulse animation on change (outline flash only), the shimmer is static (NFR-014).
- `scripts/bundle-size.mjs`: reads the Next build manifest, sums the gzipped initial JS for `/b/[id]`, and fails above 300 KB. Run it in CI after `npm run build`. Record the number in the README (NFR-015).

**Tests:** the reduced-motion e2e and the bundle script (CI step).

### Step 8 · Visual QA + docs · 45 min

- Screenshots (Playwright) at 360, 768, 1280, 1440 in light and dark: Home, the board, the Inspector, the AI panels, the mobile sheet. Do the **frontend-quality** anti-slop review and fix what it finds.
- Refresh the README screenshots in `docs/assets/`.
- Docs: doc 06 (Inspector, sheet, mic, a11y results), doc 02 statuses (FR-016, FR-062, NFR-012–015), doc 31, CHANGELOG.

## Acceptance criteria (Phase 5 is done when)

- [x] Selecting any node opens an Inspector that edits its props via validated ops; bad values show the op engine's error and change nothing; Undo reverts edits (FR-016)
- [x] At 360 px: the canvas fills the screen, the bottom sheet peeks with the bottleneck, toasts never overlap the sheet, and graph labels stay legible after fit (doc 06 · Responsive; both known bugs closed)
- [x] The mic fallback works in browsers with the Web Speech API and is hidden elsewhere (FR-062)
- [x] A 401 shows the access-code dialog, and the code lives only in sessionStorage (doc 18)
- [x] axe: **0 serious/critical** violations across the 8 states, light + dark, desktop + mobile; full keyboard journey passes (NFR-012)
- [ ] Reduced motion verified by e2e (NFR-014) ✅; board route initial JS < 300 KB gzipped, enforced in CI (NFR-015) ⚠️ **measured 318.7 KB**: zod's classic API is ≈ 90 KB of it; CI enforces a 320 KB no-regression ratchet until client validation moves to `zod/mini` (≈ 5 KB)
- [x] No raw colour literals outside `globals.css`; no new icon families or fonts (ADR-015)
- [x] `npm test`, lint, typecheck, build and e2e green; CI green on the PR; nothing in the client bundle that shouldn't be

## Risks

| Risk | Mitigation |
|------|------------|
| A hand-rolled bottom sheet fights React Flow's touch gestures | The sheet captures pointer events only on its handle; the canvas keeps pinch/pan. Fallback: snap buttons only, no drag |
| Web Speech API differs by browser (Chrome/Safari only, Chrome sends audio to Google) | Feature-detect; never shown in Firefox; the button's tooltip says Wispr Flow is the primary path |
| axe flags React Flow internals | Fix our own markup first; scope exclusions to React Flow's attribution and handles only, each with a comment |
| Bundle over 300 KB | ELK is already lazy (worker); lazy-load the Inspector and dialogs; measure before cutting |
| Time | Cut order if late: Step 7's bundle CI step (keep the measurement), then the ⋯ menu in Step 3. **Never cut:** Inspector, mobile sheet, axe gate |

## Out of scope (later phases)

Review / Share / Export top-bar actions and the interview panel (Phase 6), replay, `/evals` page and deployment (Phase 7). No AI changes: the eval numbers from Phase 4 stand.

## Outcome (2026-10-03)

Built on `feat/design-system`, one commit per step. Deviations from the plan:

- **Bundle budget not met** (above). Lazy-loading the Inspector and dialogs was tried first and saved nothing measurable, so it was reverted; the real cost is zod. The measurement and a CI ratchet shipped (cut order: keep the measurement).
- **⋯ menu cut** (cut order). Nothing needs it until Phase 6 adds Review, Share and Export.
- **Found by the tests and QA, and fixed:** canvas nodes had no focus ring; Inspector fields lost focus after a commit; error toasts weren't assertive; 768 px portrait tablets also rendered wide graphs tiny (now laid out top to bottom); the canvas bottleneck callout covered nodes on phones (hidden there; the peek names the bottleneck).
