#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
mkdir -p "$PROJECT_DIR/.build"
rm -rf -- "$PROJECT_DIR/.build/module-cache"
export CLANG_MODULE_CACHE_PATH="$PROJECT_DIR/.build/module-cache"
xcrun clang \
  -fobjc-arc \
  -fmodules \
  "$PROJECT_DIR/mac-helper/main.m" \
  -framework Foundation \
  -framework AppKit \
  -framework Carbon \
  -o "$PROJECT_DIR/.build/premiere-macro-hotkeys"
echo "Built $PROJECT_DIR/.build/premiere-macro-hotkeys"
