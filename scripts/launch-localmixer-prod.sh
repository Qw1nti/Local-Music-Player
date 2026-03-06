#!/bin/zsh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="4173"
URL="http://127.0.0.1:${PORT}"
PID_FILE="/tmp/localmixer-preview.pid"
LOG_FILE="/tmp/localmixer-preview.log"

cd "$APP_DIR"

if [ ! -d node_modules ]; then
  echo "node_modules not found. Run 'npm install' first." >&2
  exit 1
fi

# Always build so each launch reflects latest code.
npm run build

# Stop existing managed preview process.
if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE" || true)"
  if [ -n "${EXISTING_PID}" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    kill "$EXISTING_PID" 2>/dev/null || true
    sleep 0.4
  fi
  rm -f "$PID_FILE"
fi

# Stop anything else listening on the target port.
EXISTING_PORT_PIDS="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$EXISTING_PORT_PIDS" ]; then
  echo "$EXISTING_PORT_PIDS" | xargs kill 2>/dev/null || true
  sleep 0.4
fi

nohup npm run preview:local > "$LOG_FILE" 2>&1 &
PREVIEW_PID=$!
echo "$PREVIEW_PID" > "$PID_FILE"

READY=0
for _ in {1..120}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.25
done

if [ "$READY" -ne 1 ]; then
  echo "Preview server failed to start. Check $LOG_FILE" >&2
  exit 1
fi

open -na "Google Chrome" --args --app="$URL"

echo "Local Mixer launched at $URL"
echo "Preview log: $LOG_FILE"
