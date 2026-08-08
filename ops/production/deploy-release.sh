#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
export PATH="/opt/love-node/bin:/usr/local/bin:/usr/bin:/bin"

readonly STAGING_DIR="/var/www/love-staging"
readonly ARCHIVE="$STAGING_DIR/love-release.tgz"
readonly CHECKSUM="$STAGING_DIR/love-release.tgz.sha256"
readonly RELEASES_DIR="/var/www/love-releases"
readonly CURRENT_LINK="/var/www/love-current"
readonly LEGACY_RELEASE="/var/www/love-app"
readonly ENV_FILE="/etc/love/production.env"
readonly BACKUP_ROOT="/var/backups/love"
readonly STATE_DIR="/var/lib/love-deploy"
readonly NODE_BIN="/opt/love-node/bin/node"
readonly NPM_BIN="/opt/love-node/bin/npm"
readonly PM2_BIN="/usr/local/bin/pm2"
readonly ECOSYSTEM="/etc/love/ecosystem.config.cjs"

release_dir=""
smoke_pid=""
previous_release=""
switched=0

log() {
  printf '[love-deploy] %s\n' "$*"
}

activate_pm2() {
  if "$PM2_BIN" describe love-backend 2>/dev/null | grep -Fq '/var/www/love-current/server/index.js'; then
    "$PM2_BIN" startOrReload "$ECOSYSTEM" --env production --update-env
    return
  fi

  "$PM2_BIN" delete love-backend >/dev/null 2>&1 || true
  "$PM2_BIN" start "$ECOSYSTEM" --env production --update-env
}

stop_smoke() {
  if [[ -n "$smoke_pid" ]] && kill -0 "$smoke_pid" 2>/dev/null; then
    kill "$smoke_pid" 2>/dev/null || true
    wait "$smoke_pid" 2>/dev/null || true
  fi
  smoke_pid=""
}

rollback_on_error() {
  local status=$?
  stop_smoke
  if [[ "$switched" == 1 && -n "$previous_release" && -d "$previous_release" ]]; then
    log "health check failed; restoring $previous_release"
    ln -sfn "$previous_release" "$CURRENT_LINK"
    activate_pm2 || true
  fi
  log "deployment failed with status $status"
  exit "$status"
}

trap rollback_on_error ERR INT TERM
trap stop_smoke EXIT

[[ "${EUID:-$(id -u)}" == 0 ]] || { log 'must run as root'; exit 1; }
[[ -x "$NODE_BIN" && -x "$NPM_BIN" ]] || { log 'Node 22 runtime is missing'; exit 1; }
[[ -x "$PM2_BIN" ]] || { log 'PM2 is missing'; exit 1; }
[[ -f "$ARCHIVE" && -f "$CHECKSUM" ]] || { log 'staged release is incomplete'; exit 1; }
[[ -f "$ENV_FILE" ]] || { log 'production environment file is missing'; exit 1; }

archive_owner="$(stat -c '%U' "$ARCHIVE")"
[[ "$archive_owner" == 'love-deploy' || "$archive_owner" == 'root' ]] || {
  log "unexpected archive owner: $archive_owner"
  exit 1
}

cd "$STAGING_DIR"
sha256sum --check "$(basename "$CHECKSUM")"

