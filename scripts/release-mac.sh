#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_BUNDLE="$ROOT_DIR/dist/LocalMusicPlayer-darwin-arm64/LocalMusicPlayer.app"
TARGET_DIR="$HOME/Applications"
TARGET_APP="$TARGET_DIR/LocalMusicPlayer.app"
ZIP_PATH="$ROOT_DIR/dist/LocalMusicPlayer-mac-arm64.zip"

bash "$ROOT_DIR/scripts/package-mac.sh"

rm -f "$ZIP_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ZIP_PATH"

mkdir -p "$TARGET_DIR"
rm -rf "$TARGET_APP"
cp -R "$APP_BUNDLE" "$TARGET_APP"

touch "$TARGET_APP"
echo "Installed: $TARGET_APP"
echo "Release archive: $ZIP_PATH"
