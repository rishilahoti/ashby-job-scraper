#!/usr/bin/env bash
# Nightly pg_dump of the jobs DB, keeps the newest 7. Runs from cron on the DB server:
#   0 2 * * * ~/db-backups/backup.sh >> ~/db-backups/backup.log 2>&1
# Copied there by hand (like deploy/web/deploy.sh). Dumps through the db container, so no
# password is needed or stored. Restore: pg_restore -U <user> -d <db> --clean jobs-<date>.dump
set -euo pipefail
umask 077
cd "$(dirname "$0")"

out="jobs-$(date -u +%F).dump"
# -Fc: compressed, and pg_restore can pull out a single table (e.g. after a bad UPDATE on jobs).
docker compose -f ~/app/docker-compose.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$out.tmp"
mv "$out.tmp" "$out"
ls -1t jobs-*.dump | tail -n +8 | xargs -r rm --
echo "$(date -u +%FT%TZ) ok $out $(du -h "$out" | cut -f1)"
