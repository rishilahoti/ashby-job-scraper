#!/bin/sh
# One-off: copies data from the existing Neon DB into the self-hosted Postgres
# container. Run once, from the VM, after `docker compose up -d db`.
#
# Usage: NEON_URL="postgres://..." ./scripts/migrate-from-neon.sh

set -e

if [ -z "$NEON_URL" ]; then
  echo "Set NEON_URL to the source Neon connection string first." >&2
  exit 1
fi

: "${POSTGRES_USER:?POSTGRES_USER not set (source .env first)}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"
: "${POSTGRES_DB:?POSTGRES_DB not set}"

LOCAL_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}"
NETWORK="$(basename "$(pwd)")_default"

docker run --rm --network "$NETWORK" \
  -e NEON_URL="$NEON_URL" -e LOCAL_URL="$LOCAL_URL" \
  postgres:16-alpine \
  sh -c 'pg_dump --no-owner --no-privileges "$NEON_URL" | psql "$LOCAL_URL"'

echo "Migration done."
