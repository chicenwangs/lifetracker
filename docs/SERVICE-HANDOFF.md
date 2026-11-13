# Life Tracker planner — service handoff (for the deploy / ops side)

You run this service. You do not need the source code or its history. Everything to deploy, operate, upgrade, roll back and recover it is here plus the files in `deploy/` (also attached to every GitHub Release).

Owner: Jeremy (`chicenwangs`). Target: Ubuntu homelab, Docker Compose, public at `https://planner.jeremyjosh.org` through a Cloudflare Tunnel. Learning goal: run it the way a company ops team would.

## 1. What it is

- Web app: personal calendar + day planner. Users sign up, plan their days, and can share a read-only view of their calendar with each other by swapping codes.
- One container (Node 22, SvelteKit server) + one SQLite file. No other database, no cache, no queue. **v2: one kind of outbound call** — Web Push to the browsers' push services over HTTPS 443 (`*.notify.windows.com`, `fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`), only when VAPID keys are set (D-23). Link previews stay off.
- Expected load: a handful of users. One replica only (SQLite = one writer). Do not scale horizontally.
- Second container `cloudflared` publishes it. No inbound ports on the router.

```
browser ──https──> Cloudflare edge ──tunnel──> cloudflared ──http:3000──> app ──> /app/data/app.db
```

## 2. Artifact

| | |
|---|---|
| Image | `ghcr.io/chicenwangs/lifetracker:<version>` (private package; `docker login ghcr.io` with a GitHub PAT that has `read:packages`) |
| Tags | `1.0.0` (exact, use this), `1.0` (moving minor), `sha-<short>` (exact commit). No `latest`. |
| Versioning | SemVer. PATCH = fixes, MINOR = features, MAJOR = breaking (read the release notes). |
| Release page | `github.com/chicenwangs/lifetracker/releases`: notes + this file + `deploy-vX.Y.Z.tar.gz` (flat: `compose.yaml`, `.env.example`, `tunnel.env.example`, `backup.sh`, `restore.sh`, this file). |
| How a release is made | Dev pushes tag `vX.Y.Z` → GitHub Actions runs lint, type check, unit + e2e tests → builds the image → pushes to GHCR → creates the Release. A red pipeline = no image. |
| Contents | Built app, prod `node_modules`, SQL migrations, `scripts/reset-password.mjs`. **No personal data, no secrets.** |

## 3. Runtime contract

| Item | Value |
|---|---|
| Port | 3000/tcp, HTTP only (TLS ends at Cloudflare) |
| User | `node` uid 1000. The data folder on the host must be owned by 1000:1000. |
| Filesystem | Read-only root in compose. Writable: `/app/data` (volume), `/tmp` (tmpfs). |
| State | `/app/data/app.db` (+ `-wal`, `-shm` while running). `/app/data/seed/` = optional Notion import input. `/app/data/backups/` = from `backup.sh`. **v2:** `/app/data/uploads/` = attached files (`<2 chars>/<key>`, temp files in `uploads/.tmp/`). Back it up with the DB. |
| Health | `GET /healthz` → `200 {"ok":true,"db":true,"version":"…","jobs":true,"reminderBacklog":0}`; 503 if the DB is unusable. A backlog that keeps growing = the runner is stuck (check logs for `[job]`). No auth. Image HEALTHCHECK every 30 s. |
| Start | Runs DB migrations on boot (forward only), then listens. Logs `[boot] v<version> db ready, origin=…, secureCookies=…, proxyHeader=…`. Bad env = exits with `Bad env:` lines, no partial start. |
| Stop | SIGTERM → finishes in-flight requests → closes DB (`[shutdown] db closed`). `init: true` in compose. |
| Logs | stdout/stderr, plain lines. Errors: `[error] <status> <method> <path>: <message>`. Never logs bodies, cookies, passwords or tokens. json-file driver, 10 MB × 3. |
| Timezone | `TZ=Asia/Kuala_Lumpur` (app also stores per-user tz). |

### Environment variables (`.env` next to `compose.yaml`, `chmod 600`)

