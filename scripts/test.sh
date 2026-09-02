#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
"$PROJECT_DIR/scripts/build-helper.sh" >/dev/null

node "$PROJECT_DIR/tests/config.test.js"
node "$PROJECT_DIR/tests/action-registry.test.js"
node "$PROJECT_DIR/tests/source.test.js"
node "$PROJECT_DIR/tests/hotkey-parity.test.js"
"$PROJECT_DIR/tests/helper-config.test.sh"

echo "All tests passed."
