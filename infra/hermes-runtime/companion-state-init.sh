#!/command/with-contenv sh
set -eu

# The Railway volume replaces the directory created while the image is built.
# Older Companion deployments started the bridge as root, so the persisted
# state can be root-owned even though the upstream Hermes wrapper correctly
# drops the runtime to the `hermes` user. Repair ownership before that drop and
# preserve every existing state file in place.
state_dir=/opt/data/hermes-companion

if [ "${BRIDGE_STATE_DIR:-$state_dir}" != "$state_dir" ]; then
  echo "[companion] BRIDGE_STATE_DIR must remain $state_dir in the lean runtime." >&2
  exit 1
fi

install -d -o hermes -g hermes -m 0700 "$state_dir"
chown -R hermes:hermes "$state_dir"
find "$state_dir" -xdev -type d -exec chmod 0700 {} +
find "$state_dir" -xdev -type f -exec chmod 0600 {} +
