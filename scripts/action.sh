#!/bin/zsh
set -euo pipefail

ACTION_ID="${1:-}"
if [[ -z "$ACTION_ID" || "$ACTION_ID" == *[^A-Za-z0-9._-]* ]]; then
  echo "usage: $0 ACTION_ID" >&2
  echo "example: $0 gaussianBlur" >&2
  exit 64
fi
curl -sS --fail-with-body --max-time 30 \
  -H 'Content-Type: application/json' \
  -d "{\"actionId\":\"$ACTION_ID\"}" \
  http://127.0.0.1:48777/action
echo
