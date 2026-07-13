#!/bin/sh
set -eu

: "${PORT:=9130}"
: "${HERMES_INTERNAL_PORT:=8000}"
export PORT HERMES_INTERNAL_PORT

cd /opt/hermes-companion
/usr/local/bin/node apps/bridge/dist/server.js &
bridge_pid=$!

terminate() {
  kill -TERM "$bridge_pid" 2>/dev/null || true
}
trap terminate EXIT INT TERM

exec /init /opt/hermes/docker/main-wrapper.sh /bin/sh -c "/opt/hermes/.venv/bin/hermes serve --host 127.0.0.1 --port '$HERMES_INTERNAL_PORT'"
