#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
LABEL="com.local.premieremacrobridge.hotkeys"
HELPER="$HOME/Library/Application Support/PremiereMacroBridge/premiere-macro-hotkeys"
RUNTIME_CONFIG="$HOME/Library/Application Support/PremiereMacroBridge/config.json"

node "$PROJECT_DIR/scripts/sync-runtime-config.js" "$PROJECT_DIR/config.json" "$RUNTIME_CONFIG"
"$HELPER" --config "$RUNTIME_CONFIG" --check-config
launchctl kickstart -k "gui/$UID/$LABEL"
echo "Reloaded config.json and restarted $LABEL (helper was not rebuilt)."
