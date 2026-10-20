# 28 · Backup & Disaster Recovery

## What can be lost

| Data / service | Lives in | Loss scenario | Recovery |
|----------------|----------|---------------|----------|
| User boards | browser IndexedDB | browser data cleared, device lost, private mode | **User-side backups**: Export JSON, share link. Home shows a "back up your boards" hint after 5 boards |
| Source code, docs, evals | GitHub | repo deleted / corrupted | local clones + GitHub. Optionally mirror to a second remote |
| Deployment | Vercel | bad deploy | promote the previous deployment (instant) |
| API key | Vercel env | leaked or revoked | rotate (below) |
| LLM API | Anthropic | outage / rate limits | degraded mode ([15](15-ai-retry-recovery.md)) |

## Objectives

| | Target | Rationale |
|---|--------|-----------|
| **RTO** (service) | < 10 min | Vercel rollback / redeploy |
| **RPO** (service) | 0 | No server-side data |
| **RPO** (user boards) | last export / share | Local-first by design; documented in the UI and README |

## Runbooks

### R-01 · Bad production deploy

1. Vercel → Deployments → last good → **Promote to Production**.
2. Verify `/api/health` and a template board.
3. Revert the offending PR on `main`; add a regression test.

### R-02 · API key leaked

1. Anthropic Console → revoke the key **immediately**.
2. Create a new key → Vercel env `ANTHROPIC_API_KEY` → redeploy.
3. If it was committed: treat history as compromised (rotation is the fix; rewriting history isn't enough). Add a gitleaks rule if it slipped through.
4. Check Console usage for abuse in the exposure window.

### R-03 · Budget drain / abuse

1. Set `ARCHIE_ACCESS_CODE` → redeploy (AI routes now need the code).
2. Lower `ARCHIE_DAILY_CAP`.
3. Review logs (ipHash distribution) and block if needed via Vercel firewall rules.

### R-04 · LLM API outage

Nothing to do server-side. Degraded mode activates automatically. Post a note in the README/status if prolonged.

### R-05 · IndexedDB schema bug corrupts boards

1. Repository reads are validated, so corrupt boards are skipped, not deleted.
2. Ship a fix plus a migration that repairs the documents on read.
3. Never ship a migration without its fixture test ([17](17-database.md)).

## Incidents

Record every production incident in `docs/incidents/INC-NNN.md`:

```md
# INC-001 · <title>
Date · Duration · Impact
Detection: how we noticed
Timeline: hh:mm events
Root cause
Resolution
Prevention: actions + owners + links to PRs/tests
```

## DR test

Before submission: run R-01 once on a preview deployment (promote an old build, then restore) and import an exported board in a fresh browser profile.
