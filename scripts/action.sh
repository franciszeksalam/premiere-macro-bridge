#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
ACTION_ID="${1:-}"
if [[ -z "$ACTION_ID" || "$ACTION_ID" == *[^A-Za-z0-9._-]* ]]; then
  echo "usage: $0 ACTION_ID" >&2
  echo "example: $0 gaussianBlur" >&2
  exit 64
fi
PORT="$(node -e 'const c=require(process.argv[1]);process.stdout.write(String(Number(c.port)||48777))' "$PROJECT_DIR/config.json")"
curl -sS --fail-with-body --max-time 30 \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$ACTION_ID\"}" \
  "http://127.0.0.1:$PORT/action"
echo
