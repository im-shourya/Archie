#!/usr/bin/env bash
# Smoke-test a running Archie container (CI · Docker job, docs/25). Usage: scripts/docker-smoke.sh [container] [base-url]
set -euo pipefail
NAME="${1:-archie}"
BASE="${2:-http://localhost:3000}"

fail() { echo "::error::$*"; docker logs "$NAME" | tail -40; exit 1; }

for _ in $(seq 1 30); do curl -sf "$BASE/api/health" >/dev/null && break; sleep 1; done
curl -sf "$BASE/api/health" >/dev/null || fail "health never came up"
health=$(curl -s "$BASE/api/health")
echo "health: $(echo "$health" | head -c 120)"
echo "$health" | grep -q '"version":"dev"' && [ -n "${EXPECT_VERSION:-}" ] && fail "image was not stamped with a version"

for path in / /interview /design /evals /s /b/new /robots.txt; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  [ "$code" = "200" ] || fail "$path returned $code"
  echo "$path → $code"
done

curl -sf "$BASE/api/problems" | grep -q '"url-shortener"' || fail "/api/problems missing the bank"
chunk=$(curl -s "$BASE/" | grep -o '/_next/static/chunks/[^"]*\.js' | head -1)
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$chunk")" = "200" ] || fail "static chunk $chunk not served"
curl -sI "$BASE/" | grep -qi 'content-security-policy' || fail "security headers missing"

# Without a key the AI tier must fail gracefully (503), not crash.
code=$(curl -s -o /tmp/cmd.json -w '%{http_code}' -X POST "$BASE/api/command" -H 'Content-Type: application/json' \
  -d '{"utterance":"add a cache","graph":{"nodes":[],"edges":[],"workload":{"rps":0,"readRatio":0.5,"peakMultiplier":1},"version":0},"baseVersion":0}')
[ "$code" = "503" ] || fail "/api/command without a key returned $code: $(cat /tmp/cmd.json)"
echo "/api/command without a key → 503 $(head -c 90 /tmp/cmd.json)"

[ "$(docker exec "$NAME" whoami)" = "archie" ] || fail "container is not running as the archie user"
if docker exec "$NAME" sh -c 'find / -xdev -name ".env*" ! -name ".env.example" 2>/dev/null | grep -v node_modules' | grep -q .; then
  fail "an .env file is inside the image"
fi

for _ in $(seq 1 20); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$NAME")
  [ "$status" = "healthy" ] && break
  sleep 3
done
[ "$status" = "healthy" ] || fail "container health is $status"
echo "container: non-root, no .env files, HEALTHCHECK $status"
