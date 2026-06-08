#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${1:-${HOME}/.config/opencode}"
PACKAGE_ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="$CONFIG_PATH"
STAMP="$(date +%Y%m%d-%H%M%S)"

copy_gomr_path() {
  local rel="$1"
  local target_rel="$2"
  local src="$PACKAGE_ROOT/$rel"
  local dest="$TARGET/$target_rel"
  if [ -e "$dest" ]; then
    mv "$dest" "$dest.backup-$STAMP"
  fi
  mkdir -p "$(dirname "$dest")"
  cp -R "$src" "$dest"
}

copy_gomr_path ".opencode/gomr" "gomr"
copy_gomr_path ".opencode/plugins/gomr.ts" "plugins/gomr.ts"
copy_gomr_path ".opencode/agents/context-router.md" "agents/context-router.md"
copy_gomr_path ".opencode/skills/context-path-builder" "skills/context-path-builder"

mkdir -p "$TARGET"
cp "$PACKAGE_ROOT/AGENTS-GOMR.md" "$TARGET/AGENTS-GOMR.md"

echo "Installed global GOMR into $TARGET"
echo "Restart OpenCode. Each project will get its own .orca-memory when OpenCode runs there."
echo "Optional per-project init: node --no-warnings .opencode/gomr/memory-index.ts init ."
