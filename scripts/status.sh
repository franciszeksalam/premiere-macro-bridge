#!/bin/zsh
set -u

curl -sS --max-time 2 http://127.0.0.1:48777/health
echo
launchctl print "gui/$UID/com.local.premieremacrobridge.hotkeys" 2>/dev/null | head -40
