# 06 · UI / UX

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
| Mood | A precise instrument, like a drafting table → warm paper neutrals, graphite ink, restrained radii, no gradients or glow |
| What should be memorable | The graph is the product → the logo is an "A" drawn as a three-node graph; the health ramp is the colour story |

### Brand

- **Mark:** the letter A as a tiny architecture graph: an apex node and two base nodes joined by edges, with the crossbar as a third edge. The apex is the primary colour (the component that's "listening"); the rest is ink. Source: `frontend/src/components/brand/LogoMark.tsx`, `frontend/src/app/icon.svg` (adapts to dark mode), `frontend/public/brand/logo-mark-{light,dark}.svg`.
- **Wordmark:** "Archie" in Plex Sans 600 next to the mark.
- **Social card / icons:** `opengraph-image.tsx` (1200×630, a real simulator readout), `apple-icon.tsx` (180×180), `manifest.ts`.

### Colour roles

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--color-background` | `#f6f5f1` | `#111317` | page and canvas (dominant, ~60%) |
| `--color-surface` / `-sunken` | `#ffffff` / `#eeece6` | `#181b20` / `#21252b` | cards, panels, icon wells |
| `--color-text-primary` / `-secondary` / `-muted` | `#16181d` / `#525866` / `#686e7b` | `#ecedef` / `#aab0ba` / `#8c929d` | text hierarchy |
| `--color-border-subtle` / `-default` / `-strong` | `#e2e0d8` / `#cfccc2` / `#9c9890` | `#2a2f36` / `#3a4049` / `#5a606b` | structure |
| `--color-primary` (+ hover, foreground, subtle) | `#2a44c8` | `#93a5ff` | actions, focus, the mic. **Never** used for state |
| `--color-state-healthy` | `#1e7a58` | `#41c493` | ρ < 0.7 |
| `--color-state-warm` | `#9a6200` | `#e5ac3e` | 0.7 ≤ ρ < 0.9 |
| `--color-state-hot` | `#b8501a` | `#f28a4e` | 0.9 ≤ ρ < 1 |
| `--color-state-saturated` | `#c0283a` | `#ff707b` | ρ ≥ 1, failing traffic |
| `--color-state-down` | `#646a77` | `#8c929d` | failed component |

Every text-bearing role (including all state colours, which colour ρ values and "fail" labels) is **≥ 4.5:1** on both background and surface in both themes (computed with the WCAG formula; lowest is light `hot` on the page background at 4.58:1). State is never shown by colour alone: each node also has a text status (`ρ 1.40`, `down`, `idle`), a utilization bar and an aria-label.

### Typography

- **IBM Plex Sans** (400/500/600) for UI and **IBM Plex Mono** (400/500/600) for numbers, ids, utterances and latency. One engineering superfamily: technical without being a monospace UI. Loaded with `next/font` (self-hosted, no layout shift); SIL OFL 1.1.
- Scale in use: 11 (node load) · 12 (labels, captions) · 13 (panel headings, uppercase, tracked) · 14 (body small) · 16 (body, inputs) · 17–19 (lede, `clamp`) · 34–56 (display, `clamp`).
- Tabular numerals for every metric.

### Icons

- **Lucide**, stroke 1.75–2.25, sizes 12 (inline badge) · 14 · 16 (buttons) · 18 (node kinds, mic).
- One icon per component kind (`frontend/src/components/icons/KindIcon.tsx`): client `Users`, CDN `Globe`, LB `Split`, gateway `Router`, service `Server`, worker `Cog`, cache `MemoryStick`, SQL `Database`, NoSQL `Boxes`, queue `ListOrdered`, object storage `Archive`, search `Search`, external `Plug`.
- No emoji anywhere in the UI. Decorative icons are `aria-hidden`; icon-only buttons have `aria-label`.

### Shape and spacing

4 px spacing base · radius `--radius-sm` 4 / `--radius-md` 8 / `--radius-lg` 12 · elevation `--shadow-raised` (cards) and `--shadow-overlay` (toasts, callouts) · touch targets ≥ 44 px on Home actions.

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

**Mobile (< 768 px):** canvas full screen, side panel becomes a draggable bottom sheet (peek shows the bottleneck), command bar pinned above the safe area.

## Components

| Component | States / notes |
|-----------|----------------|
| **Node card** | icon · label · `×N` badge · ρ bar · status colour · ✕ when down · pulse (600 ms) when changed · selected ring |
| **Traffic edge** | particle density ∝ log(rps); error particles in `--state-saturated`; dashed for `async`; dotted for `replication` |
| **Command bar** | idle · dictating (text changing) · hands-free countdown ring · thinking (shimmer) · result badge |
| **Clarify chips** | appear above the command bar; number keys `1`–`4` select |
| **Confirm dialog** | names the count of affected nodes; destructive button on the right |
| **Bottleneck callout** | anchored above the node (React Flow `NodeToolbar`), shows the full explanation with the formula; click-through so it never blocks the canvas; × hides it |
| **Metrics panel** | workload, success %, throughput, cost, p50/p95/p99 (read/write), blast radius while something is down, bottleneck, the selected component's explanation, notes |
| **Answer card** | slides above the command bar; node chips highlight on hover |
| **Toast** | message + optional `Undo` (10 s) |
| **Interview panel** | problem card · SLO checklist (live) · question bubble + 🔊 · answer transcript · Finish |
| **Scorecard** | checks table with actuals · rubric bars · summary |

## Motion

- Layout transitions 250 ms ease-out; node enter scale 0.96 → 1.
- Particles run at most 60 per edge, paused when the tab is hidden.
- `prefers-reduced-motion`: no particles (static thickness ∝ rps instead), no pulse (outline flash only), instant layout (NFR-014).

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

- All actions reachable by keyboard; visible focus rings (`--accent`, 2 px).
- Canvas nodes are focusable (`Tab` cycles, `Enter` selects); the inspector mirrors the selection for screen readers.
- `aria-live="polite"` on toasts, answers and the bottleneck callout; `assertive` only for errors.
- Status conveyed by text + icon + colour. Contrast AA everywhere (NFR-012).
- Labels on every input; the mic button has an `aria-pressed` state.

## Responsive behaviour

| Width | Behaviour |
|-------|-----------|
| ≥ 1280 | panel open by default |
| 768–1279 | panel collapsible (default open) |
| < 768 | bottom sheet; top-bar actions move into a ⋯ menu; replay controls simplified |
