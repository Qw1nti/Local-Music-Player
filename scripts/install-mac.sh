#!/usr/bin/env bash
set -euo pipefail

APP_NAME="LocalMusicPlayer"
TARGET_DIR="$HOME/Applications"
TARGET_APP="$TARGET_DIR/$APP_NAME.app"
TMP_DIR="$(mktemp -d /tmp/${APP_NAME}.install.XXXXXX)"
ZIP_PATH="$TMP_DIR/${APP_NAME}-mac-arm64.zip"
DOWNLOAD_URL="${DOWNLOAD_URL:-https://github.com/Qw1nti/Local-Music-Player/releases/latest/download/LocalMusicPlayer-mac-arm64.zip}"
SOURCE_URL="${SOURCE_URL:-https://github.com/Qw1nti/Local-Music-Player/archive/refs/heads/main.zip}"
SOURCE_ZIP="${1:-}"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ -n "$SOURCE_ZIP" ]]; then
  if [[ ! -f "$SOURCE_ZIP" ]]; then
    echo "Local zip not found: $SOURCE_ZIP" >&2
    exit 1
  fi
  cp "$SOURCE_ZIP" "$ZIP_PATH"
else
  echo "Downloading latest release from GitHub..."
  if ! curl -fL "$DOWNLOAD_URL" -o "$ZIP_PATH"; then
    echo "Release archive not available yet; building from source instead."
    BUILD_DIR="$TMP_DIR/source"
    mkdir -p "$BUILD_DIR"
    curl -fL "$SOURCE_URL" -o "$TMP_DIR/source.zip"
    ditto -x -k "$TMP_DIR/source.zip" "$BUILD_DIR"
    SOURCE_ROOT="$(find "$BUILD_DIR" -maxdepth 1 -type d -name 'Local-Music-Player-*' | head -n 1)"
    if [[ -z "${SOURCE_ROOT:-}" ]]; then
      echo "Could not unpack source archive from $SOURCE_URL" >&2
      exit 1
    fi
    if [[ ! -f "$SOURCE_ROOT/package.json" ]]; then
      echo "Source archive is missing package.json at: $SOURCE_ROOT" >&2
      exit 1
    fi
    pushd "$SOURCE_ROOT" >/dev/null
    npm install
    npm run release:mac
    popd >/dev/null
    exit 0
  fi
fi

rm -rf "$TMP_DIR/app"
mkdir -p "$TMP_DIR/app"
ditto -x -k "$ZIP_PATH" "$TMP_DIR/app"

APP_BUNDLE="$(find "$TMP_DIR/app" -maxdepth 1 -name "*.app" -type d | head -n 1)"
if [[ -z "${APP_BUNDLE:-}" ]]; then
  echo "Could not find an .app bundle in the downloaded archive." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
rm -rf "$TARGET_APP"
cp -R "$APP_BUNDLE" "$TARGET_APP"

xattr -cr "$TARGET_APP" >/dev/null 2>&1 || true
codesign --force --deep --sign - "$TARGET_APP" >/dev/null 2>&1 || true

touch "$TARGET_APP"

echo "Installed: $TARGET_APP"
