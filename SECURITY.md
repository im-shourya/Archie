# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's **Report a vulnerability** (Security tab → Advisories) on this repository. Include steps to reproduce, impact, and any suggested fix.

You'll get an acknowledgement within 72 hours. Fixes for confirmed issues are prioritised over feature work.

## Scope

- The web app and its `/api/*` endpoints
- Leaks of secrets (e.g. the Anthropic API key) via the client bundle, logs or the repository
- Prompt-injection paths that make Archie act outside the user's request

Out of scope: rate-limit bypass on the public demo via many IPs (bounded by a daily cap), and simulator accuracy (it's a documented teaching model).

## Design

Threat model and controls: [docs/20-security.md](docs/20-security.md).
