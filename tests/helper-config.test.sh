#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
HELPER="$PROJECT_DIR/.build/premiere-macro-hotkeys"
FIXTURE="$PROJECT_DIR/tests/fixtures/invalid-actions.json"
TEMP_DIR="$(mktemp -d)"
RUNTIME_CONFIG="$TEMP_DIR/config.json"
trap 'rm -rf -- "$TEMP_DIR"' EXIT

if [[ ! -x "$HELPER" ]]; then
  "$PROJECT_DIR/scripts/build-helper.sh"
fi

node "$PROJECT_DIR/scripts/sync-runtime-config.js" "$FIXTURE" "$RUNTIME_CONFIG" >/dev/null
OUTPUT="$($HELPER --config "$RUNTIME_CONFIG" --check-config)"
for EXPECTED in \
  "HOTKEY_VALID ctrl+alt+g -> good" \
  "DUPLICATE_HOTKEY actionId=duplicateA" \
  "DUPLICATE_HOTKEY actionId=duplicateB" \
  "FILE_NOT_FOUND actionId=missing" \
  "UNKNOWN_ACTION_TYPE actionId=unknown"
do
  if [[ "$OUTPUT" != *"$EXPECTED"* ]]; then
    echo "missing native validator output: $EXPECTED" >&2
    exit 1
  fi
done

if [[ "$OUTPUT" == *"HOTKEY_VALID ctrl+alt+q"* ]]; then
  echo "conflicting hotkey was accepted" >&2
  exit 1
fi

echo "helper-config.test.sh OK"
