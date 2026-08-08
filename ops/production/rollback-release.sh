#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
export PATH="/opt/love-node/bin:/usr/local/bin:/usr/bin:/bin"

readonly CURRENT_LINK="/var/www/love-current"
readonly STATE_DIR="/var/lib/love-deploy"
readonly ECOSYSTEM="/etc/love/ecosystem.config.cjs"
readonly PM2_BIN="/usr/local/bin/pm2"

[[ "${EUID:-$(id -u)}" == 0 ]] || { echo 'must run as root' >&2; exit 1; }
[[ -f "$STATE_DIR/previous-release" ]] || { echo 'no previous release recorded' >&2; exit 1; }

target="$(cat "$STATE_DIR/previous-release")"
[[ "$target" == /var/www/love-* && -d "$target/server" ]] || {
  echo "unsafe rollback target: $target" >&2
  exit 1
}

current="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
ln -sfn "$target" "$CURRENT_LINK"
if "$PM2_BIN" describe love-backend 2>/dev/null | grep -Fq '/var/www/love-current/server/index.js'; then
  "$PM2_BIN" startOrReload "$ECOSYSTEM" --env production --update-env
else
  "$PM2_BIN" delete love-backend >/dev/null 2>&1 || true
  "$PM2_BIN" start "$ECOSYSTEM" --env production --update-env
fi

for _ in {1..30}; do
  if curl --fail --silent http://127.0.0.1:5555/api/health >/dev/null; then
    printf '%s\n' "$target" > "$STATE_DIR/current-release"
    [[ -z "$current" ]] || printf '%s\n' "$current" > "$STATE_DIR/previous-release"
    "$PM2_BIN" save
    echo "rolled back to $target"
    exit 0
  fi
  sleep 1
done

echo 'rollback target did not become healthy' >&2
exit 1
