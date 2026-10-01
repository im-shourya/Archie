# 20 · Security

Follows `.claude/skills/security`. Any security-sensitive change must be called out in its PR description.

## Assets

1. **`ANTHROPIC_API_KEY`**: cost and abuse risk if leaked.
2. **The AI budget**: can be drained by abuse even without the key.
3. **Users' boards**: local only, but share links and exports carry them.
4. **The repository**: must never contain secrets or `.claude/`.

## Threat model

| ID | Threat | Risk | Mitigation | Status |
|----|--------|------|------------|--------|
| T-01 | API key leaks into the client bundle | High | Key read only in `ai/llm` (server-only); ESLint import ban; CI greps `.next/static` for `sk-ant` | Planned |
| T-02 | API key committed to git | High | `.env*` gitignored, `.env.example` only; CI secret scan (gitleaks) | Planned |
| T-03 | Budget drain (scripted calls) | High | Per-IP rate limit, daily cap, optional access code, Console spend limit | Planned |
| T-04 | Prompt injection via utterance or node labels | Medium | Untrusted-data rule in prompt; output limited to schema'd ops/text; ops validated; no tools, no code execution, no URLs fetched | Planned |
| T-05 | XSS via labels, AI messages, share links | High | React escaping only; no `dangerouslySetInnerHTML`; Mermaid/SVG export escaped; CSP | Planned |
| T-06 | Malicious share link (huge / malformed) | Medium | Size cap 32 KB, Zod validation, bounds; errors render a safe page | Planned |
| T-07 | Oversized request bodies (DoS) | Medium | 256 KB cap, ≤ 200 nodes, utterance ≤ 4,000 chars | Planned |
| T-08 | Leaking provider errors / stack traces | Low | Error mapper returns codes only; details logged server-side | Planned |
| T-09 | Logging user content | Medium | Logs contain requestId, route, timings, usage, kind. **Never** utterance or graph | Planned |
| T-10 | Vulnerable dependencies | Medium | `npm audit` in CI (fail on high), Dependabot, lockfile committed | Planned |
| T-11 | Clickjacking | Low | `frame-ancestors 'none'` | Planned |
| T-12 | Access-code brute force | Low | Constant-time compare + per-IP limit | Planned |
| T-13 | `.claude/` skills pushed by mistake | Low | `.gitignore`, `.git/info/exclude`, local pre-commit + pre-push hooks, CI check | ✅ Done (local) |

## Controls

### Secrets management

- Local: `.env.local` (gitignored). Prod: Vercel encrypted env vars. Never `NEXT_PUBLIC_*` for secrets.
- Rotation: if exposure is suspected → revoke in the Anthropic Console → set a new key in Vercel → redeploy ([28](28-disaster-recovery.md)).

### Input validation

Zod at every boundary: API bodies (backend), LLM outputs (harness), IndexedDB reads (database), share links (database). Numeric bounds as in GI-05/06.

### Security headers (`frontend/next.config.ts`)

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';
  worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: microphone=(self), camera=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

(`unsafe-inline` for scripts is needed by Next.js unless nonces are added. Tighten to nonces if time allows.)

### CORS

Same-origin only (the backend is mounted in the same Next.js app). No CORS headers are emitted, so cross-origin browser calls fail by default.

### CSRF

No cookies or sessions, so classic CSRF doesn't apply. The access code goes in a custom header (which also blocks simple cross-site form posts).

### Abuse prevention

Rate limiting is in-memory per serverless instance, which is best-effort. The daily cap plus the Console spend limit are the hard stops. If abuse appears, enable the access code (no redeploy needed beyond the env change).

## Security review checklist (before every PR to `main`)

- [ ] No new secret or key in the diff; no `NEXT_PUBLIC_` secret
- [ ] New inputs validated with Zod + size bounds
- [ ] No raw HTML rendering of user/AI content
- [ ] Logs don't include utterances/graphs
- [ ] New dependency justified, `npm audit` clean
- [ ] `git ls-files | grep '^.claude/'` is empty

## Incident response

See [28-disaster-recovery.md](28-disaster-recovery.md#incidents). Report vulnerabilities per [`SECURITY.md`](../SECURITY.md).
