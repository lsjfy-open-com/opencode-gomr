#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: ./install.sh /path/to/project" >&2
  exit 1
fi

PACKAGE_ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="$(cd "$1" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

copy_gomr_path() {
  local rel="$1"
  local src="$PACKAGE_ROOT/$rel"
  local dest="$TARGET/$rel"
  if [ -e "$dest" ]; then
    mv "$dest" "$dest.backup-$STAMP"
  fi
  mkdir -p "$(dirname "$dest")"
  cp -R "$src" "$dest"
}

copy_gomr_path ".opencode/gomr"
copy_gomr_path ".opencode/plugins/gomr.ts"
copy_gomr_path ".opencode/agents/context-router.md"
copy_gomr_path ".opencode/skills/context-path-builder"

if [ ! -f "$TARGET/AGENTS.md" ]; then
  cp "$PACKAGE_ROOT/AGENTS-GOMR.md" "$TARGET/AGENTS.md"
elif ! grep -q "Goal-Oriented Memory Runtime (GOMR)" "$TARGET/AGENTS.md"; then
  printf "\n" >> "$TARGET/AGENTS.md"
  cat "$PACKAGE_ROOT/AGENTS-GOMR.md" >> "$TARGET/AGENTS.md"
fi

echo "Installed GOMR into $TARGET"
echo "Next: restart OpenCode and run: node --no-warnings .opencode/gomr/memory-index.ts init ."
