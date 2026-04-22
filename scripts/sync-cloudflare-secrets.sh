#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${1:-mycar}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
STATE_FILE="$REPO_ROOT/.cloudflare-sync-state.json"

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env not found at $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID before running this script." >&2
  exit 1
fi

get_value() {
  local key="$1"
  grep "^${key}=" "$ENV_FILE" | cut -d= -f2-
}

AUTH_ACCOUNTS_JSON="$(get_value AUTH_ACCOUNTS_JSON)"
SESSION_SECRET="$(get_value SESSION_SECRET)"
ORS_API_KEY="$(get_value ORS_API_KEY)"
GRAPHHOPPER_API_KEY="$(get_value GRAPHHOPPER_API_KEY)"

if [[ -z "$AUTH_ACCOUNTS_JSON" || -z "$SESSION_SECRET" || -z "$ORS_API_KEY" || -z "$GRAPHHOPPER_API_KEY" ]]; then
  echo "Missing one of AUTH_ACCOUNTS_JSON / SESSION_SECRET / ORS_API_KEY / GRAPHHOPPER_API_KEY in .env" >&2
  exit 1
fi

printf '%s' "$AUTH_ACCOUNTS_JSON" | wrangler pages secret put AUTH_ACCOUNTS_JSON --project-name "$PROJECT_NAME"
printf '%s' "$SESSION_SECRET" | wrangler pages secret put SESSION_SECRET --project-name "$PROJECT_NAME"
printf '%s' "$ORS_API_KEY" | wrangler pages secret put ORS_API_KEY --project-name "$PROJECT_NAME"
printf '%s' "$GRAPHHOPPER_API_KEY" | wrangler pages secret put GRAPHHOPPER_API_KEY --project-name "$PROJECT_NAME"

python3 - <<'PY' "$AUTH_ACCOUNTS_JSON" "$PROJECT_NAME" "$STATE_FILE"
import json, sys, pathlib, datetime
accounts = json.loads(sys.argv[1])
project = sys.argv[2]
state_file = pathlib.Path(sys.argv[3])
state = {
    "project": project,
    "accounts": sorted(accounts.keys()),
    "synced_at_utc": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
}
state_file.write_text(json.dumps(state, indent=2) + "\n")
PY

echo "Cloudflare Pages secrets synced for project: $PROJECT_NAME"
