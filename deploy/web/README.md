# Web app on the Oracle server

The server (Oracle Always Free ARM, shared with another project) runs these containers from `docker-compose.yml`
in `~/ashby-web`: `web` (the Next.js standalone image from `web/Dockerfile`), `db` (the jobs Postgres),
`cloudflared` (the tunnel connector) and `umami`/`umami-db` (analytics). No ports are published; Cloudflare
reaches `web:3000` and `db:5432` through the tunnel.

Files on the server (not in git):

- `.env` (mode 600): `TUNNEL_TOKEN` (the remotely-managed tunnel `ashby-web`) and `WEB_TAG` (the image tag
  `deploy.sh` last started).
- `web.env` (mode 600): the app's settings: `DATABASE_URL`, `DB_POOL_MAX`, `AUTH_SECRET`, `AUTH_URL`,
  `AUTH_TRUST_HOST`, `AUTH_GOOGLE_ID/SECRET`, `AUTH_GITHUB_ID/SECRET`, `EMAIL_*`. Changing it needs
  `docker compose up -d --force-recreate web`. `DATABASE_URL` is `postgres://<user>:<password>@db:5432/<db>`.
- `db.env` (mode 600): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, the same values the scraper
  server's `.env` uses.
- `deploy.sh`: copied from this folder. It is the only command the GitHub Actions deploy key may run
  (`restrict,command=...` in `~/.ssh/authorized_keys`). It pulls the new tag before recording it in
  `.env`, keeps only the new and previous image tags, and rolls back unless the new image is the one running,
  reports healthy and answers `https://jobs.whatrunsindia.com/api/health` (which runs `SELECT 1`) through Cloudflare.
  After a rollback it waits for the previous image the same way and says whether that worked.

`deploy.sh` and `docker-compose.yml` are copied to the server by hand when they change: the deploy key
can only run `deploy.sh`, so it can't update either file (on purpose). Ship the image first when a change
depends on new app code (like a healthcheck route), then copy the files and run `docker compose up -d`.

Cloudflare (zone whatrunsindia.com, host `jobs`): a proxied CNAME to `<tunnel-id>.cfargotunnel.com`, the tunnel's
ingress `jobs.whatrunsindia.com -> http://web:3000`, Cache Rules for the public pages and `/api/jobs` (they honour
the app's `Cache-Control`), and a custom firewall rule blocking AI/SEO crawlers on `/jobs/`.

Trust boundaries (checked on the server 2026-10-15): nothing listens on a host port (`web` exposes 3000 only on
the compose network), so the tunnel is the only way in, and its ingress routes nothing but `jobs` (everything else
gets 404). That is why the app may trust `cf-connecting-ip` (lib/rate-limit.ts) and why `AUTH_URL` pins the sign-in
host to `https://jobs.whatrunsindia.com` whatever `Host` a request claims. The deploy key's `authorized_keys` line is
`restrict,command="…/deploy.sh"`, so it can't open a shell, forward ports or run anything else.

Database access from outside: the tunnel route `db.whatrunsindia.com -> tcp://db:5432` sits behind the Access
app `jobs-db`, whose only policy is Service Auth for the service token `jobs-db`. Clients run
`cloudflared access tcp --hostname db.whatrunsindia.com --url 127.0.0.1:5432` with
`TUNNEL_SERVICE_TOKEN_ID/SECRET` set: the scraper server (its `db` service), and `deploy-web.yml` and
`discover.yml` (GitHub secrets `CF_ACCESS_CLIENT_ID/SECRET`, `DATABASE_URL` pointing at `127.0.0.1:5432`).
Checked 2026-10-22: no token gets 403, a wrong one 401.

## Moving the database here (one-time, measured at ~10 min of no writes)

1. Here: write `db.env`, copy this folder's `docker-compose.yml` over, `docker compose up -d db`.
2. Scraper server: add `CF_ACCESS_CLIENT_ID/SECRET` to `~/app/.env`. Stop the scraper
   (`docker compose stop scraper`) and make the old DB read-only
   (`ALTER DATABASE <db> SET default_transaction_read_only = on`, then terminate the other sessions),
   so the site keeps serving reads while nothing can write.
3. Dump there (`pg_dump -Fc`, ~5.5 min), copy it here, `pg_restore --clean --if-exists` into `db` (~70 s).
   Compare row counts of `jobs`, `users`, `companies`, `user_job_status`.
4. Here: set `DATABASE_URL` in `web.env` to `@db:5432`, `docker compose up -d --force-recreate web`, check
   `/api/health`. GitHub: set the `DATABASE_URL` secret to `postgres://<user>:<password>@127.0.0.1:5432/<db>`.
5. Scraper server: `git pull`, `docker compose up -d` (its `db` becomes the forwarder, the old Postgres
   container goes, its volume `app_db_data` stays as the rollback copy). Check a scrape run completes.
6. Backups: `deploy/db/backup.sh` + `mail.env` + cron move here; the `backup-copy` ssh key goes in, restricted to
   `rrsync -wo -no-del ~/db-backups/offsite` on the scraper server, which gets `deploy/db/offsite-keep.sh`
   on cron (moves copies out of the key's reach, keeps 8 days). Remove the old backup cron line there.
7. A few days later, if nothing needed the old copy: `docker volume rm app_db_data` there.

Rollback (before step 7): on the scraper server `git checkout <previous commit> -- docker-compose.yml`,
`docker compose up -d`, `ALTER DATABASE <db> SET default_transaction_read_only = off`; point `web.env` and the
GitHub `DATABASE_URL` secret back at it. Writes made on the new DB since the move are lost unless dumped first.

Deploys: `.github/workflows/deploy-web.yml` on every push to `main`. By hand: `ssh <key> ubuntu@<server> <image-tag>`
with a token that can read the GHCR package on stdin.
