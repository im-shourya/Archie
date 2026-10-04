# Changelog

All notable user-visible changes. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Add ▾**: put any component type on the board by hand (a 44 px button on phones). The new component opens in the Inspector.
- **Connect** in the Inspector: link a component to another one (sends to / receives from, all traffic, reads or writes) without the AI.
- "Add a Redis cache", "add an orders service", "add Kafka called order events" now work by voice locally, with no AI call. Ambiguous or placed requests ("add a database", "a cache in front of Postgres") still go to the AI.

## [1.0.0] - 2026-10-04

First release, prepared for the Wispr Flow challenge submission. Live at <https://archie-rb2x.onrender.com>.

### Fixed
- When "the database" (or "the service", "the cache") could mean two components, the app now asks which one instead of guessing.
- Answering a question with an option like "Postgres (primary)" no longer makes the app ask again.
- When an AI model hangs, the request now leaves time for the fallback provider instead of timing out.
- "Kill Redis and send sixty thousand requests a second" fails Redis instead of deleting it.
- Rate limits can't be bypassed by sending a fake `X-Forwarded-For` header behind a proxy (set `ARCHIE_CLIENT_IP_HEADER`).
- Failed components stay readable: they're dimmed with colour instead of transparency, which had dropped their text below the contrast minimum.
- Components no longer blink after every change, and Escape from the Inspector always returns focus to the component.
- Undo and other shortcuts work while a checkbox has focus.
- Wide graphs no longer render tiny on phones and portrait tablets: they lay out top to bottom and stay legible after fit, also after rotating.
- On phones, toasts and AI panels no longer overlap the side panel.
- Canvas components show a visible focus ring when reached with the keyboard.
- AI and microphone errors are announced immediately to screen readers.
- AI commands with numbers beyond the limits ("fifty million requests a second", "a billion replicas") now ask, stating the limit, instead of applying a silently capped value.
- An AI request can no longer run past its 20-second budget when a provider stops responding.

### Changed
- The board page loads about 60 KB less JavaScript (validation now uses a lighter library in the browser).
- Command bar, history and node cards use icons instead of emoji.
- Commands the fast path doesn't understand now go to the AI tier instead of showing a hint.

### Added
- Share links: **Share** copies a link to a read-only copy of the board with the live simulation, and **Duplicate** saves an editable copy. The design travels in the link's `#` fragment, so it never reaches the server; broken or oversized links show a clear error page.
- Export: JSON (re-importable with **Open file** on the home page), a Mermaid diagram, a Markdown design doc with the simulator's numbers, single points of failure and review findings, and SVG or PNG images.
- Replay: step through a board's changes, undo included, with play, scrub and a list of every change.
- `/evals`: the eval report, built from the committed results: per-category accuracy on the held-out split, false actions, cases with no answer from any provider, and latency percentiles per tier.
- Render deployment: a `render.yaml` blueprint and a deploy smoke test for any URL.
- Docker image: `docker compose up --build` runs the production app on one long-running container (non-root, health check, no secrets in the image).
- Interview practice: six problems with requirements, a live checklist of the SLOs your design meets at peak (computed by the simulator), an interviewer that asks one grounded question at a time (read aloud if you like), and a scorecard with the computed checks and an evidence-based rubric.
- Design review: ranked findings for any board, each fix proven by the simulator to clear its finding, plus AI findings when available; apply a fix in one click and undo it.
- Single points of failure: every board marks the components that can't survive losing one instance, and the Inspector shows what losing one would do.
- `/design`: a live style guide with every colour token (and its contrast), the type scale, icons and component states.
- Phone menu (⋯) for Review, Finish and Rename.
- Inspector: select a component to edit its label, replicas, shards, hit rate, capacity, latency, cost, role and failover, fail or recover it, see its live load, and disconnect its edges. Invalid values show the exact limit and change nothing; every edit can be undone.
- Phone layout: the side panel becomes a bottom sheet that peeks with the bottleneck and expands to half or full.
- Mic button for browsers with built-in speech recognition, as a fallback when Wispr Flow isn't installed.
- Access-code dialog for demos that require a code; the code is kept for the current tab only.
- Accessibility gate (axe, WCAG 2.2 A/AA) and keyboard, reduced-motion and phone end-to-end tests; `npm run bundle:size` for the board route's JS size.
- AI tier: `POST /api/command` turns free-form design language into validated edits, clarifying questions (tappable answers, keys 1–4), confirmations for big deletions, answers grounded in the simulator's numbers (with the components highlighted), or a polite no-op.
- Command harness: structured output, one repair turn for invalid edits, guardrails enforced in code, typed errors, timings and token usage; per-IP rate limit, daily cap and optional access code.
- Command bar states for the AI: thinking / still thinking, AI latency badge, Retry with request id, degraded-mode banner when the AI is unavailable (local commands keep working).
- Free default AI provider: Gemini (`GEMINI_API_KEY`, free tier); Claude stays available with `ARCHIE_PROVIDER=anthropic`.
- Groq fallback (`GROQ_API_KEY`, free tier) when Gemini is rate-limited, overloaded or out of quota, plus per-provider quota guards that answer 429 before a free tier is overrun; `/api/health` shows quota usage.
- `npm run eval`: command-understanding eval (31 cases across 15 categories, structural assertions, accuracy, false-action rate and latency percentiles).
- Brand: logo (an "A" drawn as a three-node graph), favicon that adapts to dark mode, Apple touch icon, social preview image, web app manifest.
- SEO: title template, description, Open Graph and Twitter cards, canonical URL, theme colours, JSON-LD, robots rules (boards and API not indexed) and sitemap.
- Design system: semantic colour tokens for light and dark themes, IBM Plex Sans and Mono, Lucide icons (one per component kind), redesigned Home page.
- Live simulation: per-component load, utilization and status, end-to-end success and p50/p95/p99 latency, throughput and monthly cost; cache-aside, read replicas, sharding, queues with backlog, failover and failure injection; every red component explains itself with the numbers.
- Animated traffic on edges (failing requests in red), bottleneck callout, metrics panel with blast radius and component details.
- `npm run bench:sim` latency benchmark.
- Voice command bar: instant local commands (kill/recover, delete, connect/disconnect, replicas, shards, hit rate, workload, undo/redo, fit/zoom) with spoken-number and dictation-error handling; unclear commands are never guessed.
- Latency badge, hands-free mode (auto-send when dictation settles), command history (↑/↓), toast with Undo, `/` and ⌘K focus, `H` toggle.
- `npm run bench:fast` latency benchmark.
- Graph model, component catalog and op engine (`applyBatch`) with atomic batches and 11 validation error codes; templates: three-tier, URL shortener, chat.
- Boards saved in IndexedDB (memory fallback), share-link codec, Home with templates and recent boards, board canvas with automatic layout, undo/redo and change history.
- npm-workspaces monorepo (`frontend`, `backend`, `simulator`, `ai`, `database`, `evals`) with a Next.js app and a Hono API mounted at `/api`.
- `GET /api/health`, request IDs, structured request logs, 256 KB body limit, standard error shape.
- ESLint import boundaries, Vitest, Playwright smoke tests.
- Project documentation (`docs/00–31`), machine-readable contracts (`specs/`), repository scaffolding files.

[Unreleased]: https://github.com/im-shourya/Archie/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/im-shourya/Archie/releases/tag/v1.0.0
