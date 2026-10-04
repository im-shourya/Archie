# Accessibility statement

Effective 5 October 2026.

Archie is meant to be usable by voice, keyboard, mouse and touch, with or without a screen reader. Our target is the Web Content Accessibility Guidelines (WCAG) 2.2, level AA.

## How we check

- **Automated audits on every change.** Every pull request runs axe against the home page, boards (with and without failures), the Inspector, interview mode, the scorecard, design review, share links, exports, replay, the evals page and the style guide, in light and dark themes and at desktop and phone sizes. The required result is zero serious or critical issues.
- **Contrast is computed, not eyeballed.** Every text colour meets 4.5:1 against every background it appears on, in both themes.
- **Keyboard journeys are tested:** from the command bar to the canvas, into the Inspector, editing a value and back, without a mouse.

## What works

- **Every action has a keyboard path.** Menus follow the standard menu-button pattern (arrow keys, Home and End, Escape). Canvas components are focusable, and Delete removes the focused selection.
- **Three ways to edit, so no single input is required:** speak or type a command, use the Add menu and the Inspector's forms, or use the canvas directly.
- **State is never shown by colour alone.** Every component also shows its status in text (for example "ρ 1.40" or "down") and has a descriptive label for screen readers.
- **Motion is optional.** With reduced motion turned on in your system, traffic animations, reveals and button effects are switched off.
- **Phones get a layout of their own**, with 44-pixel touch targets and a bottom sheet instead of a cramped side panel.

## Known limitations

- **Dragging to connect components** on the canvas needs a pointer. The same connection can be made from the Inspector's Connect form or by saying "connect the API to Redis".
- **The canvas is a visual graph.** Screen reader users get each component's label, kind and status, and can read the whole design from the Metrics panel and the Inspector, but not the layout of the picture itself.
- **AI answers can be slow** on the free tier. The interface announces when it's thinking and lets you retry.
- **Exported images (SVG, PNG)** contain text labels but are not tagged for assistive technology. The Markdown design doc is the accessible export.

## Feedback

If something gets in your way, open an issue on [GitHub](https://github.com/im-shourya/Archie/issues) with what you were trying to do, your browser and any assistive technology you use. We treat accessibility problems as bugs.
