# 06 · UI / UX

Screen-level layouts, states and wireframes (including Phase 6 interview, scorecard, review and `/design`) are in [design/frontend-design.md](design/frontend-design.md). This doc stays the source for principles, tokens, type, icons and the accessibility baseline.

## Design principles

1. **The board is the product.** Chrome stays quiet. The canvas and its live state carry the attention.
2. **Every state explains itself.** Colour is never the only signal: a red node always has a number and a sentence.
3. **Voice-first, keyboard-complete.** Anything you can say has a fast-path or a shortcut; nothing requires the mouse.
4. **Show causality.** After a command, highlight exactly what changed, and show how long it took.
5. **Precise, not playful.** An engineering instrument, not a generic AI dashboard (no gradients-for-the-sake-of-it, no sparkle emoji everywhere).

## Design system

Decided on 2026-10-01 with the **design-system-decision** skill. Tokens live in `frontend/src/app/globals.css`; components use semantic names only.

### Why it looks like this

| Question | Answer → decision |
|----------|-------------------|
| Who | Engineers and interview-prep students at a laptop, often screen-recorded → high contrast, legible numbers at 1080p |
| What matters most | The *state* of the system and its numbers → colour is reserved for state; numbers in mono with tabular figures |
| Mood | A precise instrument with Apple's product-page polish → SF Pro, a cool `#f5f5f7` page with white panels and `#1d1d1f` ink, one blue, glass only on floating chrome, scroll-scrubbed motion on the home page (redesign, 2026-10-05) |
| What should be memorable | The graph is the product → the logo is an "A" drawn as a three-node graph; the health ramp is the colour story |

### Brand

