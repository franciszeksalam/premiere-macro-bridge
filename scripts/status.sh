#!/bin/zsh
set -u

PROJECT_DIR="${0:A:h:h}"
PORT="$(node -e 'const c=require(process.argv[1]);process.stdout.write(String(Number(c.port)||48777))' "$PROJECT_DIR/config.json")"
curl -sS --max-time 2 "http://127.0.0.1:$PORT/health"
echo
launchctl print "gui/$UID/com.local.premieremacrobridge.hotkeys" 2>/dev/null | head -40
