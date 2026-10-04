# syntax=docker/dockerfile:1
# Archie as one long-running container (docs/25, ADR-018). One process keeps the in-memory quota
# guards, per-IP rate limits and daily cap correct, which per-instance serverless functions can't.
# Keys are runtime env vars (docker run --env-file .env.local), never baked into the image.

ARG NODE_VERSION=22

# 1. Dependencies: only the manifests, so this layer is cached until a package.json changes.
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY simulator/package.json simulator/
COPY ai/package.json ai/
COPY database/package.json database/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY evals/package.json evals/
RUN npm ci --no-audit --no-fund

# 2. Build: Next's standalone output (a minimal server.js plus only the traced node_modules).
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
# Next inlines NEXT_PUBLIC_* at build time: the canonical URL for metadata, OG tags and the sitemap.
ARG NEXT_PUBLIC_SITE_URL=
ENV NEXT_TELEMETRY_DISABLED=1 ARCHIE_STANDALONE=1 NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Runtime: non-root, no dev dependencies, no source.
FROM node:${NODE_VERSION}-alpine AS run
ARG GIT_SHA=dev
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 ARCHIE_VERSION=${GIT_SHA}
RUN addgroup -S archie && adduser -S archie -G archie
COPY --from=build --chown=archie:archie /app/frontend/.next/standalone ./
COPY --from=build --chown=archie:archie /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=archie:archie /app/frontend/public ./frontend/public
USER archie
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]
