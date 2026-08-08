# Love Admin: rollout and rollback

## Before production

1. Run `npm run admin:backup` and store the resulting directory outside the repository.
2. Run `npm run admin:migrate:dry` and review every proposed role and Report-to-Case migration.
3. Generate independent secrets for `JWT_SECRET` and `ADMIN_2FA_ENCRYPTION_KEY` with at least 32 random bytes each.
4. Set exact `ALLOWED_ORIGINS` and `ADMIN_ORIGINS`. Do not use wildcards.
5. Keep `ADMIN_ALLOW_NO_ORIGIN=false`, serve the admin only over HTTPS, and restrict the admin hostname at the reverse proxy or VPN when possible.
6. Run `npm run admin:migrate`, then `npm run admin:indexes`.
7. Run server tests, admin tests, lint, build and Playwright before enabling traffic.

## Feature flags

- `FEATURE_ADMIN_V1` controls the dedicated admin API.
- `FEATURE_CASES_V1` controls the unified user case API.
- `FEATURE_COMMUNITY_V1` controls ideas, bugs and Dev Log.
- `FEATURE_ANALYTICS_V1` controls the five-minute analytics collector.

All flags default to `true` for local development. Set a flag to `false` and restart the server to disable its module. New collections and migrated Report records are retained; rollback does not delete data.

## Emergency response

1. Set `FEATURE_ADMIN_V1=false` and restart the backend.
2. Revoke all admin sessions by deleting the `adminsessions` collection or using the infrastructure action from a trusted session before disabling the flag.
3. Rotate `JWT_SECRET`, `ADMIN_2FA_ENCRYPTION_KEY`, mail credentials and database credentials if compromise is suspected.
4. Preserve AuditLog, ModerationAction, LoginLog and reverse-proxy logs for investigation.
5. Restore application data only from the pre-migration backup if database integrity is affected. Feature rollback by itself needs no restore.

## Security boundary

The backend enforces rank checks, 2FA, CSRF, origin validation, session expiry and moderation restrictions. UI visibility is never treated as authorization. Production should additionally use TLS, a managed firewall/WAF, database network allowlists, encrypted backups and monitoring alerts.

## Production deployment

The production host is bootstrapped once with `ops/production/bootstrap-host.sh`. It installs the verified Node 22 runtime, creates the restricted `love-deploy` account, disables password/TTY/tunnel access for that account, and grants only these commands through `sudo`:

- `/usr/local/sbin/love-deploy-release`
- `/usr/local/sbin/love-rollback-release`

GitHub Actions must use `SSH_USERNAME=love-deploy`. Store the exact server host-key line in the protected `SSH_KNOWN_HOSTS` secret; do not replace it with `ssh-keyscan` inside the workflow. Protect the `production` environment with required reviewers before enabling automatic pushes from `main`.

Each release is uploaded to `/var/www/love-staging` with a SHA-256 checksum. The server rejects unsafe archive paths and embedded links, installs only `server/package-lock.json` dependencies with lifecycle scripts disabled, runs the dependency audit and server tests, creates a MongoDB EJSON backup, performs the migration dry-run, and starts a temporary smoke instance on port `5556`. PM2 is switched through `/var/www/love-current` only after all checks pass.

The previous application remains available at the path recorded in `/var/lib/love-deploy/previous-release`. To roll back application code without deleting additive migration data, run:

```bash
sudo /usr/local/sbin/love-rollback-release
```

Backups are stored under `/var/backups/love/<UTC timestamp>` with mode `0700`. Keep an encrypted off-host copy before destructive database maintenance.
