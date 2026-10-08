# 25 · Deployment

> **Decision (ADR-018, 2026-10-04):** production runs as **one long-running Docker container**, because the AI quota guards, rate limits and daily cap live in memory and serverless instances would each keep their own. The Vercel notes below remain valid for previews.

## Docker (production)

```
docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t archie .
docker run -d -p 3000:3000 --env-file .env.local --name archie archie
# or: docker compose up --build
```

| Piece | Detail |
|-------|--------|
| Build | multi-stage: `npm ci` from manifests (cached) → `npm run build` with `ARCHIE_STANDALONE=1` → runtime copies `frontend/.next/standalone`, `.next/static`, `public` |
| Runtime | `node:22-alpine`, user `archie` (non-root), `node frontend/server.js`, `PORT=3000`, `HOSTNAME=0.0.0.0` |
| Secrets | runtime env only (`--env-file`); `.dockerignore` keeps `.env*`, `.claude/` and the work log out of the build context; the smoke test asserts no `.env` file is in the image |
| Health | `HEALTHCHECK` fetches `/api/health`; `version` in the response is the image's git SHA |
| CI | the **Docker image** job builds the image and runs `scripts/docker-smoke.sh`: pages, `/api/problems`, a static chunk, security headers, a graceful 503 from the AI tier without a key, non-root, no `.env`, `healthy` |
| Scale | one instance (quota state is per process); more instances need a shared counter store first |
| Hosts | any container host with a persistent instance (e.g. Fly.io, Render, Railway, Cloud Run with min instances 1) |

## Render (production host)

The image runs on Render's free web service plan (docs/35 · Decisions → Host), described in [`render.yaml`](../render.yaml): Docker runtime, region Singapore, one instance, health check `/api/health`, auto-deploy on every push to `main`.

1. Render dashboard → **Blueprints → New Blueprint Instance** → this repository. Render reads `render.yaml`.
2. Enter the secrets it asks for (`sync: false`): `GEMINI_API_KEY` and `GROQ_API_KEY` (**freshly rotated**), `NEXT_PUBLIC_SITE_URL` (the service URL, e.g. `https://archie.onrender.com`) and `ARCHIE_CLIENT_IP_HEADER`. `ARCHIE_IP_SALT` is generated; `ARCHIE_DAILY_CAP=300`.
3. After the first deploy: `scripts/deploy-smoke.sh https://<service>.onrender.com --ai` (pages, problems, a static chunk, `og:url`, security headers, no `.env` served, the deployed commit, and one AI command).
4. Set the repository variable `ARCHIE_URL` to the service URL so the keep-warm workflow pings it.

| Concern | How it's handled |
|---------|------------------|
| **Build-time URL** | Next inlines `NEXT_PUBLIC_*` at build time, so the Dockerfile takes `ARG NEXT_PUBLIC_SITE_URL`. Render passes the service's environment to Docker builds; the smoke test fails if `og:url` isn't the live origin |
| **Version** | `/api/health` reports the image's `ARCHIE_VERSION`, falling back to Render's `RENDER_GIT_COMMIT` when the image was built without `GIT_SHA` |
| **Client IP** | Render's proxy sits in front of the container, so the left end of `X-Forwarded-For` is whatever the client sent. `ARCHIE_CLIENT_IP_HEADER` names the header the host sets (checked on the live service); for `x-forwarded-for` the entry is counted from the right (`ARCHIE_TRUSTED_PROXY_HOPS`, default 1). The daily cap and the quota guards are global either way |
| **Cold starts** | Free instances sleep after 15 minutes idle and take about a minute to wake. `.github/workflows/keep-warm.yml` pings `/api/health` every 10 minutes while the challenge is judged (750 free hours a month cover one instance). GitHub can run the cron late, so a first visit may still be slow |
| **Rollback** | Render → the service → **Events** → a previous deploy → **Rollback**, or **Manual Deploy → Deploy a specific commit**. No data migrations (ADR-003) |
| **Fallback host** | Hugging Face Spaces (Docker SDK, free, `app_port: 3000`) runs the same image if Render's build runs out of memory |

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
| `GEMINI_API_KEY` | ✅ | ✅ | ✅ | **yes** |
| `GROQ_API_KEY` | opt (fallback) | opt | ✅ | **yes** |
| `ANTHROPIC_API_KEY` | opt (`ARCHIE_PROVIDER=anthropic`) | opt | opt | **yes** |
| `ARCHIE_MODEL` | opt | opt | opt | no |
| `ARCHIE_DAILY_CAP` | opt | `50` | `500` | no |
| `ARCHIE_ACCESS_CODE` | — | opt | opt (only if abused) | yes |
| `ARCHIE_LOG_LEVEL` | `debug` | `info` | `info` | no |
| `NEXT_PUBLIC_SITE_URL` | — | opt | **required on Render**, also as a Docker build arg (canonical URL for OG/Twitter/sitemap; falls back to `VERCEL_PROJECT_PRODUCTION_URL`) | no |
| `ARCHIE_CLIENT_IP_HEADER` | — | — | the header the host's proxy sets with the client address | no |
| `ARCHIE_TRUSTED_PROXY_HOPS` | — | — | only for `x-forwarded-for`: proxies that append to it (default 1) | no |

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
