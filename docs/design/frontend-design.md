# Frontend Design

The screen-level design of Archie's frontend: what is on each screen, how it is laid out at each width, every state a component can be in, how it behaves with the keyboard, screen readers and reduced motion, and what words it uses. It covers the screens that exist (Phases 1–5) and specifies the ones Phase 6 adds (interview mode, scorecard, review, SPOF, the ⋯ menu and the `/design` style guide).

**Status:** living document. Phase 6 builds from §5–§8 ([34-phase-6-plan.md](../34-phase-6-plan.md)).

**Sources of truth, in order:**

1. `frontend/src/app/globals.css`: the tokens. This doc never introduces a colour; it maps roles to tokens.
2. [06-ui-ux.md](../06-ui-ux.md): principles, brand, colour roles, type, icons, motion, accessibility baseline, measured results.
3. This doc: screens, layouts, states, interaction and content.

If this doc and the code disagree, the code is right about what *is*, and this doc is right about what *should be*. Fix one of them in the same PR.

---

## 1. Design principles for every screen

The five principles in doc 06 apply. Phase 6 adds three, because it introduces AI judgment next to computed facts:

1. **Computed and judged look different.** Anything the simulator computes (checks, ρ, latency, SPOFs, cost) is shown in **mono tabular numerals** with a plain status icon. Anything the AI judges (questions, rubric scores, AI review findings) carries the **AI marker**: Lucide `Sparkles` at 12 px plus the word "AI" in the label's caption. A user can always tell which numbers can be argued with.
2. **Every judgment cites something on the board.** An AI question, finding or rubric score always shows **node chips** (the components it is about). Hovering or focusing a chip highlights the node (`data-focus` outline, the same as answer cards). A judgment with nothing to cite is labelled ("offline question", "not enough evidence").
3. **The interview never fights the voice flow.** The board stays editable by voice the whole time. The interviewer only speaks when asked, never auto-interrupts, and never reads aloud while the candidate is dictating.

---

## 2. Information architecture

| Route | Screen | Index | Phase |
|-------|--------|-------|-------|
| `/` | Home: hero, how it works, templates, recent boards; **Practice an interview** entry | yes | 1, 6 |
| `/b/new` (`?template=`) | Creates a board, then redirects to `/b/[id]` | no | 1 |
| `/b/[id]` | Board in **design** or **interview** mode | no | 1–6 |
| `/interview` | Problem picker (6 problems) | no | 6 |
| `/design` | Living style guide (tokens + components, both themes) | no | 6 |
| `/s#v1:…` | Read-only shared board (Duplicate) | no | 7 |
| `/evals` | Eval report | yes | 7 |

`robots.ts` disallows `/b/`, `/api/`, `/interview` and `/design`. Board modes are a property of the board document (`mode`), not separate routes: reloading `/b/[id]` restores the mode, the interview transcript and the scorecard.

---

## 3. Layout system

### 3.1 Breakpoints

| Name | Query | Layout |
|------|-------|--------|
| **Phone** | `max-width: 767px` or `max-height: 500px` | Canvas full-bleed; side panel → bottom sheet; top-bar actions → ⋯ menu; graph top → bottom in portrait |
| **Tablet** | 768–1279 px | Canvas + 320 px panel; graph top → bottom in portrait, left → right in landscape |
| **Desktop** | ≥ 1280 px | Canvas + 320 px panel (360 px in interview mode); left → right graph |

The queries live in `useCompactLayout.ts` (JS) and the CSS modules (CSS). Keep the two in sync: the e2e tests at 360, 412 (Pixel 7), 768 and 915 × 412 landscape guard them.

