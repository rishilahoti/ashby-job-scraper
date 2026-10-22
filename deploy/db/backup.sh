#!/usr/bin/env bash
# Nightly pg_dump of the jobs DB, keeps the newest 7 here and on the scraper server. Runs from
# cron on the web server, where the DB lives (deploy/web/docker-compose.yml):
#   0 2 * * * ~/db-backups/backup.sh >> ~/db-backups/backup.log 2>&1
# Copied there by hand (like deploy/web/deploy.sh). Dumps through the db container, so no
# DB password is needed or stored. Restore: pg_restore -U <user> -d <db> --clean jobs-<date>.dump
# A failed run emails EMAIL_FROM through the site's SMTP: mail.env next to this script
# holds the EMAIL_* lines from web.env (chmod 600).
# The copy goes over ssh as host "backup-copy" (~/.ssh/config); on the scraper server that key
# is restricted to `rrsync ~/db-backups/offsite` in authorized_keys, so it can only write there
# (not ~/db-backups itself: --delete would remove the dumps made there before the move).
set -euo pipefail
umask 077
cd "$(dirname "$0")"

alert() {
  echo "$(date -u +%FT%TZ) FAILED"
  . ./mail.env
  printf 'From: %s\r\nTo: %s\r\nSubject: DB backup failed\r\n\r\n%s\r\n' "$EMAIL_FROM" "$EMAIL_FROM" \
    "Last night's backup on the DB server failed. See ~/db-backups/backup.log." |
    # The password goes in as a config file, not an argument: ps shows arguments.
    curl -sS --ssl-reqd --url "smtp://$EMAIL_SERVER_HOST:$EMAIL_SERVER_PORT" \
      -K <(printf 'user = "%s:%s"\n' "$EMAIL_SERVER_USER" "$EMAIL_SERVER_PASSWORD") \
      --mail-from "$EMAIL_FROM" --mail-rcpt "$EMAIL_FROM" -T -
}

# Its own temp file per run, so a manual run can't overlap the cron one's. Not
# *.dump, so a partial one never counts toward the 7; the trap removes it.
tmp=$(mktemp jobs.XXXXXX)
trap 'rc=$?; rm -f "$tmp"; [ "$rc" = 0 ] || alert' EXIT

out="jobs-$(date -u +%F).dump"
# -Fc: compressed, and pg_restore can pull out a single table (e.g. after a bad UPDATE on jobs).
docker compose -f ~/ashby-web/docker-compose.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp"
mv "$tmp" "$out"
ls -1t jobs-*.dump | tail -n +8 | xargs -r rm --
# Off the box: losing this server's disk would otherwise take the DB and its dumps together.
rsync -a --delete --include='jobs-*.dump' --exclude='*' ./ backup-copy:
echo "$(date -u +%FT%TZ) ok $out $(du -h "$out" | cut -f1)"
