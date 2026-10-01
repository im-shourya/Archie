# Changelog

All notable user-visible changes. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Voice command bar: instant local commands (kill/recover, delete, connect/disconnect, replicas, shards, hit rate, workload, undo/redo, fit/zoom) with spoken-number and dictation-error handling; unclear commands are never guessed.
- Latency badge, hands-free mode (auto-send when dictation settles), command history (↑/↓), toast with Undo, `/` and ⌘K focus, `H` toggle.
- `npm run bench:fast` latency benchmark.
- Graph model, component catalog and op engine (`applyBatch`) with atomic batches and 11 validation error codes; templates: three-tier, URL shortener, chat.
- Boards saved in IndexedDB (memory fallback), share-link codec, Home with templates and recent boards, board canvas with automatic layout, undo/redo and change history.
- npm-workspaces monorepo (`frontend`, `backend`, `simulator`, `ai`, `database`, `evals`) with a Next.js app and a Hono API mounted at `/api`.
- `GET /api/health`, request IDs, structured request logs, 256 KB body limit, standard error shape.
- ESLint import boundaries, Vitest, Playwright smoke tests.
- Project documentation (`docs/00–31`), machine-readable contracts (`specs/`), repository scaffolding files.
