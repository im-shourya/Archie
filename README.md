# Archie

**Talk through a system. Watch it run. Watch it break.**
A voice-first system-design board: describe an architecture out loud, see it drawn live, put real traffic through it, kill components, and get questioned by an AI interviewer whose grading comes from a simulator.

> 🎙 Built entirely by voice with [Wispr Flow](https://ref.wisprflow.ai/hhg) for Hacker House Goa 2026.
> **Status:** in development. See [project state](docs/31-project-state.md).

<!-- Demo GIF + live link go here once deployed -->

## What it does

```
🎙 "Users hit two load balancers, thirty API servers, Postgres with two read replicas, and Redis."
   → the diagram draws itself
🎙 "Send fifty thousand requests a second, ninety percent reads."
   → Postgres turns red: ρ = 1.40, 28.6% of requests dropped (with the math)
🎙 "Shard Postgres into two."   → ρ = 0.70, back to green
🎙 "Kill Redis."                 → reads flood the DB, p99 spikes
🎙 "Interview me."               → one sharp question + live SLO checklist
```

## Highlights

- **Two-tier command engine.** A local grammar handles common commands in milliseconds and abstains when unsure; Claude handles everything else, emitting **validated graph ops** (never a regenerated diagram).
- **A real simulator.** Deterministic queueing model with cache-aside, read replicas, sharding, queues, failover, and Monte Carlo p50/p99, in < 5 ms.
- **Guardrails.** Clarifies ambiguity, confirms destructive changes, ignores off-topic input, and repairs invalid output.
- **Measured.** An eval set with accuracy per category and latency P50/P70/P95/P100 per tier (numbers below once published).

## Results

| Metric | Value |
|--------|-------|
| Task accuracy (held-out) | _pending_ |
| False-action rate | _pending_ |
| Fast path P50 / P100 | _pending_ |
| AI command P50 / P95 | _pending_ |
| Simulator P95 @ 100 nodes | _pending_ |

Methodology: [evaluation](docs/22-evaluation.md) · [latency benchmark](docs/24-latency-benchmark.md).

## Architecture

```
Wispr Flow → Command bar → fast path ─hit─► ops ─► simulator ─► canvas
                              │ miss
                              ▼
                     /api/command (Hono) → Claude (structured output)
                              → validate → repair → guardrails → ops
```

Details: [system architecture](docs/04-system-architecture.md).

## Tech stack

Next.js · React Flow · elkjs · Zustand · Hono · TypeScript · Zod · Claude API (`claude-opus-5-5`) · IndexedDB · Vitest · Playwright · Vercel

## Getting started

> Setup instructions land with Phase 0 ([roadmap](docs/29-roadmap.md)).

```bash
git clone <repo-url> archie && cd archie
cp .env.example .env.local      # add ANTHROPIC_API_KEY
npm install
npm run dev                     # http://localhost:3000
```

## Documentation

Start with the [overview](docs/00-overview.md). Product: [idea](docs/01-idea.md) · [requirements](docs/02-requirements.md) · [spec](docs/03-product-spec.md) · [roadmap](docs/29-roadmap.md). Engineering: [architecture](docs/04-system-architecture.md) · [simulator](docs/09-simulation-engine.md) · [AI](docs/12-ai-architecture.md) · [API](docs/16-api.md) · [security](docs/20-security.md) · [decisions](docs/30-architecture-decisions.md). Contracts: [`specs/`](specs/).

## Contributing & security

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE)
