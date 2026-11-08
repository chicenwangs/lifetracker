# Life Tracker — DEPLOYMENT

Caveman doc. Three stages. In order. No skip. Rev 2 (after review, see REVIEW.md).

| Stage | Where | URL | Done when |
|---|---|---|---|
| A | Jeremy PC (Windows) dev | http://localhost:5173 | P1 acceptance passes |
| B | Ubuntu homelab, Docker | http://<homelab-ip>:3000 (LAN) | used 1 week, backup restore tested |
| C | Cloudflare Tunnel | https://lt.<your-domain> | Neina logs in from her device |

## 0. Env vars

Two templates at repo root: `.env.example` (dev → copy to `app/.env`) and `.env.prod.example` (Docker → copy to repo-root `.env`). `.env.prod.example` is NOT made yet: create it at repo root from the block below and commit it (no secrets in it) before Stage B. Compose `env_file` beats Dockerfile `ENV`, so prod `.env` MUST hold prod paths.

| Var | A (app/.env) | B/C (root .env) | Note |
|---|---|---|---|
| NODE_ENV | development | production | |
| DATABASE_PATH | ../data/app.db | /app/data/app.db | parent dir auto-created |
| SEED_DIR | ../data/seed | /app/seed | |
| ORIGIN | http://localhost:5173 | B http://<ip>:3000 · C https://lt.<domain> | must equal browser URL exactly. Cookie Secure only when https |
| APP_SECRET | 32+ random | 32+ random (different) | HMAC pepper. Required |
| SETUP_TOKEN | 32+ random | 32+ random, delete after /setup | empty = setup off |
| TZ | Asia/Kuala_Lumpur | Asia/Kuala_Lumpur | container clock tz for logs |
| ADDRESS_HEADER | unset | C only: CF-Connecting-IP | only when app port NOT published |
| PORT/HOST | (vite) | 3000 / 0.0.0.0 | |
| TUNNEL_TOKEN | — | C only | read by cloudflared from env |

Random: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

`.env.prod.example` (create at repo root from this block):
```ini
NODE_ENV=production
DATABASE_PATH=/app/data/app.db
SEED_DIR=/app/seed
PORT=3000
HOST=0.0.0.0
TZ=Asia/Kuala_Lumpur
# Stage B: http://<homelab-ip>:3000   Stage C: https://lt.<your-domain>
ORIGIN=http://<homelab-ip>:3000
APP_SECRET=
# only until /setup done, then delete + restart
SETUP_TOKEN=
# Stage C only (and remove app ports: in compose)
# ADDRESS_HEADER=CF-Connecting-IP
# TUNNEL_TOKEN=
```

## A. Local dev (Windows)

