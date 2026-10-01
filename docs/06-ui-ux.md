# 06 · UI / UX

## Design principles

1. **The board is the product.** Chrome stays quiet. The canvas and its live state carry the attention.
2. **Every state explains itself.** Colour is never the only signal: a red node always has a number and a sentence.
3. **Voice-first, keyboard-complete.** Anything you can say has a fast-path or a shortcut; nothing requires the mouse.
4. **Show causality.** After a command, highlight exactly what changed, and show how long it took.
5. **Precise, not playful.** An engineering instrument, not a generic AI dashboard (no gradients-for-the-sake-of-it, no sparkle emoji everywhere).

## Design system

Decided in Phase 5 with the **design-system-decision** skill and recorded here (tokens as CSS variables, light + dark). Until then, these are the *semantic* roles the code must use:

| Token role | Used for |
|------------|----------|
| `--surface-canvas`, `--surface-panel`, `--surface-raised` | canvas bg, side panels, node cards |
| `--text-primary/secondary/muted` | text hierarchy |
| `--border-subtle/strong` | card outlines, separators |
| `--accent` | primary actions, focus, the command bar |
| `--state-healthy` (ρ < 0.7) | node bar, particles |
| `--state-warm` (0.7–0.9) | |
| `--state-hot` (0.9–1.0) | |
| `--state-saturated` (≥ 1) | bottleneck, error particles |
| `--state-down` | failed node (desaturated + ✕ icon) |
| `--tier-local`, `--tier-ai` | command latency badge |

State colours must pass 3:1 contrast against `--surface-raised` **and** be paired with an icon/label (NFR-012). Pick a colour-vision-safe ramp, not pure red/green.

**Typography:** one UI sans + one mono (numbers, ids, latency). Tabular numerals for all metrics.
**Icons:** one icon set (decided in Phase 5), with one glyph per `NodeKind`.
**Spacing:** 4 px base scale. **Radius:** small (cards 8, chips 999).

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
│ 🎙 [ Describe or change your system…        ] ⚡4ms  ⌁ hands-free │  command bar 64px
└───────────────────────────────────────────────────────────────┘
```

**Mobile (< 768 px):** canvas full screen, side panel becomes a draggable bottom sheet (peek shows the bottleneck), command bar pinned above the safe area.

## Components

| Component | States / notes |
|-----------|----------------|
| **Node card** | icon · label · `×N` badge · ρ bar · status colour · ✕ when down · pulse (600 ms) when changed · selected ring |
| **Traffic edge** | particle density ∝ log(rps); error particles in `--state-saturated`; dashed for `async`; dotted for `replication` |
| **Command bar** | idle · dictating (text changing) · hands-free countdown ring · thinking (✦ shimmer) · result badge |
| **Clarify chips** | appear above the command bar; number keys `1`–`4` select |
| **Confirm dialog** | names the count of affected nodes; destructive button on the right |
| **Bottleneck callout** | anchored to the node; one sentence + "Why?" expands the formula |
| **Metrics panel** | p50/p95/p99 (read/write), success %, throughput, cost, warnings |
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
| Board | hint + 3 example sentences | ✦ shimmer ghost on canvas during AI | toast + keep board |
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
