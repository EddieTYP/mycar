#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://127.0.0.1:8000"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

AUTH_ACCOUNTS_JSON=$(grep '^AUTH_ACCOUNTS_JSON=' "$REPO_ROOT/.env" | cut -d= -f2-)
AUTH_PASSWORD=$(node -e "const accounts = JSON.parse(process.argv[1]); console.log(accounts['demo-admin'] || '')" "$AUTH_ACCOUNTS_JSON")

curl -fsS "${BASE_URL}/api/health" >/dev/null

LOGIN=$(curl -fsS -c "$COOKIE_JAR" -X POST "${BASE_URL}/api/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"demo-admin\",\"password\":\"${AUTH_PASSWORD}\"}")
node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); if (!d.ok) process.exit(1);" <<<"$LOGIN"

SESSION=$(curl -fsS -b "$COOKIE_JAR" "${BASE_URL}/api/session")
node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); if (!d.ok || !d.username) process.exit(1);" <<<"$SESSION"

GEOCODE=$(curl -fsS -b "$COOKIE_JAR" "${BASE_URL}/api/geocode?q=Central%20Hong%20Kong")
node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); if (!d.ok || !Array.isArray(d.results)) process.exit(1);" <<<"$GEOCODE"

ROUTE=$(curl -fsS -b "$COOKIE_JAR" -X POST "${BASE_URL}/api/route" -H 'Content-Type: application/json' -d '{"origin":"Central, Hong Kong","destination":"Sha Tin, Hong Kong","waypoints":[]}' )
node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); if (!d.ok || typeof d.distanceKm !== 'number' || d.distanceKm <= 0) process.exit(1);" <<<"$ROUTE"

printf 'Smoke test passed\n'