| Var | Required | Example / rule |
|---|---|---|
| `APP_VERSION` | yes (compose) | `1.0.0`. The image tag. Change to upgrade/roll back. |
| `ORIGIN` | yes | `https://planner.jeremyjosh.org`. Must equal the browser URL exactly (scheme, host, port). No trailing slash. https → cookies get `Secure` + `__Host-` prefix. |
| `APP_SECRET` | yes | ≥ 32 chars, `openssl rand -base64 48`. HMAC key for share codes, invite codes, busy ids. Rotating it voids unused codes only (sessions and passwords survive). Store in a password manager. |
| `SETUP_TOKEN` | first run only | Random string, 20+ chars (shorter = app won't start). `/setup` (create admin) needs it. Sign-up stays closed until setup is done. Remove after setup + restart. |
| `ADDRESS_HEADER` | behind tunnel | `CF-Connecting-IP`. Real client IP for rate limits/lockout. With it set, any request **without** that header gets `400` (except `/healthz`). **Required** when `ORIGIN` is https (app refuses to start without it). Leave unset for a LAN test (http ORIGIN) without the tunnel. |
| `TUNNEL_TOKEN` | tunnel | From Cloudflare Zero Trust. Goes in **`tunnel.env`** (not `.env`), so only `cloudflared` gets it, never the app. |
| `CLOUDFLARED_VERSION` | tunnel | Dated tag, e.g. `2025.11.1`. Unset = `latest` (don't, in Stage C). |
| `TZ`, `PORT`, `HOST` | defaults ok | `Asia/Kuala_Lumpur`, `3000`, `0.0.0.0`. |
| `DATABASE_PATH`, `SEED_DIR` | set by compose | `/app/data/app.db`, `/app/data/seed`. Do not change. |
| `UPLOAD_DIR` | v2, optional | Empty = `/app/data/uploads`. Must be on the data volume (temp files are written inside it, so rename never crosses filesystems). |
| `MAX_UPLOAD_BYTES` | v2, optional | Default `26214400` (25 MB, D-12). Allowed types: png jpg gif webp pdf zip docx xlsx pptx doc xls ppt txt md csv. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | v2, optional | Both or neither (boot fails on one). Make once: `docker compose run --rm app npx web-push generate-vapid-keys`. Keep the private one in the password manager. Unset = push off; reminders still show inside the app. Changing them breaks every device's push until it re-subscribes. |
| `VAPID_SUBJECT` | with VAPID | `mailto:you@example.com` (push services contact this if something is wrong). |
| `JOBS_ENABLED` | v2, default `true` | In-process reminder runner. One replica only (two would double-send). |
| `REMINDER_POLL_INTERVAL_MS` | v2, default `30000` | How often due reminders are checked. |
| `BODY_SIZE_LIMIT` | set by the image | `26M` so uploads reach the app. The app itself refuses any other request body over 1 MB. Don't lower it below `MAX_UPLOAD_BYTES`. |

## 4. First deploy

Host prep (Ubuntu): Docker Engine + compose plugin, `sqlite3` (`apt install sqlite3`), a GitHub PAT with `read:packages`.

```bash
sudo mkdir -p /opt/life-tracker && sudo chown $USER /opt/life-tracker && cd /opt/life-tracker
gh release download vX.Y.Z -R chicenwangs/lifetracker -p 'deploy-*.tar.gz' && tar -xzf deploy-vX.Y.Z.tar.gz
cp .env.example .env && chmod 600 .env && nano .env      # APP_VERSION, ORIGIN, APP_SECRET, SETUP_TOKEN
cp tunnel.env.example tunnel.env && chmod 600 tunnel.env # TUNNEL_TOKEN (Stage C); compose needs the file to exist
mkdir -p data && sudo chown -R 1000:1000 data && sudo chmod 700 data
echo "$GHCR_PAT" | docker login ghcr.io -u chicenwangs --password-stdin
```

**Stage B, LAN smoke test (optional, before the tunnel):** in `.env` set `ORIGIN=http://<homelab-ip>:3000` and leave `ADDRESS_HEADER` empty; in `compose.yaml` uncomment `ports: "3000:3000"`. `docker compose up -d`, check `curl http://<ip>:3000/healthz`. Then undo both changes before Stage C. Do not create real accounts on the LAN URL if you will switch ORIGIN later (cookies are per origin; accounts are fine, sessions are not).

**Stage C, tunnel:**
1. Cloudflare: domain `jeremyjosh.org` on Cloudflare DNS. Zero Trust → Networks → Tunnels → Create (Cloudflared) → name `life-tracker` → copy token into `TUNNEL_TOKEN` in `tunnel.env`.
2. Public hostname: `planner.jeremyjosh.org` → `http://app:3000` (compose service name).
3. `.env`: `ORIGIN=https://planner.jeremyjosh.org`, `ADDRESS_HEADER=CF-Connecting-IP`, `CLOUDFLARED_VERSION=<dated tag>`. No published port.
4. `docker compose --profile tunnel up -d` → `docker compose ps` shows app `healthy`, cloudflared up.
5. Cloudflare: SSL/TLS "Full", "Always Use HTTPS" on. Optional WAF rate-limit rule on `/login` and `/signup` (e.g. 10 req/min per IP).

**First run of the app:**
1. Open `https://planner.jeremyjosh.org/setup` → enter `SETUP_TOKEN` → create admin `jeremy`. `/setup` returns 404 forever after.
2. Remove `SETUP_TOKEN` from `.env`, `docker compose up -d`.
3. Data, pick one:
   - **Move the existing DB from Jeremy's PC (keeps everything he did in dev):** stop the dev server, on the PC `sqlite3 app.db "PRAGMA wal_checkpoint(TRUNCATE)"`, copy `app.db` to `/opt/life-tracker/data/app.db`, `sudo chown 1000:1000 data/app.db`, `docker compose restart app`. (Do this instead of step 1–2; the copied DB already has the admin.)
   - **Fresh import from Notion:** copy the seed folder (has `_report.json`) to `data/seed/`, `chown -R 1000:1000 data/seed`, then in the app Settings → Import → Run import.
4. Settings → Users: sign-up is **Open** by default. Switch to **Invite only** once the intended users have accounts.

## 5. Operations

**Upgrade:** read the release notes → `sudo ./backup.sh` → set `APP_VERSION=X.Y.Z` in `.env` → `docker compose pull app && docker compose up -d app` → watch `docker compose logs -f app` for `[boot] vX.Y.Z` → `curl -s https://planner.jeremyjosh.org/healthz` shows the new version.

**v1.1.0 → v2.0.0 (one time, migration release):**
1. `sudo ./backup.sh` and copy `data/backups/app-<ts>.db.gz` off the box. This is the rollback point.
2. Unpack the v2.0.0 `deploy-v2.0.0.tar.gz` over `/opt/life-tracker` (new `backup.sh`/`restore.sh` also back up `data/uploads`). Keep your `.env`.
3. Optional new env (all can stay unset): `VAPID_*` for push, `UPLOAD_DIR`/`MAX_UPLOAD_BYTES`, `JOBS_ENABLED`, `REMINDER_POLL_INTERVAL_MS`. With VAPID keys: allow outbound 443 to the push services (§1).
4. `APP_VERSION=2.0.0` → pull + up. First boot runs migrations 0003–0008 (seconds), then `[boot] v2.0.0 db ready … jobs=true push=on|off`.
5. `/healthz` → `"version":"2.0.0"`, `"jobs":true`. Run §8 incl. the v2 lines.
6. Rollback: `APP_VERSION=1.1.0` **and** `sudo ./restore.sh <the backup from step 1>`. v1.1.0 cannot read the v2 schema.

**Roll back:** set `APP_VERSION` back → `docker compose up -d app`. If the newer release ran a DB migration (release notes say "migration"), the old version may not read the new schema: restore the backup taken before the upgrade (`sudo ./restore.sh data/backups/app-<ts>.db.gz`). Migrations are forward-only.

**Backup:** `backup.sh` = online SQLite backup + integrity check + gzip, **plus (v2) `uploads-<ts>.tar.gz` of `data/uploads` with the same timestamp**, keeps 14 days in `data/backups/`. Runs as root (`data/` is owned by uid 1000; the script refuses otherwise). Root cron (`sudo crontab -e`): `15 3 * * * /opt/life-tracker/backup.sh >> /var/log/life-tracker-backup.log 2>&1`. Set `LT_OFFSITE=/mnt/nas/life-tracker` (or another host via rsync) so one copy lives off the box.

**Restore (drill it monthly):** `sudo ./restore.sh data/backups/app-<ts>.db.gz` → checks integrity, stops app, keeps the current DB as `app.db.pre-restore-<ts>`, swaps (and, v2, swaps `data/uploads` from `uploads-<ts>.tar.gz` if present, old folder kept as `uploads.pre-restore-<ts>`), starts app. Then log in and check recent items.

**Locked-out user / forgot password:** `docker compose exec -it app node scripts/reset-password.mjs <username>` (asks for the new password twice, signs that user out everywhere). Login lockout itself clears after 15 minutes.

**Sign-ups:** Settings → Users → Open / Invite only (admin). Invite-only mode makes 7-day single-use invite codes there.

**Logs:** `docker compose logs --since 1h app`. Interesting lines: `[boot]`, `[shutdown]`, `[error]`. Failed logins are rate-limited in-app (not logged per attempt).

**Monitoring (suggested):** uptime check on `https://planner.jeremyjosh.org/healthz` expecting 200 + `"ok":true` (Uptime Kuma), disk usage of `/opt/life-tracker/data`, container restart count, backup job success line in `backup.log`.

## 6. Security notes

- Secrets live only in `.env` / `tunnel.env` (chmod 600) and the password manager. Never in git, images, or chat logs.
- No published port in Stage C. With `ADDRESS_HEADER` set, a request whose header is missing or not a single IP gets 400. A client that reaches the port directly **can** still fake a valid IP in that header and dodge per-IP limits, so the port must stay closed and nothing else should share the compose network.
- Container: non-root uid 1000, read-only rootfs, all capabilities dropped, `no-new-privileges`.
- App: argon2id passwords, HttpOnly + Secure + SameSite=Lax `__Host-` session cookie, CSP (`self` only), Origin check on every non-GET, X-Frame-Options DENY, login lockout (5 tries per user+IP, 30 per IP, 50 per username, all per 15 min; IPv6 counted per /64), password change limited to 5 wrong tries, open sign-up capped at 5 per IP and 20 overall per 15 min, 50k items/blocks and 20 open share codes per account, share and invite codes stored as HMAC only, shared calendars filtered server-side (hidden items reach other users only as "Busy" with no title).
- Files: the app makes `app.db` mode 600; `backup.sh`/`restore.sh` use umask 077. Run once after creating it: `sudo chmod 700 data`.
- A stranger can lock one username for 15 min with 50 wrong tries. Fix for the owner: `reset-password` (§5, clears it) or wait.
- Accepted for now (from the 2026-11-08 security review): two low SvelteKit advisories fixed only in Kit 3 (enhanced-form redirect to a foreign URL, prerender cache-control XSS; the app has neither foreign redirects nor prerendered pages). `/healthz` shows the version (ops needs it). One `APP_SECRET` keys all HMACs (codes are random 60-bit, no practical clash). GitHub Actions pinned by major tag, not SHA.
- Optional extra layer: Cloudflare Access in front (email one-time PIN for the known users).

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Every POST/form → 403 | `ORIGIN` ≠ the URL in the browser (scheme/host/port, trailing slash). |
| Every request → 400 | `ADDRESS_HEADER` set but traffic not via the tunnel (LAN port, wrong hostname target). |
| Everyone locked out together | `ADDRESS_HEADER` unset behind the tunnel → all users share cloudflared's IP. |
| Login works on LAN but loops on https (or the reverse) | `ORIGIN` scheme wrong; cookies are Secure only when ORIGIN is https. |
| App exits at start with `Bad env:` | The listed variable is missing/invalid (e.g. APP_SECRET < 32 chars). |
| `SQLITE_CANTOPEN` / `EACCES` on `/app/data` | Host `data/` not owned by 1000:1000. |
| `EROFS` read-only filesystem error | Something writes outside `/app/data` or `/tmp`; report it to dev. Short-term: remove `read_only: true`. |
| `pull access denied` | `docker login ghcr.io` missing/expired, PAT lacks `read:packages`, or wrong `APP_VERSION`. |
| cloudflared never starts | app not `healthy` yet (`depends_on`), check `docker compose ps` and app logs. |
| Import page says no seed | `data/seed/_report.json` missing or not readable by uid 1000. |

## 8. Acceptance checks (after first deploy and each upgrade)

- [ ] `docker compose ps`: app healthy, cloudflared running, no published ports (`docker compose port app 3000` empty).
- [ ] `https://planner.jeremyjosh.org/healthz` → 200 with the expected version.
- [ ] Browser: log in; cookie `__Host-lt_session` is Secure + HttpOnly.
- [ ] `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.example' https://planner.jeremyjosh.org/api/items` → 403.
- [ ] Create a planner block, reload, it stays. Delete it, Undo works.
- [ ] Second account: sign up (or invite), swap share codes in Settings → Sharing, each sees the other's calendar striped with a badge; types not shared show only as "Busy".
- [ ] `sudo ./backup.sh` run by hand succeeds; restore drill into a scratch folder passes integrity check.
- [ ] 5 wrong passwords → lockout message with minutes; other users unaffected (real IPs work).
- [ ] v2: old items, blocks, share-code partners and each person's theme look the same as before the upgrade.
- [ ] v2: Keep note with an image saves + reopens after reload; `data/uploads/` gets a file, owned by uid 1000.
- [ ] v2: new page, type, `/` → Table; reload keeps it. Share it with the second account (view); they open it from "Shared with me", can't edit; Remove → their reload = 404.
- [ ] v2: quick add `test /remind 15min` at a time 16 min ahead → in-app reminder ~1 min later. With VAPID: Settings › Notifications → Turn push on → Send a test arrives on a phone.
- [ ] v2: phone browser opens on Today; "Add to Home Screen" installs it.
- [ ] v2: `sudo ./backup.sh` writes both `app-<ts>.db.gz` and `uploads-<ts>.tar.gz`.

## 9. Known limits

- Single instance, single SQLite file. Backups are the DR plan.
- No email: password resets are the `reset-password` script.
- Desktop-first. Phone = Today, Keep, add, read-first Week/Month; plan the week on a PC.
- v2: no live co-edit (a clash says "changed elsewhere", text kept). Push verified on Edge only before release.
- v2: offline = Keep edits only (they wait in the browser); everything else needs the server.
- DB tables `goals`, `courses` and column `items.course_id` are unused leftovers (data kept on purpose).
