#!/bin/zsh
set -euo pipefail

PID_FILE="/tmp/localmixer-preview.pid"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" || true)"
  if [ -n "${PID}" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 0.4
  fi
  rm -f "$PID_FILE"
fi

echo "Stopped Local Mixer managed preview server."
