#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
readonly NODE_VERSION="v22.22.2"
readonly NODE_ARCHIVE="node-${NODE_VERSION}-linux-x64.tar.xz"
readonly NODE_BASE_URL="https://nodejs.org/dist/${NODE_VERSION}"
readonly DEPLOY_USER="love-deploy"
readonly SOURCE_ROOT="${1:-/var/www/love-app}"

[[ "${EUID:-$(id -u)}" == 0 ]] || { echo 'must run as root' >&2; exit 1; }
[[ -n "${DEPLOY_PUBLIC_KEY:-}" ]] || {
  echo 'set DEPLOY_PUBLIC_KEY to the complete ssh-ed25519 public key' >&2
  exit 1
}

if [[ ! -x /opt/love-node/bin/node ]]; then
  work_dir="$(mktemp -d)"
  trap 'rm -rf "$work_dir"' EXIT
  curl --fail --silent --show-error --location "$NODE_BASE_URL/$NODE_ARCHIVE" --output "$work_dir/$NODE_ARCHIVE"
  curl --fail --silent --show-error --location "$NODE_BASE_URL/SHASUMS256.txt" --output "$work_dir/SHASUMS256.txt"
  (cd "$work_dir" && grep "  $NODE_ARCHIVE\$" SHASUMS256.txt | sha256sum --check --strict -)
  tar --extract --xz --file "$work_dir/$NODE_ARCHIVE" --directory /opt
  ln -sfn "/opt/node-${NODE_VERSION}-linux-x64" /opt/love-node
fi

id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
passwd --lock "$DEPLOY_USER" >/dev/null
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
printf '%s %s\n' \
  'no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding' \
  "$DEPLOY_PUBLIC_KEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 0600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /var/www/love-staging
install -d -m 0750 -o root -g root /var/www/love-releases
install -d -m 0700 -o root -g root /var/backups/love /var/lib/love-deploy /etc/love

if [[ ! -f /etc/love/production.env ]]; then
  install -m 0600 -o root -g root /var/www/love-app/.env /etc/love/production.env
fi

[[ -e /var/www/love-current ]] || ln -s /var/www/love-app /var/www/love-current
install -m 0755 -o root -g root "$SOURCE_ROOT/ops/production/deploy-release.sh" /usr/local/sbin/love-deploy-release
install -m 0755 -o root -g root "$SOURCE_ROOT/ops/production/rollback-release.sh" /usr/local/sbin/love-rollback-release
install -m 0644 -o root -g root "$SOURCE_ROOT/ops/production/ecosystem.config.cjs" /etc/love/ecosystem.config.cjs

cat > /etc/sudoers.d/love-deploy <<'EOF'
love-deploy ALL=(root) NOPASSWD: /usr/local/sbin/love-deploy-release
love-deploy ALL=(root) NOPASSWD: /usr/local/sbin/love-rollback-release
EOF
chmod 0440 /etc/sudoers.d/love-deploy
visudo -cf /etc/sudoers.d/love-deploy

install -d -m 0755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/60-love-deploy.conf <<'EOF'
Match User love-deploy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitTTY no
    AllowTcpForwarding no
    PermitTunnel no
    X11Forwarding no
EOF
chmod 0644 /etc/ssh/sshd_config.d/60-love-deploy.conf
sshd -t
if systemctl is-active --quiet ssh; then
  systemctl reload ssh
elif systemctl is-active --quiet sshd; then
  systemctl reload sshd
fi

/opt/love-node/bin/node --version
echo 'Love production host bootstrap complete.'
