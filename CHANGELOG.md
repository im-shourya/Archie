# Changelog

All notable user-visible changes. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Changed
- Command bar, history and node cards use icons instead of emoji.
- Commands the fast path doesn't understand now go to the AI tier instead of showing a hint.

### Added
- AI tier: `POST /api/command` turns free-form design language into validated edits, clarifying questions (tappable answers, keys 1–4), confirmations for big deletions, answers grounded in the simulator's numbers (with the components highlighted), or a polite no-op.
- Command harness: structured output, one repair turn for invalid edits, guardrails enforced in code, typed errors, timings and token usage; per-IP rate limit, daily cap and optional access code.
- Command bar states for the AI: thinking / still thinking, AI latency badge, Retry with request id, degraded-mode banner when the AI is unavailable (local commands keep working).
- Free default AI provider: Gemini (`GEMINI_API_KEY`, free tier); Claude stays available with `ARCHIE_PROVIDER=anthropic`.
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
