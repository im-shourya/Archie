# 25 · Deployment

## Environments

| Env | URL | Trigger | AI key | Notes |
|-----|-----|---------|--------|-------|
| Local | `http://localhost:3000` | `npm run dev` | `.env.local` | backend standalone on `:8787` optional |
| Preview | `archie-git-<branch>.vercel.app` | every PR | preview key (low cap) | `ARCHIE_DAILY_CAP=50` |
| Production | `archie-<name>.vercel.app` (or custom) | merge to `main` | prod key | spend limit set in the Console |

## Topology

One Vercel project, root `frontend/`, with npm workspaces installed from the repo root. Next.js serves pages and static assets (CDN), and `/api/*` runs the Hono backend as a Node.js serverless function (`maxDuration 30`).

## Environment variables

| Var | Local | Preview | Prod | Secret |
|-----|-------|---------|------|--------|
| `ANTHROPIC_API_KEY` | ✅ | ✅ | ✅ | **yes** |
| `ARCHIE_MODEL` | opt | opt | opt | no |
| `ARCHIE_DAILY_CAP` | opt | `50` | `500` | no |
| `ARCHIE_ACCESS_CODE` | — | opt | opt (only if abused) | yes |
| `ARCHIE_LOG_LEVEL` | `debug` | `info` | `info` | no |

`.env.example` lists all of these with placeholder values.

## Build

```
npm ci                         # root, all workspaces
npm run build -w simulator -w ai -w database -w backend   # tsc → dist (or TS project refs)
npm run build -w frontend      # next build
```

Vercel settings: Install `npm ci` (root) · Build `npm run build` (root script runs the above) · Output `frontend/.next`.

## CI/CD

```
git push (branch)
   ↓
GitHub Actions CI: lint → typecheck → unit → contracts → build → secret grep → e2e (AI mocked)
   ↓ green
Vercel preview deploy → smoke: GET /api/health, load /, /b/new
   ↓ PR approved + merged to main
Vercel production deploy
   ↓
Post-deploy smoke (manual for now): /api/health ok · template board loads · 1 fast-path + 1 AI command
```

## Database migrations

None on the server. IndexedDB/board migrations ship with the frontend and run on read ([17](17-database.md)).

## Rollback

Vercel → Deployments → previous production deployment → **Promote to Production** (instant). Since there's no server DB, a rollback never needs a data migration. The client handles boards saved by a newer `schemaVersion` by showing "made with a newer version" (read-only).

## Pre-launch checklist

- [ ] Anthropic Console spend limit set
- [ ] Prod env vars set; `ARCHIE_DAILY_CAP` set
- [ ] `/api/health` → `ok`
- [ ] Security headers present (`curl -I`)
- [ ] Bundle grep clean
- [ ] Eval run against the deployed URL, results committed
