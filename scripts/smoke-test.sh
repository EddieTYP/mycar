#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://127.0.0.1:8000"

curl -fsS "${BASE_URL}/api/health" >/dev/null

GEOCODE=$(curl -fsS "${BASE_URL}/api/geocode?q=Central%20Hong%20Kong")
node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); if (!d.ok || !Array.isArray(d.results)) { process.exit(1); }" <<<"$GEOCODE"

ROUTE=$(curl -fsS -X POST "${BASE_URL}/api/route" -H 'Content-Type: application/json' -d '{"origin":"Central, Hong Kong","destination":"Sha Tin, Hong Kong","waypoints":[]}' )
node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); if (!d.ok || typeof d.distanceKm !== 'number' || d.distanceKm <= 0) { process.exit(1); }" <<<"$ROUTE"

printf 'Smoke test passed\n'
