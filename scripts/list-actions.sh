#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
node "$PROJECT_DIR/scripts/list-actions.js"
