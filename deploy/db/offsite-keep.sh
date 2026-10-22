#!/usr/bin/env bash
# On the scraper server, from cron after the web server's 02:00 backup has landed:
#   30 3 * * * ~/db-backups/offsite-keep.sh >> ~/db-backups/offsite-keep.log 2>&1
# The web server can only write into offsite/ (rrsync -wo -no-del), so a dump is moved out of
# its reach into kept/, stamped with the time it arrived here (not the sender's mtime), and never
# overwrites a copy already kept. Keeps 8 days.
set -euo pipefail
cd ~/db-backups
mkdir -p kept
for f in offsite/jobs-*.dump; do
  [ -e "$f" ] || continue
  touch "$f"
  mv -n "$f" kept/
  [ ! -e "$f" ] || { echo "$(date -u +%FT%TZ) already kept, left in offsite/: $f"; }
done
find kept -name 'jobs-*.dump' -mtime +8 -delete
