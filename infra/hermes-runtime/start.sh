#!/bin/sh
set -eu

: "${PORT:=9130}"
: "${HERMES_INTERNAL_PORT:=8000}"
: "${HERMES_INTERNAL_HOST:=0.0.0.0}"
export PORT HERMES_INTERNAL_PORT HERMES_INTERNAL_HOST

cd /opt/hermes-companion
/usr/local/bin/node apps/bridge/dist/server.js &
bridge_pid=$!

terminate() {
  kill -TERM "$bridge_pid" 2>/dev/null || true
}
trap terminate EXIT INT TERM

exec /opt/hermes/.venv/bin/hermes serve --host "$HERMES_INTERNAL_HOST" --port "$HERMES_INTERNAL_PORT"
