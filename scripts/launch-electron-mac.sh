#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_APP="$ROOT_DIR/node_modules/electron/dist/Electron.app"
TMP_APP="/tmp/Electron.app"

if [[ ! -d "$SOURCE_APP" ]]; then
  echo "Electron app bundle not found at: $SOURCE_APP" >&2
  exit 1
fi

rm -rf "$TMP_APP"
cp -R "$SOURCE_APP" "$TMP_APP"
xattr -cr "$TMP_APP" >/dev/null 2>&1 || true
codesign --force --deep --sign - "$TMP_APP" >/dev/null

open -na "$TMP_APP" --args "$ROOT_DIR"
