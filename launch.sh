#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "[Local Music Player] Starting one-click launcher..."

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found."
  echo "Install Node.js LTS from: https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm was not found."
  echo "Reinstall Node.js LTS from: https://nodejs.org/"
  exit 1
fi

if ! node "./scripts/one-click-launch.mjs"; then
  echo "[ERROR] Launch failed. See messages above."
  exit 1
fi

echo "[Local Music Player] Launch complete."

