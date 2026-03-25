#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_NAME="LocalMusicPlayer"

check_dir() {
  local path="$1"
  local marker="$2"
  if [[ ! -d "$path" ]]; then
    echo "Missing package directory: $path"
    return 1
  fi
  if [[ ! -e "$path/$marker" ]]; then
    echo "Missing expected artifact: $path/$marker"
    return 1
  fi
  echo "OK: $path/$marker"
}

checked=0

if [[ -d "$DIST_DIR/${APP_NAME}-darwin-arm64" ]]; then
  check_dir "$DIST_DIR/${APP_NAME}-darwin-arm64" "${APP_NAME}.app"
  checked=1
fi

if [[ -d "$DIST_DIR/${APP_NAME}-win32-x64" ]]; then
  check_dir "$DIST_DIR/${APP_NAME}-win32-x64" "${APP_NAME}.exe"
  checked=1
fi

if [[ -d "$DIST_DIR/${APP_NAME}-linux-x64" ]]; then
  check_dir "$DIST_DIR/${APP_NAME}-linux-x64" "${APP_NAME}"
  checked=1
fi

if [[ "$checked" -eq 0 ]]; then
  echo "No package artifacts found in $DIST_DIR"
  exit 1
fi

echo "Packaging smoke checks passed."
