#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
"$PROJECT_DIR/scripts/build-helper.sh" >/dev/null

echo "— bridge —"
node "$PROJECT_DIR/tests/config.test.js"
node "$PROJECT_DIR/tests/action-registry.test.js"
node "$PROJECT_DIR/tests/source.test.js"
node "$PROJECT_DIR/tests/hotkey-parity.test.js"
"$PROJECT_DIR/tests/helper-config.test.sh"

if [[ -d "$PROJECT_DIR/configurator/node_modules" ]]; then
  echo "— configurator —"
  node "$PROJECT_DIR/configurator/tests/lib.test.mjs"
  node "$PROJECT_DIR/configurator/tests/roundtrip.test.mjs"
  (cd "$PROJECT_DIR/configurator/src-tauri" && cargo test --lib --quiet)
else
  echo "— configurator — skipped (run 'npm install' in configurator/)"
fi

echo "All tests passed."
