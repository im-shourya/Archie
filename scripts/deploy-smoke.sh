#!/usr/bin/env bash
# Smoke-test a deployed Archie (docs/25 · Post-deploy). Usage: scripts/deploy-smoke.sh <base-url> [--ai]
# --ai also sends one command through /api/command (spends one free-tier call).
set -euo pipefail
BASE="${1:?usage: scripts/deploy-smoke.sh <base-url> [--ai]}"
BASE="${BASE%/}"
AI="${2:-}"

fail() { echo "FAIL: $*" >&2; exit 1; }

# Free hosts may be asleep: give a cold start up to 3 minutes.
for _ in $(seq 1 36); do curl -sf "$BASE/api/health" >/dev/null && break; sleep 5; done
health=$(curl -sf "$BASE/api/health") || fail "health never came up"
echo "health: $(echo "$health" | head -c 160)"
echo "$health" | grep -q '"ok":true' || fail "health is not ok"
echo "$health" | grep -q '"llm":"configured"' || fail "no AI key configured"
echo "$health" | grep -q '"version":"dev"' && fail "the deployment doesn't report its commit"

for path in / /interview /design /evals /b/new /s /robots.txt /sitemap.xml; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  [ "$code" = "200" ] || fail "$path returned $code"
  echo "$path → $code"
done

curl -sf "$BASE/api/problems" | grep -q '"url-shortener"' || fail "/api/problems missing the bank"
home=$(curl -s "$BASE/")
chunk=$(echo "$home" | grep -o '/_next/static/chunks/[^"]*\.js' | head -1)
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$chunk")" = "200" ] || fail "static chunk $chunk not served"
echo "$home" | grep -q "property=\"og:url\" content=\"$BASE" || fail "og:url doesn't point at $BASE (NEXT_PUBLIC_SITE_URL at build time?)"

headers=$(curl -sI "$BASE/")
for h in content-security-policy strict-transport-security x-content-type-options referrer-policy; do
  echo "$headers" | grep -qi "^$h:" || fail "missing $h"
done
for secret in /.env /.env.local; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$secret")
  [ "$code" = "404" ] || fail "$secret returned $code"
done

if [ "$AI" = "--ai" ]; then
  body=$(node -e 'const g=require("./evals/fixtures/three-tier.json");process.stdout.write(JSON.stringify({utterance:"where is the bottleneck",graph:g,baseVersion:g.version}))')
  res=$(curl -s -w '\n%{http_code} %{time_total}s' -H 'content-type: application/json' -d "$body" "$BASE/api/command")
  status=$(echo "$res" | tail -1)
  echo "AI command: $status"
  echo "$res" | head -1 | grep -q '"kind":"answer"' || fail "AI command didn't answer: $(echo "$res" | head -c 200)"
fi
echo "deploy smoke OK: $BASE"
