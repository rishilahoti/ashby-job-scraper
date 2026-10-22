#!/usr/bin/env bash
# On the scraper server, from cron after the web server's 02:00 UTC backup has landed:
#   30 3 * * * ~/db-backups/offsite-keep.sh >> ~/db-backups/offsite-keep.log 2>&1
# The web server can only write into offsite/ (rrsync -wo -no-del), so nothing it sends is trusted:
# only today's dump, as a regular file, is moved out of its reach into kept/, under a name and
# timestamp set here (so it can't pre-empt, replace or backdate a kept copy). Anything else is
# removed. rsync's in-progress .temp files are left alone. Keeps 8 days.
set -euo pipefail
cd ~/db-backups
mkdir -p kept
today="offsite/jobs-$(date -u +%F).dump"
for f in offsite/*; do
  [ -e "$f" ] || [ -L "$f" ] || continue
  if [ "$f" = "$today" ] && [ -f "$f" ] && [ ! -L "$f" ]; then
    dest="kept/$(date -u +%Y%m%dT%H%M%SZ)-${f#offsite/}"
    mv -n -- "$f" "$dest"
    touch -- "$dest"
  else
    echo "$(date -u +%FT%TZ) removed unexpected $f"
    rm -rf -- "$f"
  fi
done
find kept -type f -name '*-jobs-*.dump' -mtime +8 -delete
