#!/bin/zsh
set -euo pipefail

ACTION="${1:-}"
ID="${2:-}"
if [[ -z "$ACTION" || -z "$ID" ]]; then
  echo "usage: $0 applyPreset smoothZoom | insertSfx whoosh01" >&2
  exit 64
fi
curl -sS --fail-with-body \
  -H 'Content-Type: application/json' \
  -d "{\"action\":\"$ACTION\",\"id\":\"$ID\"}" \
  http://127.0.0.1:48777/action
echo
