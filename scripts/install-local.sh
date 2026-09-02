#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
EXTENSIONS_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
EXTENSION_DIR="$EXTENSIONS_DIR/com.local.premieremacrobridge"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LAUNCH_AGENT="$LAUNCH_AGENTS_DIR/com.local.premieremacrobridge.hotkeys.plist"
LOG_DIR="$HOME/Library/Logs/PremiereMacroBridge"

"$PROJECT_DIR/scripts/build-helper.sh"
mkdir -p "$EXTENSIONS_DIR" "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

if [[ -L "$EXTENSION_DIR" ]]; then
  unlink "$EXTENSION_DIR"
elif [[ -d "$EXTENSION_DIR" && -f "$EXTENSION_DIR/CSXS/manifest.xml" ]]; then
  if ! grep -q 'com.local.premieremacrobridge' "$EXTENSION_DIR/CSXS/manifest.xml"; then
    echo "Refusing to update a different extension: $EXTENSION_DIR" >&2
    exit 1
  fi
fi
mkdir -p "$EXTENSION_DIR/CSXS" "$EXTENSION_DIR/js" "$EXTENSION_DIR/jsx"
cp "$PROJECT_DIR/index.html" "$EXTENSION_DIR/index.html"
cp "$PROJECT_DIR/CSXS/manifest.xml" "$EXTENSION_DIR/CSXS/manifest.xml"
cp "$PROJECT_DIR/js/bridge.js" "$EXTENSION_DIR/js/bridge.js"
cp "$PROJECT_DIR/jsx/bridge.jsx" "$EXTENSION_DIR/jsx/bridge.jsx"
cp "$PROJECT_DIR/com.local.premieremacrobridge.hotkeys.plist" "$LAUNCH_AGENT"

launchctl bootout "gui/$UID" "$LAUNCH_AGENT" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$LAUNCH_AGENT"

echo "Installed CEP extension: $EXTENSION_DIR"
echo "Started LaunchAgent: com.local.premieremacrobridge.hotkeys"
echo "Restart Premiere Pro so the invisible CEP bridge loads."
