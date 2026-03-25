#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGER="$ROOT_DIR/node_modules/@electron/packager/bin/electron-packager.js"
ELECTRON_PKG="$ROOT_DIR/node_modules/electron/package.json"
OUT_DIR="$ROOT_DIR/dist"
APP_NAME="LocalMusicPlayer"
PLATFORM="darwin"
ARCH="arm64"

if [[ ! -f "$PACKAGER" ]]; then
  echo "electron-packager not found at: $PACKAGER"
  exit 1
fi

if [[ ! -f "$ELECTRON_PKG" ]]; then
  echo "electron package.json not found at: $ELECTRON_PKG"
  exit 1
fi

ELECTRON_VERSION="$(node -p "require('$ELECTRON_PKG').version")"

rm -rf "$OUT_DIR/${APP_NAME}-${PLATFORM}-${ARCH}"

node "$PACKAGER" "$ROOT_DIR" "$APP_NAME" \
  --platform="$PLATFORM" \
  --arch="$ARCH" \
  --overwrite \
  --prune=true \
  --electron-version="$ELECTRON_VERSION" \
  --out="$OUT_DIR" \
  --ignore='^/test$' \
  --ignore='^/scripts$'

echo "Packaged: $OUT_DIR/${APP_NAME}-${PLATFORM}-${ARCH}/${APP_NAME}.app"