Need: Node 22 LTS, Git, Python 3, VS Code.
Folder `C:\Users\jeremy josh\Desktop\life-tracker\` (space in path; native deps are prebuilt so OK. If a native build ever fails: clone to `C:\dev\life-tracker`, point DATABASE_PATH/SEED_DIR at Desktop data).

PowerShell:
```powershell
cd "$HOME\Desktop\life-tracker"
git init                                   # .gitignore already excludes data/ and .env
npx sv create app                          # minimal, TypeScript, add eslint prettier vitest playwright
cd app
npm i drizzle-orm better-sqlite3 zod @node-rs/argon2 date-fns @date-fns/tz marked isomorphic-dompurify
npm i @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
npm i -D drizzle-kit @types/better-sqlite3 @sveltejs/adapter-node tsx
copy ..\.env.example .env                  # then fill APP_SECRET, SETUP_TOKEN
npm run dev                                # http://localhost:5173 (migrations run on boot)
```
First run:
1. http://localhost:5173/setup → SETUP_TOKEN → user `jeremy` + password.
2. `npm run db:seed -- --owner jeremy` → counts must match `..\data\seed\_report.json`.
3. Login, Remember me ON. Restart browser → still in.
4. Locked out in dev: `npm run reset-password -- jeremy`.

Scripts (package.json):
```json
"db:generate": "drizzle-kit generate",
"db:seed": "tsx --env-file=.env scripts/seed.ts",
"reset-password": "node --env-file=.env scripts/reset-password.mjs",
"test:unit": "vitest run",
"test:e2e": "playwright test"
```
Migrate = automatic on server boot (`hooks.server.ts` init). No separate migrate step.
Re-import after new Notion export: `python ..\scripts\transform_notion.py` → `npm run db:seed -- --owner jeremy` (new ids only; app edits kept).
Prod build test (PowerShell, app/): `npm run build` → `$env:ORIGIN="http://localhost:3000"; node --env-file=.env build` → http://localhost:3000. Real env beats `--env-file`, so `.env` stays on 5173. After: `Remove-Item Env:ORIGIN`.

## B. Homelab (Ubuntu + Docker)

Need: Docker Engine + compose plugin, git, sqlite3 (`sudo apt install sqlite3`).
```bash
sudo mkdir -p /opt/life-tracker && sudo chown $USER /opt/life-tracker
git clone <private repo> /opt/life-tracker && cd /opt/life-tracker
mkdir -p data && sudo chown -R 1000:1000 data     # container user node = uid 1000; bind mount hides image chown
cp .env.prod.example .env && nano .env            # ORIGIN=http://<ip>:3000, APP_SECRET, SETUP_TOKEN
```
`data/seed/` is in git? NO (personal data, gitignored). Copy it over before build — on PC (PowerShell, repo root): `scp -r data\seed user@<homelab-ip>:/opt/life-tracker/data/`. Image copies `data/seed` → `/app/seed`.

`app/Dockerfile` (build context = repo root):
```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/reset-password.mjs ./scripts/reset-password.mjs
COPY data/seed ./seed
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
```
If `npm ci` tries to compile better-sqlite3 (no prebuilt match) add `RUN apt-get update && apt-get install -y python3 make g++` in build stage.

`docker-compose.yml` (repo root):
```yaml
services:
  app:
    build: { context: ., dockerfile: app/Dockerfile }
    restart: unless-stopped
    init: true                         # node gets SIGTERM properly
    env_file: .env
    volumes:
      - ./data:/app/data
    ports:
      - "3000:3000"                    # Stage B LAN only. REMOVE in Stage C
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
```
Run: `docker compose up -d --build && docker compose logs -f app` → browser http://<ip>:3000/setup → admin → Settings > Import (owner = you). Then delete SETUP_TOKEN from `.env`, `docker compose up -d`.
Or move dev DB: stop dev server, `sqlite3 app.db "PRAGMA wal_checkpoint(TRUNCATE)"`, copy `app.db` into `/opt/life-tracker/data/`, `sudo chown 1000:1000 data/app.db`.

Reset password (locked out): `docker compose exec app node scripts/reset-password.mjs jeremy` (asks new password on stdin).

Backups (now, not later). `/opt/life-tracker/backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/life-tracker/data
mkdir -p backups
ts=$(date +%F-%H%M)
sqlite3 app.db ".backup 'backups/app-$ts.db'"
sqlite3 "backups/app-$ts.db" "PRAGMA integrity_check" | grep -qx ok
gzip "backups/app-$ts.db"
find backups -name 'app-*.db.gz' -mtime +14 -delete
rsync -a backups/ /mnt/backup/life-tracker/      # REQUIRED: other disk / NAS. Edit path.
```
`chmod +x backup.sh`. Cron (`crontab -e` as your user): `15 3 * * * /opt/life-tracker/backup.sh >> /opt/life-tracker/backup.log 2>&1`.
Restore test (do once, safe):
```bash
cd /opt/life-tracker/data
mkdir -p /tmp/lt-restore && gunzip -c backups/app-<ts>.db.gz > /tmp/lt-restore/app.db
sqlite3 /tmp/lt-restore/app.db "PRAGMA integrity_check; SELECT count(*) FROM items;"
# real restore: docker compose stop app; mv app.db app.db.pre-restore; rm -f app.db-wal app.db-shm;
#               cp /tmp/lt-restore/app.db app.db; sudo chown 1000:1000 app.db; docker compose start app
```
Update:
```bash
./backup.sh && git pull && docker compose up -d --build && docker compose logs --tail=50 app
```
Rollback (migration failed on boot): `docker compose stop app` → restore pre-update backup (above) → `git checkout <old sha>` → `docker compose up -d --build`.
Monitoring: add http://<ip>:3000/healthz to homelab monitor; alert if down > 5 min.

## C. Cloudflare Tunnel

Need a domain on Cloudflare DNS (cheap domain, nameservers to Cloudflare). Free plan OK. No port forward. No public IP.

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels (menu name may say Connectors) → Create → Cloudflared → name `life-tracker` → copy token.
2. Public hostname: `lt` . `<domain>` → service HTTP `app:3000`.
3. Compose: **remove `ports:` from app** (tunnel reaches app on compose network; published port + ADDRESS_HEADER = spoofable IP). Add:
```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest      # pin dated tag once working
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN}           # from root .env; not on command line
    depends_on:
      app: { condition: service_healthy }