while IFS= read -r entry; do
  [[ "$entry" != /* ]] || { log "absolute archive path rejected: $entry"; exit 1; }
  [[ ! "$entry" =~ (^|/)\.\.(/|$) ]] || { log "archive traversal rejected: $entry"; exit 1; }
  [[ "$entry" != *'.env' ]] || { log "secret-like file rejected: $entry"; exit 1; }
done < <(tar -tzf "$ARCHIVE")

if tar -tvzf "$ARCHIVE" | awk '{print $1}' | grep -Eq '^[lh]'; then
  log 'archives containing links are rejected'
  exit 1
fi

release_id="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="$RELEASES_DIR/$release_id"
install -d -m 0750 "$release_dir"
tar --extract --gzip --file "$ARCHIVE" --directory "$release_dir" --no-same-owner --no-same-permissions

for required in package.json release-manifest.json server/index.js server/package.json server/package-lock.json; do
  [[ -f "$release_dir/$required" ]] || { log "required file missing: $required"; exit 1; }
done

git_sha="$($NODE_BIN -e "const m=require(process.argv[1]); const s=String(m.gitSha||''); if(!/^[a-f0-9]{40}$/.test(s)) process.exit(1); process.stdout.write(s)" "$release_dir/release-manifest.json")"
log "preparing $git_sha in $release_dir"

ln -s "$ENV_FILE" "$release_dir/.env"
ln -s "$ENV_FILE" "$release_dir/server/.env"
for media_dir in uploads private-uploads temp; do
  install -d -m 0750 "$LEGACY_RELEASE/server/$media_dir"
  ln -s "$LEGACY_RELEASE/server/$media_dir" "$release_dir/server/$media_dir"
done

cd "$release_dir/server"
"$NPM_BIN" ci --omit=dev --ignore-scripts --no-audit
"$NPM_BIN" audit --omit=dev --audit-level=high
"$NPM_BIN" test
NODE_ENV=production "$NODE_BIN" -r dotenv/config -e "require('./config/security').assertProductionSecurity()"

backup_dir="$BACKUP_ROOT/$release_id"
install -d -m 0700 "$backup_dir"
printf '%s\n' "$git_sha" > "$backup_dir/candidate-git-sha.txt"
readlink -f "$CURRENT_LINK" > "$backup_dir/previous-release.txt" 2>/dev/null || printf '%s\n' "$LEGACY_RELEASE" > "$backup_dir/previous-release.txt"
"$NODE_BIN" scripts/backup-admin-v1.js "$backup_dir/database" > "$backup_dir/database-backup.log"
"$PM2_BIN" describe love-backend > "$backup_dir/pm2-before.txt" 2>&1 || true

"$NODE_BIN" scripts/migrate-admin-v1.js > "$backup_dir/migration-dry-run.json"

smoke_log="$backup_dir/candidate-smoke.log"
NODE_ENV=production PORT=5556 "$NODE_BIN" index.js > "$smoke_log" 2>&1 &
smoke_pid=$!
for _ in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:5556/api/health > "$backup_dir/health-candidate.json"; then
    break
  fi
  sleep 1
done
curl --fail --silent --show-error http://127.0.0.1:5556/api/health > "$backup_dir/health-candidate.json"
curl --fail --silent --show-error http://127.0.0.1:5556/api/community/devlog > "$backup_dir/devlog-smoke.json"
curl --fail --silent --show-error http://127.0.0.1:5556/api/community/ideas/top > "$backup_dir/ideas-smoke.json"
cases_status="$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:5556/api/cases/mine)"
[[ "$cases_status" == 401 ]] || { log "unexpected unauthenticated cases status: $cases_status"; exit 1; }
stop_smoke

"$NODE_BIN" scripts/migrate-admin-v1.js --apply > "$backup_dir/migration-apply.log"
"$NODE_BIN" scripts/ensure-retention-indexes.js > "$backup_dir/indexes.log"

previous_release="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
[[ -n "$previous_release" ]] || previous_release="$LEGACY_RELEASE"
printf '%s\n' "$previous_release" > "$STATE_DIR/previous-release"
printf '%s\n' "$release_dir" > "$STATE_DIR/pending-release"

ln -sfn "$release_dir" "$CURRENT_LINK"
switched=1
activate_pm2

for _ in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:5555/api/health > "$backup_dir/health-live.json"; then
    switched=0
    break
  fi
  sleep 1
done
[[ "$switched" == 0 ]] || { log 'live health check timed out'; exit 1; }

printf '%s\n' "$release_dir" > "$STATE_DIR/current-release"
rm -f "$STATE_DIR/pending-release"
install -m 0755 -o root -g root "$release_dir/ops/production/deploy-release.sh" /usr/local/sbin/love-deploy-release
install -m 0755 -o root -g root "$release_dir/ops/production/rollback-release.sh" /usr/local/sbin/love-rollback-release
install -m 0644 -o root -g root "$release_dir/ops/production/ecosystem.config.cjs" /etc/love/ecosystem.config.cjs
"$PM2_BIN" save
rm -f "$ARCHIVE" "$CHECKSUM"
trap - ERR INT TERM
log "deployment complete: $git_sha"