### 3.2 Board frame

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◂ [A] Archie   Board name ✎                  [Review|Finish] [↶] [↷] │ top bar · 48 px
├──────────────────────────────────────────────────┬───────────────────┤
│                                                  │ tabs              │
│                    CANVAS                        │ ───────────────── │ side panel
│        (React Flow · dots · node cards)          │ panel body        │ 320 px design
│                                                  │ (scrolls)         │ 360 px interview
├──────────────────────────────────────────────────┴───────────────────┤
│  toasts · clarify chips · answer card  (stack above the bar/sheet)   │ live region
│ [mic] [ Try: "Kill Redis" …                ] local · 0.7 ms [Hands-free]│ command bar · 64 px
└──────────────────────────────────────────────────────────────────────┘
```

**Side panel tabs by mode:**

| Mode | Tabs (default first) |
|------|----------------------|
| Design | Metrics · Inspector · History |
| Interview | **Interview** · Metrics · Inspector · History |
| Review open (either mode) | The panel body shows the **Review** view with a Close button; the tabs stay visible, and choosing a tab closes Review |

Selecting one node switches to Inspector (Phase 5 behaviour) in both modes. In interview mode, deselecting returns to the tab that was open before the selection.

### 3.3 Spacing, radius, elevation, layers

- Spacing: 4 px base; panel padding 16; gaps between sections 20; inside a group 8–12.
- Radius: `--radius-sm` 4 (inputs, chips' key), `--radius-md` 8 (cards, buttons, toasts), `--radius-lg` 12 (command bar, dialogs, sheet top).
- Elevation: `--shadow-raised` for canvas cards; `--shadow-overlay` for anything floating (toasts, callouts, sheet, menus, dialogs).
- **Z-index scale** (the only allowed values):

| Layer | z-index | Used by |
|-------|---------|---------|
| Canvas content | auto | nodes, edges, labels |
| Canvas chrome | 4 | React Flow controls |
| Bottom sheet | 5 | `BottomSheet` |
| Live region | 10 | toasts, chips, answer card |
| Menus / popovers | 20 | ⋯ menu |
| Dialogs | top layer | native `<dialog>` (confirm, access code, finish) |

---

## 4. Component catalogue: existing (Phases 1–5)

Anatomy and states are specified in doc 06 · Components. Summary for reference when composing new screens:

| Component | Where | States that matter here |
|-----------|-------|-------------------------|
| Node card | `ArchNodeCard.tsx` | healthy · warm · hot · saturated · down · idle; selected; focus ring; pulse/outline on change; `data-focus` highlight; **SPOF badge (new, §5.8)** |
| Traffic edge | `TrafficEdge.tsx` | particles ∝ log rps; error particles; dashed async; dotted replication; static thickness under reduced motion |
| Command bar | `CommandBar.tsx` | idle · dictating · hands-free ring · thinking/still thinking · badge local/AI/not understood · mic listening |
| Toast | in `CommandBar` | message · Undo · Retry + ref id; `status` vs `alert` |
| Clarify chips / Answer card / Confirm dialog / Access-code dialog | `features/commandbar/*` | as in doc 06 |
| Metrics panel | `MetricsPanel.tsx` | workload · results · latency table · blast radius · bottleneck · notes · **SPOFs (new)** |
| Inspector | `Inspector.tsx` | fields with inline errors · Fail/Recover · live · connections · **"If this fails" line (new)** |
| Bottom sheet | `BottomSheet.tsx` | peek · half · full · dragging; peek content depends on mode (§5.2) |

---

## 5. Phase 6 screens and components

### 5.1 Problem picker: `/interview`

**Purpose:** choose a problem in one click and land on a board with the requirements already applied.

```
Desktop (≥ 1280)                                   Phone (360)
┌─────────────────────────────────────────────┐    ┌──────────────────────┐
│ [A] Archie                         GitHub ↗ │    │ [A] Archie           │
│                                             │    │                      │
│ Practice a system-design interview          │    │ Practice a system-   │
│ Design by voice against real requirements.  │    │ design interview     │
│ The simulator checks your SLOs live.        │    │ …                    │
│                                             │    │ ┌──────────────────┐ │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐│    │ │ URL shortener    │ │
│ │ EASY       │ │ EASY       │ │ MEDIUM     ││    │ │ EASY             │ │
│ │ URL        │ │ Rate       │ │ Chat       ││    │ │ 40k rps · 95% rd │ │
│ │ shortener  │ │ limiter    │ │            ││    │ │ p99 100 ms       │ │
│ │ 40k rps    │ │ 200k rps   │ │ 60k rps    ││    │ │ 99.9% · $6k/mo   │ │
│ │ 95% reads  │ │ 50% reads  │ │ 60% reads  ││    │ └──────────────────┘ │
│ │ p99 100 ms │ │ p99 20 ms  │ │ p99 150 ms ││    │ ┌──────────────────┐ │
│ │ 99.9%      │ │ 99.99%     │ │ 99.9%      ││    │ │ Rate limiter …   │ │
│ └────────────┘ └────────────┘ └────────────┘│    │                      │
│  (row 2: news feed · ride dispatch · video) │    │                      │
└─────────────────────────────────────────────┘    └──────────────────────┘
```

- **Grid:** 3 columns ≥ 1024 px, 2 columns 640–1023, 1 column below. Cards are `<a>` elements (whole card clickable, min height 160, ≥ 44 px touch target), with title, a difficulty caption (uppercase 12, tracked, `--color-text-secondary`; **not** colour-coded, since difficulty isn't system state) and four requirement lines in mono.
- **Hover/focus:** border `--color-primary`, focus ring `--color-focus`.
- **Order:** easy → medium → hard, as in the table in doc 34.
- **Entry points:** Home gets a secondary button "Practice an interview" (`GraduationCap` 16) next to the existing actions, and a footer link.
- **Empty/error:** the bank is static, so there is no loading state. If creating the board fails (storage blocked), the memory fallback is used and the board shows the existing "won't save" banner.

### 5.2 Interview mode board

```
Desktop
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◂ [A] Archie   Interview · URL shortener ✎                  [⚑ Finish] [↶][↷]│
├────────────────────────────────────────────────────┬─────────────────────────┤
│                                                    │ Interview Metrics Insp.  │
│                                                    │ ─────────────────────── │
│                                                    │ ▸ Design a URL shortener│  problem card (collapsible)
│                     CANVAS                         │   40k rps · 95% reads …  │
│                                                    │ SLOs  3 of 6 passing     │
│                                                    │ ✓ Success ≥ 99.9%  99.97%│  checklist (computed)
│                                                    │ ✗ Read p99 ≤ 100   612 ms│
│                                                    │ ✓ Write p99 ≤ 250  180 ms│
│                                                    │ ✗ Below ρ 0.9   pg 1.40  │
│                                                    │ ✗ No SPOFs   Redis, LB   │
│                                                    │ ✓ Under $6k   $3,460     │
│                                                    │ ─────────────────────── │
│                                                    │ ✦ AI · Interviewer   🔊 │  interviewer turn
│                                                    │ "Your reads all hit      │
│                                                    │  Postgres. What happens  │
│                                                    │  at 40k rps?"  [pg]      │
│                                                    │ ┌─────────────────────┐ │
│                                                    │ │ Your answer…        │ │  answer box
│                                                    │ └─────────────────────┘ │
│                                                    │ [Send]  [⏭ Next question]│
│                                                    │ Transcript (4)        ▾ │
├────────────────────────────────────────────────────┴─────────────────────────┤
│ [mic] [ Change the board: "add a Redis cache in front of Postgres" ] [Hands-free]│
└──────────────────────────────────────────────────────────────────────────────┘

Phone (peek)                      Phone (half, Interview tab)
┌──────────────────────┐          ┌──────────────────────┐
│ ◂ [A] Interview…  ⋯  │          │ ◂ [A] Interview…  ⋯  │
│                      │          │      CANVAS          │
│       CANVAS         │          ├──────────────────────┤
│   (top → bottom)     │          │        ───           │
│                      │          │ SLOs 3 of 6 · next:  │
├──────────────────────┤          │ Read p99             │
│        ───           │          │ Interview Metrics …  │
│ SLOs 3 of 6 passing  │          │ ✓ Success … ✗ Read … │
│ · next: Read p99     │          │ ✦ "Your reads all…"  │
├──────────────────────┤          │ [Your answer…] [Send]│
│ [mic][ Change …    ] │          │ [mic][ Change …    ] │
└──────────────────────┘          └──────────────────────┘
```

- **Top bar:** the board name is prefixed "Interview · " (not editable as part of the name). **Finish** (`Flag` 16 + label) replaces Review. On phones, Finish lives in the ⋯ menu.
- **Command bar placeholder** in interview mode: `Change the board: "add a Redis cache in front of Postgres"`, so it's clear the bar edits the board and the answer box talks to the interviewer.
- **Sheet peek** in interview mode: `SLOs {n} of {total} passing · next: {first failing label}`, or `All SLOs passing · Finish when ready` when everything passes.

### 5.3 Problem card

- Collapsed by default after the first question (a disclosure `<button aria-expanded>` with `ChevronRight`/`ChevronDown`). Expanded: title (16/600), brief (14, secondary), and a requirements `<dl>` in two columns: Peak · Reads · p99 read · p99 write · Availability · Budget (mono values).
- The workload note under it: "Checks run at the problem's peak (40,000 rps), whatever the board's workload." This prevents "I lowered the workload and it passed".

### 5.4 SLO checklist (computed)

Anatomy per row: status icon · label · actual (right-aligned, mono). Header: `SLOs` (panel-heading style) + `3 of 6 passing` (mono).

| State | Icon (Lucide 16) | Icon colour | Label | Actual |
|-------|------------------|-------------|-------|--------|
| Pass | `CircleCheck` | `--color-state-healthy` | primary text | secondary text |
| Fail | `CircleX` | `--color-state-saturated` | primary text | `--color-state-saturated` text |
| Skipped (e.g. write p99 for read-only) | `CircleMinus` | `--color-text-muted` | muted, with "(not applicable)" | — |
| No clients yet | `CircleX` | saturated | primary | "no clients yet" |

- The status is never conveyed by colour alone: icon shape + the actual value + `aria-label="Read p99 ≤ 100 ms: failing, 612 ms"`.
- **Live update:** recomputed on every change (local, synchronous; the SPOF part arrives from the worker ≤ 1 s later, and its row shows "checking…" in muted text until then). When a row flips, it gets the outline flash (reduced-motion safe; no pulse) and the polite live region says "Read p99 now passing" (or "now failing"). Announcements are throttled to one per 1.5 s, with a summary when several rows change ("3 checks changed: 2 passing, 1 failing").
- Clicking a failing row's actual value with node names (e.g. "Redis, LB") highlights those nodes, like a chip.

### 5.5 Interviewer turn, answer box and transcript

**Interviewer turn (AI judgment):**

- Header: `Sparkles` 12 + "AI · Interviewer" caption, or `BookOpen` 12 + "Interviewer · from the problem" for deterministic hint questions (first question, offline fallback). Right side: the speaker toggle (`Volume2` / `VolumeX`, `aria-pressed`, label "Read questions aloud").
- Body: the question (16, line-height 1.5, max 40 words), then focus chips (node labels).
- States:

| State | What shows |
|-------|-----------|
| First question | the deterministic hint, no network |
| Thinking | the previous question dims to 60%; caption "thinking…" (shimmer; static under reduced motion), then "still thinking…" after 4 s |
| AI question | as above, with the AI marker |
| Fallback (ungrounded AI or degraded) | "Interviewer · from the problem" + caption "offline question" when the AI was unavailable |
| Error (retryable) | inline `role="alert"`: "Couldn't get the next question." + Retry |
| Turn cap reached (8) | Next question disabled; caption "That's all the questions. Finish when you're ready." |
| Done (all checks pass and ≥ 3 answers) | a calm banner above the turn: "All SLOs pass. Finish to get your scorecard." with a Finish button |

**Answer box:**

- A `<textarea>` labelled "Your answer", auto-growing (2 rows min, 8 max), with the placeholder `Answer out loud with Wispr Flow, or type`. **Enter** sends, **Shift+Enter** adds a new line, **Escape** blurs. Send is a primary button and is disabled when the box is empty.
- Focusing the box **cancels any speech** in progress; so do typing and starting the mic.
- After sending, the answer moves into the transcript, the box clears and keeps focus, and the next question is requested (one call).

**Transcript:**

- A disclosure `Transcript ({n})`, collapsed on phones and expanded on desktop. An `<ol>` of turns: "Interviewer" / "You" captions (12, secondary), text 14. Board changes between turns appear as muted single lines ("Board: added Redis cache · sharded Postgres into 2"), built from the event log. They're also sent to the interviewer as context.

**Next question:** a secondary button (`SkipForward` 16) that asks without an answer; it is disabled while thinking and at the cap.

### 5.6 Scorecard

Opened by **Finish** → native confirm dialog ("End the interview?" / "You can keep editing the board afterwards." / [Keep going] [Finish]) → the scorecard replaces the Interview tab body (and opens the sheet to full on phones).

```
┌────────────────────────────────────┐
│ Scorecard · URL shortener          │
│ 3.8 / 5          4 of 6 SLOs passed│  overall (mono 34) + checks summary
│ ────────────────────────────────── │
│ SLO checks (computed)              │
│ ✓ Success ≥ 99.9%         99.97%   │
│ ✗ Read p99 ≤ 100 ms       142 ms   │
│ …                                   │
│ ────────────────────────────────── │
│ ✦ AI · Rubric                       │
│ Scalability      ████░  4           │
│ Read replicas + cache keep ρ < 0.7  │
│ [Redis] [Postgres replica 1]        │
│ Availability     ██░░░  2           │
│ …                                   │
│ Trade-offs       ███░░  3  not enough evidence │
│ ────────────────────────────────── │
│ Summary                             │
│ Solid read path; the write path …   │
│ [Copy as Markdown] [Practice again] │
└────────────────────────────────────┘
```

- **Overall:** mono 34/600 + "/ 5" in secondary. It is computed in code (mean). The caption under it reads "Average of the five rubric scores".
- **Rubric bar:** 5 segments of 12 × 8 px with 2 px gaps. Filled segments use `--color-text-primary` and empty ones `--color-border-default`. **Not** state colours: a rubric score is a judgment, not system health. The score digit sits to the right (mono). `role="meter"`, `aria-valuemin=1`, `aria-valuemax=5`, `aria-valuenow`, `aria-label="Scalability 4 of 5"`.
- **Unsupported item:** the bar is shown at 3 with a dashed outline, plus the caption "not enough evidence" (muted) and no chips.
- **States:** scoring (the checks render at once since they're local; the rubric area shows 5 skeleton rows and "scoring…"); rubric error (the checks are kept + `role="alert"` "Rubric unavailable." + Retry); saved (reopening the board shows the scorecard first, with a "Resume editing" link that returns to the Interview tab).
- **Copy as Markdown:** copies a short report (problem, checks with actuals, rubric with evidence, summary) and shows the toast "Scorecard copied".

### 5.7 Review panel and finding card

Opened by **Review** (`ScanSearch` 16 + label) in design mode.

```
┌────────────────────────────────────┐
│ Review                    [Close ×]│
│ 4 findings · 1 resolved            │
│ ┌────────────────────────────────┐ │
│ │ ⬣ HIGH   Redis is a SPOF        │ │  rule finding (computed)
│ │ If Redis fails, success drops  │ │
│ │ 96.3% → 54.5%.                 │ │
│ │ [Redis]          [🔧 Apply fix] │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ▲ MEDIUM ✦ AI  Writes bypass… │ │  AI finding
│ │ …                              │ │
│ │ [Postgres (primary)]           │ │  no valid fix → no button
│ └────────────────────────────────┘ │
│ AI review unavailable: showing     │  degraded note (when relevant)
│ rule-based findings only.          │
└────────────────────────────────────┘
```

- **Severity** (always label + icon + colour, never colour alone):

| Severity | Icon (Lucide 14) | Token | Label |
|----------|------------------|-------|-------|
| High | `OctagonAlert` | `--color-state-saturated` | HIGH |
| Medium | `TriangleAlert` | `--color-state-hot` | MEDIUM |
| Low | `Info` | `--color-state-warm` | LOW |

  Severity reuses the state ramp on purpose: a finding *is* a statement about system health.
- **Card:** a 1 px border `--color-border-subtle` with a **3 px left border** in the severity token; title 14/600; detail 14 (numbers in mono); chips; actions on the right.
- **Provenance:** rule findings carry no marker (they are computed); AI findings carry `Sparkles` + "AI".
- **Apply fix:** a secondary button (`Wrench` 14) → applies → the Undo toast "Applied: {fix summary}" → the card collapses to one line: `CircleCheck` + "Resolved: {title}" (muted) + "Undo" link. Undo restores the card.
- **States:** rules ready instantly; "AI is reviewing…" row (shimmer) while the call runs; AI findings slide in at the bottom (no motion under reduced motion); empty: "No findings. This design has no SPOFs, no hot components and fits the budget."; error/degraded note as drawn.

### 5.8 SPOF badge, metrics section and Inspector line

- **Badge on the node card:** top-left pill `ShieldAlert` 12 + "SPOF" (11/600, uppercase), text and icon in `--color-state-saturated`, background `--color-surface`, border 1 px in the same token. It never covers the label: it sits in the card's top padding, opposite the ✕ "down" mark. The node `aria-label` gains ", single point of failure".
- **Metrics section** `Single points of failure` (after Bottleneck): one row per SPOF with the label and "success → 54.5% if it fails" (mono), sorted by drop; hint when empty: "None: losing any one component keeps success within 5 points." While scanning: "checking…" (muted), never a spinner.
- **Inspector line** under Live: "If this fails: success 96.3% → 54.5%" (mono, saturated when it's a SPOF, secondary otherwise).

### 5.9 Top bar and ⋯ menu

- **Desktop actions, right to left:** Redo, Undo, then the mode action (Review or Finish). Later phases add Share and Export ▾ to the left of the mode action. Buttons 32 px high; text buttons have icon + label.
- **Phones (< 768 px):** the mode action, Rename and (later) Share/Export move into **⋯** (`Ellipsis` 16, `aria-label="More actions"`, `aria-haspopup="menu"`, `aria-expanded`). The menu follows the WAI-ARIA menu-button pattern: Enter/Space/↓ opens and focuses the first item, ↑/↓ move, Home/End jump, Escape closes and returns focus, Tab closes. Items are 44 px high. The menu has a `--shadow-overlay` surface at z 20 and closes on outside pointerdown.
- **Rename on phones** (from the menu): turns the title into the existing inline input, focused and selected.

---

## 6. Token usage map

No new colour tokens. New roles map onto existing tokens:

| Role | Token |
|------|-------|
| Check pass / fail / n/a | `--color-state-healthy` / `--color-state-saturated` / `--color-text-muted` |
| Finding high / medium / low | `--color-state-saturated` / `--color-state-hot` / `--color-state-warm` |
| SPOF badge | `--color-state-saturated` on `--color-surface` |
| AI marker (Sparkles + "AI") | `--color-primary` icon, `--color-text-secondary` text |
| Rubric bar filled / empty | `--color-text-primary` / `--color-border-default` |
| Problem-card difficulty caption | `--color-text-secondary` (not colour-coded) |
| Interviewer bubble surface | `--color-surface-sunken`, radius md |
| Answer box | the Inspector input style (`--color-background`, `--color-border-default`, focus `--color-focus`) |

The token contract test (`tests/contracts/design-tokens.test.ts`) already fails the build on raw colours in any `*.module.css`.

**Type, used as in doc 06:** 11 (badges) · 12 (captions, requirement labels) · 13 (panel headings, uppercase) · 14 (body, findings, transcript) · 16 (question, card titles) · 34 (scorecard overall, mono).

**New Lucide icons:** `GraduationCap`, `Flag`, `ScanSearch`, `ShieldAlert`, `CircleCheck`, `CircleX`, `CircleMinus`, `Volume2`, `VolumeX`, `SkipForward`, `BookOpen`, `Wrench`, `OctagonAlert`, `TriangleAlert`, `Info`, `Ellipsis`, `ChevronRight`, `ChevronDown`. Stroke 1.75–2.25, sizes 12/14/16 only.

---

## 7. Interaction, accessibility and motion

### 7.1 Keyboard

Existing shortcuts are unchanged (`/` or ⌘K focus the bar, `H` hands-free, `F` fit, ⌘Z/⇧⌘Z, `1`–`4` clarify, Delete removes the selection). Additions, active only when focus isn't in a text field:

| Key | Action | Where |
|-----|--------|-------|
| `A` | Focus the answer box | interview mode |
| `N` | Next question | interview mode, when allowed |
| `R` | Open Review | design mode |
| `Escape` | Close Review / collapse the sheet / leave the answer box | as today |

The shortcuts are listed in the command bar's hidden help text (`#command-help`) and on `/design`.

### 7.2 Focus management

| Moment | Focus goes to |
|--------|---------------|
| Interview board opens | the first question's text (`tabIndex=-1`, programmatic), so a screen reader reads it |
| Answer sent | stays in the answer box |
| New question arrives | stays where it was (announced politely; no focus theft) |
| Finish confirmed | the scorecard heading |
| Review opened | the Review heading; Close returns focus to the Review button |
| Fix applied | the resolved line's Undo link |
| ⋯ menu closed | the ⋯ button |

### 7.3 Live regions

- **Polite:** new interviewer questions ("Interviewer asks: …"), checklist flips (throttled), "Scorecard ready", review findings count ("4 findings, 1 high"), toasts.
- **Assertive (`role="alert"`):** AI errors, the rubric-unavailable state, Apply-fix failures.

### 7.4 Read-aloud (TTS)

`speechSynthesis` in the browser's default voice for the page language, at rate 1.0. Only interviewer questions are read; never findings or the scorecard. Speech is cancelled by: answer-box focus or input, mic start, Next question, leaving the page or the tab being hidden. The toggle is persisted (`interviewVoice`, default on) and hidden where `speechSynthesis` is missing.

### 7.5 Motion

All new motion respects `prefers-reduced-motion` (NFR-014): the checklist uses the outline flash only (no pulse); findings appear without sliding; shimmer captions become static text; sheet snaps are instant. Durations: 150 ms for state changes, 200 ms for the sheet and panels, 250 ms for layout. Ease-out only.

### 7.6 Accessibility gate

`tests/e2e/a11y.spec.ts` gains: the problem picker, the interview panel (with a question), the scorecard, the review panel with findings, and `/design`, in light and dark, desktop and Pixel 7. The target stays **0 serious/critical**. The keyboard journey gains: `A` → answer → Enter → `N` → Finish via Tab → the scorecard heading is focused.

---

## 8. `/design`: living style guide

**Purpose:** one page that renders the real tokens and components, so reviewers, the axe gate and future changes see every state side by side. It is a page, not a Storybook: static data, no store, no network, `noindex`.

**Layout:** a single column (max 1100 px) with a sticky in-page nav on the left at ≥ 1024 px (anchors), and a theme switch top-right (System · Light · Dark, which sets `data-theme` on the page wrapper only).

| Section | Renders | Source |
|---------|---------|--------|
| Brand | logo mark at 20/32/72, wordmark, OG card thumbnail | `LogoMark`, `/opengraph-image` |
| Colour | every `--color-*` token as a swatch: name, the live value (read with `getComputedStyle`), its role, and its **contrast ratio** against background and surface, computed on the page with the WCAG formula (badge ✓ ≥ 4.5, ⚠ 3–4.5) | `globals.css` |
| Type | the scale 11–56 in Plex Sans and Mono, with usage notes | doc 06 |
| Space · radius · elevation | 4 px steps, the three radii, the two shadows | tokens |
| Icons | every `KindIcon` with its kind name, then the UI icon set from §6 | `KindIcon.tsx` |
| Node card | a non-interactive React Flow instance with one card per state: healthy, warm, hot, saturated, down, idle, selected, SPOF, focused | `ArchNodeCard` |
| Controls | buttons (primary, secondary, danger, icon; default, hover sample, disabled, focus sample), inputs (default, error), the hands-free toggle, the mic (idle, listening) | CSS modules |
| Feedback | toasts (status, alert, with Undo, with Retry + ref), clarify chips, answer card, the degraded banner | command-bar components |
| Panels | the Inspector field with an error, an SLO checklist (pass/fail/n/a), a finding card per severity (+ resolved), rubric bars (1–5 + unsupported), the sheet peek line | Phase 5–6 components |
| Keyboard | the full shortcut table | §7.1 |

**Rules:** the page imports the real components, never copies; the sample data lives in `app/design/samples.ts`. A contract test asserts that every `--color-*` token defined in `globals.css` appears on the page, and the axe spec covers it in both themes.

---

## 9. Content guidelines

Plain, specific, sayable. Numbers in the UI match the simulator's formatting helpers (`compact`, `ms`, `percent`, `usd`).

| Situation | Write | Don't write |
|-----------|-------|-------------|
| First question | "Let's start simple: where do reads go when a short link is opened?" | "Hello! I'm your AI interviewer 🤖" |
| Grounded AI question | "Your reads all hit Postgres. What happens at 40k rps?" | "Can you tell me more about scalability?" |
| Offline question | caption "offline question" | "Error: AI failed" |
| Check failing | "Read p99 ≤ 100 ms · 612 ms" | "Latency bad" |
| SPOF hint (empty) | "None: losing any one component keeps success within 5 points." | "No issues found!" |
| Finish confirm | "End the interview? You can keep editing the board afterwards." | "Are you sure?" |
| Rubric unsupported | "not enough evidence" | "N/A" |
| Fix applied | toast "Applied: add a second load balancer" + Undo | "Success!" |
| Review degraded | "AI review unavailable: showing rule-based findings only." | "Something went wrong." |

No emoji in the UI (doc 06). Sentence case everywhere except the uppercase panel headings and severity labels.

---

## 10. QA checklist (per PR touching the frontend)

- [ ] Every new state in §5 rendered at 360, 768, 1280 and 1440 in light and dark (`npx tsx scripts/screenshots.ts`), and reviewed for overlap, clipping and contrast
- [ ] Colour is never the only signal (icon + text + aria-label)
- [ ] Computed vs AI provenance is visible on every number or judgment (§1)
- [ ] Keyboard: every control reachable, the focus ring visible, focus moves as in §7.2
- [ ] Live regions as in §7.3; nothing announces on every keystroke
- [ ] Reduced motion: no pulse, no slide, static shimmer
- [ ] axe gate green; token contract test green; no new fonts, icon families or colours
- [ ] `npm run bundle:size` within the CI budget