- **Mark:** the letter A as a tiny architecture graph: an apex node and two base nodes joined by edges, with the crossbar as a third edge. The apex is the primary colour (the component that's "listening"); the rest is ink. Source: `frontend/src/components/brand/LogoMark.tsx`, `frontend/src/app/icon.svg` (adapts to dark mode), `frontend/public/brand/logo-mark-{light,dark}.svg`.
- **Wordmark:** "Archie" in SF Pro 600 next to the mark.
- **Social card / icons:** `opengraph-image.tsx` (1200×630, a real simulator readout), `apple-icon.tsx` (180×180), `manifest.ts`.

### Colour roles

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--color-background` | `#f5f5f7` | `#000000` | page and canvas (dominant, ~60%) |
| `--color-surface` / `-sunken` | `#ffffff` / `#efeff2` | `#161617` / `#232326` | cards, panels, footer, icon wells |
| `--color-text-primary` / `-secondary` / `-muted` | `#1d1d1f` / `#515154` / `#636366` | `#f5f5f7` / `#a1a1a6` / `#8e8e93` | text hierarchy |
| `--color-border-subtle` / `-default` / `-strong` | `#e5e5ea` / `#d2d2d7` / `#a1a1a6` | `#2a2a2d` / `#38383c` / `#5a5a5f` | structure |
| `--color-primary` (+ subtle, focus) | `#0066cc` | `#2997ff` | blue as text: links, numbers, focus, the mic. **Never** used for state |
| `--color-primary-fill` (+ hover, foreground) | `#0071e3` / `#0062c4` | `#0071e3` / `#0062c4` | solid buttons, white text (≥ 4.7:1) |
| `--color-state-healthy` | `#1e7a58` | `#41c493` | ρ < 0.7 |
| `--color-state-warm` | `#925b00` | `#e5ac3e` | 0.7 ≤ ρ < 0.9 |
| `--color-state-hot` | `#ab4716` | `#f28a4e` | 0.9 ≤ ρ < 1 |
| `--color-state-saturated` | `#c0283a` | `#ff707b` | ρ ≥ 1, failing traffic |
| `--color-state-down` | `#636366` | `#8e8e93` | failed component |

**Materials.** `--glass-fill` (nav) and `--glass-fill-strong` (menus, toasts) are translucent fills used with `--glass-blur` (`saturate(180%) blur(20px)`) and `--shadow-glass` (a specular top edge and a hairline rim). They fall back to the opaque surface without `backdrop-filter` or with `prefers-reduced-transparency`. Glass is only for chrome that floats over content.

Every text-bearing role (including all state colours, which colour ρ values and "fail" labels) is **≥ 4.5:1** on background, surface and sunken in both themes (computed with the WCAG formula; lowest is light `healthy` on sunken, above 4.5:1). Warm and hot were darkened slightly in the redesign to clear the light sunken and accent-subtle surfaces. State is never shown by colour alone: each node also has a text status (`ρ 1.40`, `down`, `idle`), a utilization bar and an aria-label.

### Typography

- **SF Pro** for UI and **SF Mono** for numbers, ids and latency, from the system stack (`-apple-system`, `ui-monospace`): Apple's licence doesn't allow serving SF Pro as a web font, so Apple devices render it natively and download nothing. Elsewhere the stack falls back to **Inter** and **Geist Mono** (SIL OFL 1.1, self-hosted by `next/font`, not preloaded). Body text is tracked −0.011em; display sizes −0.03 to −0.045em, following SF Pro Display. The OG image still renders in Plex.
- Scale in use: 11 (node load) · 12 (captions) · 13 (panel headings: sentence case, semibold, primary ink; no forced uppercase) · 14 (body small) · 16 (body, inputs) · 17–19 (lede, `clamp`) · 32–56 (section titles, `clamp`) · 44–80 (display, `clamp`).
- Tabular numerals for every metric.

### Icons

- **Phosphor** (regular; bold for 12 px badges), from `@phosphor-icons/react/dist/ssr` so server and client components share one set. Sizes 12 (inline badge) · 14 · 16 (buttons) · 18 (node kinds, mic). The AI badge is `Cloud` (where the command ran), paired with `Lightning` for local; no sparkles.
- One icon per component kind (`frontend/src/components/icons/KindIcon.tsx`): client `Users`, CDN `Globe`, LB `ArrowsSplit`, gateway `Door`, service `HardDrives`, worker `Gear`, cache `Memory`, SQL `Database`, NoSQL `Stack`, queue `Queue`, object storage `Archive`, search `MagnifyingGlass`, external `Plug`.
- No emoji anywhere in the UI. Decorative icons are `aria-hidden`; icon-only buttons have `aria-label`.

### Shape and spacing

4 px spacing base · radius `--radius-sm` 8 / `--radius-md` 10 (inputs, menus) / `--radius-button` 12 (buttons, as on apple.com) / `--radius-lg` 18 (panels) · elevation `--shadow-raised` (cards) and `--shadow-overlay` (toasts, callouts) · touch targets ≥ 44 px on Home actions.

### Audit (2026-10-03, Phase 5)

Checked the shipped CSS against this section. Drift found and fixed:

| Drift | Fix |
|-------|-----|
| Node cards and the bottleneck callout used raw `rgb()` shadows that ignored dark mode | Now `--shadow-raised` / `--shadow-overlay` |
| Focus rings mixed `--color-primary` and `--color-focus` (same value today, but two names for one role) | Every focus ring uses `--color-focus` |
| This doc said the change pulse is 600 ms and the focus token is `--accent` | Corrected to the shipped 900 ms and `--color-focus` |

Guarded by `tests/contracts/design-tokens.test.ts`: no raw colour literals in any `*.module.css`, and every `var(--color-*)` a module uses is defined in `globals.css`. The only hex values outside `globals.css` are in places CSS variables can't reach (`icon.svg`, `opengraph-image.tsx`, `site.ts` for the manifest), and they copy the token values.

## Layout

```
┌───────────────────────────────────────────────────────────────┐
│ ◂ Archie   Board name ✎          [Review] [Share] [Export ▾]  │  top bar 48px
├──────────────────────────────────────────────┬────────────────┤
│                                              │ Metrics        │  side panel 320px
│              CANVAS                          │ ─────────────  │  (tabs: Metrics ·
│                                              │ Inspector /    │   Inspector · Log ·
│                                              │ Interviewer    │   Interview)
├──────────────────────────────────────────────┴────────────────┤
│ [mic] [ Describe or change your system…  ]  local · 4 ms  [Hands-free] │  command bar 64px
└───────────────────────────────────────────────────────────────┘
```

**Mobile (< 768 px, or a landscape phone under 500 px tall):** canvas full screen, side panel becomes a draggable bottom sheet (peek shows the bottleneck), command bar pinned above the safe area. The bottleneck callout on the canvas is hidden there (the peek names it). **Portrait screens under 1280 px** lay the graph out top to bottom, and phone fit keeps zoom ≥ 0.5 so a node label renders ≥ 10 px.

## Components

| Component | States / notes |
|-----------|----------------|
| **Node card** | icon · label · `×N` badge · ρ bar · status colour · ✕ when down · pulse (900 ms) when changed · selected ring |
| **Traffic edge** | particle density ∝ log(rps); error particles in `--state-saturated`; dashed for `async`; dotted for `replication` |
| **Command bar** | idle · dictating (text changing) · hands-free countdown ring · thinking (shimmer) · result badge |
| **Clarify chips** | appear above the command bar; number keys `1`–`4` select |
| **Confirm dialog** | names the count of affected nodes; destructive button on the right |
| **Bottleneck callout** | anchored above the node (React Flow `NodeToolbar`), shows the full explanation with the formula; click-through so it never blocks the canvas; × hides it |
| **Metrics panel** | workload, success %, throughput, cost, p50/p95/p99 (read/write), blast radius while something is down, bottleneck, notes |
| **Inspector** (FR-016) | opens when one node is selected. Header: kind icon, label, up/down, Fail/Recover. Fields: only the kind's catalog `allowedProps` (hit rate as %); commit on Enter or blur, Escape reverts; bounds come from the op schema, and a rejected edit shows the op engine's message plus the allowed range under the field. Live ρ / in / out / mean and the explanation. Connections with traffic class and Disconnect. Every edit is one op batch (`source: "inspector"`) with the usual Undo toast |
| **Bottom sheet** (phones) | peek 88 px (bottleneck line, or success % when nothing is hot) · half · full. The handle is a button (tap cycles, Escape collapses) and is draggable; only the handle takes pointer events. Selecting a node opens it on the Inspector. Publishes `--sheet-height` so toasts stack above it |
| **Mic button** (FR-062) | shown only where the Web Speech API exists; `aria-pressed`; interim text streams into the bar, the final result submits; stops on Escape, Enter, submit or tab hide; errors name Wispr Flow as the main path |
| **Access-code dialog** | native `<dialog>` on 401 `ACCESS_CODE_REQUIRED`; code kept in sessionStorage only after it works; wrong code → inline error; 429 → countdown |
| **Answer card** | slides above the command bar; node chips highlight on hover |
| **Toast** | message + optional `Undo` (10 s) |
| **Interview panel** | problem card · SLO checklist (computed, live) · interviewer question with provenance (AI / from the problem / offline) and node chips · read-aloud toggle · answer box · Next question · transcript. Spec: [design §5.2–5.5](design/frontend-design.md) |
| **Scorecard** | overall (mean, computed in code) · computed checks · rubric meters with evidence (unsupported → "not enough evidence") · summary · Copy as Markdown. Spec: [design §5.6](design/frontend-design.md) |
| **Review panel** | rule findings at once, AI findings when available (marked) · severity label + icon + left border · Apply fix (validated, undoable, "review fix") → Resolved + Undo. Spec: [design §5.7](design/frontend-design.md) |
| **SPOF badge** | top-left pill "SPOF" in the saturated token, never over the label; aria-label "single point of failure" |

## Motion

- Layout transitions 250 ms ease-out; node enter scale 0.96 → 1.
- Particles run at most 60 per edge, paused when the tab is hidden.
- `prefers-reduced-motion`: no particles (static thickness ∝ rps instead), no pulse (outline flash only), instant layout (NFR-014).
- **Home page (scroll-scrubbed, `features/home/Motion.tsx`).** The scroll position is the timeline: each animated element gets a `--p` from 0 to 1 and CSS maps it to transforms and colours, so stopping the scroll freezes the animation. The board tilts up from the page and flattens as it scrolls (pinned on ≥ 768 px), the three spoken commands light up word by word (muted → ink, so every frame keeps AA contrast; screen readers get the sentence once), and sections fade, lift and un-blur once on entry. The hero title rises with a short blur-in on load. No scroll-jacking: native scrolling, one passive listener per element batched into `requestAnimationFrame`, only while near the viewport. No pre-rendered frame sequence: the product is a live app, so the real screenshot is transformed instead. Without scripting or with reduced motion everything renders in its final state.

## Empty, loading and error states

| Where | Empty | Loading | Error |
|-------|-------|---------|-------|
| Board | hint + 3 example sentences | shimmer ghost on canvas during AI | toast + keep board |
| Metrics | "Set a workload: *send 10k rps*" | — | warnings list |
| Home recent | "No boards yet. Start with a template." | skeleton rows | IndexedDB banner |
| Evals | "No results yet. Run `npm run eval`." | — | — |

## Voice UX specifics

- Never steal focus from the command bar after a command, so the next dictation lands in the right place.
- Echo the interpreted command in the toast ("Scaled api to 5 replicas"), so the user can catch mis-hearings.
- Hands-free never auto-submits text shorter than 2 words.
- Clarify options are short and sayable ("orders" not "orders-db-primary-1").

## Accessibility

- All actions reachable by keyboard; visible focus rings (`--color-focus`, 2 px solid, 2 px offset).
- Canvas nodes are focusable (`Tab` cycles, `Enter` selects) with a visible ring (React Flow's own CSS removes it; `globals.css` restores it). A keyboard selection moves focus to the Inspector heading; `Escape` returns it to the node. A mouse selection doesn't steal focus.
- `aria-live="polite"` on toasts, answers and the bottleneck callout; errors (AI failures, mic errors, field errors) are `role="alert"`.
- Status conveyed by text + icon + colour. Contrast AA everywhere (NFR-012).
- Labels on every input; the mic button has an `aria-pressed` state.
- **Measured (2026-10-03):** axe (WCAG 2.2 A/AA) reports 0 serious or critical violations across Home, the empty board, the three-tier board, the Inspector, clarify chips, the answer card, and the confirm and access-code dialogs, in light and dark, on desktop and Pixel 7 (`tests/e2e/a11y.spec.ts`).

## Responsive behaviour

| Width | Behaviour |
|-------|-----------|
| ≥ 1280 | panel open by default |
| 768–1279 | panel collapsible (default open) |
| < 768 | bottom sheet; replay controls simplified. The ⋯ menu for top-bar actions arrives with those actions (Phase 6); today the bar only holds rename, undo and redo, which fit at 360 px |