```
4. `.env`: `ORIGIN=https://lt.<domain>`, `ADDRESS_HEADER=CF-Connecting-IP`, `TUNNEL_TOKEN=...`. No SETUP_TOKEN.
5. `docker compose up -d`. Open https://lt.<domain>. Check cookie `__Host-lt_session` with Secure.
6. Cloudflare: "Always Use HTTPS" on. Optional rate-limit rule on `/login` (5 req / 10 s per IP).
7. Now invite users. Sign-up is open: send Neina https://lt.<domain>/signup, she makes her own account, you swap share codes in Settings > Sharing. Once everyone is in, switch Settings > Users to Invite only (the URL is public).
8. After Stage C, everyone (you too, at home) uses the tunnel URL. No LAN port. Requests without the Cloudflare header get 400 by design.

Optional Cloudflare Access (Zero Trust → Access → Applications → self-hosted `lt.<domain>`, allow Jeremy + Neina emails, one-time PIN). Add bypass for `/cal/*` (ics clients can't log in) — feed URL token is the secret (160 bits, rotate if leaked). App login still required.

Never: expose before /setup; wrong ORIGIN; commit `.env`, TUNNEL_TOKEN, or `data/`.

## D. Repo hygiene

`.gitignore` (root): `.env`, `app/.env`, `data/*` (not `data/` — git can't re-include a file inside an ignored dir), `!data/.gitkeep`, `**/node_modules`, `app/build`, `app/.svelte-kit`, `test-results`, `*.db*`.
`.dockerignore` (root, = build context): `**/node_modules`, `app/build`, `app/.svelte-kit`, `data/app.db*`, `data/backups`, `data/notion-raw`, `.env*`, `**/.env*`, `.git`, `wireframes`, `docs`, `test-results`.
Repo private. `data/` holds personal info (Neina facts, places, calendar).

## E. Troubleshoot

| Problem | Fix |
|---|---|
| Every POST 403 | ORIGIN ≠ browser URL (scheme/host/port) |
| Login loops on LAN http | Secure cookie on http → app must derive Secure from ORIGIN scheme (TECHNICAL §5) |
| 400 on every request after Stage C | ADDRESS_HEADER set but request not via tunnel (LAN port) |
| Lockout hits everyone | ADDRESS_HEADER unset behind tunnel → all users = cloudflared IP |
| SQLITE_CANTOPEN | data dir not owned by uid 1000, or DATABASE_PATH dev value in prod .env |
| SQLITE_BUSY | one app container only; busy_timeout set |
| better-sqlite3 load error | glibc image (bookworm) not alpine; node_modules not copied from Windows |
| Times off by 8 h | date-only parsed with `new Date()`; use lib/time.ts |
| Seed count mismatch | re-run transform; import with correct `--owner` |
| `node build` ignores .env | use `node --env-file=.env build` (dev) — Docker uses env_file |
