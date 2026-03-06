#!/bin/zsh
set -euo pipefail

PORT="4173"
PID_FILE="/tmp/localmixer-preview.pid"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" || true)"
  if [ -n "${PID}" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 0.4
  fi
  rm -f "$PID_FILE"
fi

PORT_PIDS="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
  echo "$PORT_PIDS" | xargs kill 2>/dev/null || true
fi

echo "Stopped Local Mixer preview server (port $PORT)."
