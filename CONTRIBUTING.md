# Contributing

## Ground rules

- Read [docs/00-overview.md](docs/00-overview.md) first. **The docs are the spec.** If code needs to deviate, update the doc (or add an ADR in [docs/30](docs/30-architecture-decisions.md)) in the same PR.
- Reference IDs (`F-xx`, `FR-xxx`, `NFR-xxx`, `ADR-xxx`) in commits and PRs.
- Never commit secrets or the `.claude/` directory (gitignored; local hooks block it).

## Branches

```
main                      always deployable (production)
 ├── chore/scaffold
 ├── feat/<area>          e.g. feat/simulator, feat/ai-harness
 ├── fix/<what>           e.g. fix/cache-aside-reads
 └── docs/<what>
```

One branch per roadmap phase or fix. Sync with `main` before opening a PR.

## Commits: Conventional Commits

```
<type>(<scope>): <imperative summary ≤ 72 chars>

<why, not what: optional body>
Refs: FR-021, NFR-003
```

Types: `feat` `fix` `docs` `test` `refactor` `perf` `chore` `ci` `build`.
Scopes: `frontend` `backend` `simulator` `ai` `database` `evals` `specs` `docs` `infra`.

Keep commits atomic: one logical change, with its tests, that builds on its own.

## Pull requests

- Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md): summary, changes, requirement IDs, testing evidence, docs updated, security notes.
- CI must be green. For AI/prompt changes, attach the eval delta (`npm run eval -- --split test`).
- Squash-merge to `main`, with the PR title as the commit subject.

## Testing requirements

| Change | Required |
|--------|----------|
| `simulator/` | unit + golden tests; update docs 09–11 if the model changes |
| `ai/fastpath` | unit tests incl. an abstain case; fast-path precision stays 100% |
| `ai/llm` prompts / harness | eval run on the dev split; test split before merge |
| `backend/` | integration test via `app.request()` |
| contracts (`specs/`) | update both JSON Schema and Zod; contract tests pass |
| UI | e2e for new flows; axe passes |

See [docs/21-testing.md](docs/21-testing.md).

## Development setup

See [README → Getting started](README.md#getting-started) and [docs/25-deployment.md](docs/25-deployment.md) for env vars.

## Issues

Use the templates: **Bug report** (steps, expected, actual, board JSON export if relevant) or **Feature request** (problem, proposal, requirement IDs).
