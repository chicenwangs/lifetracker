# Life Tracker — DEPLOYMENT (dev side)

Caveman doc. Rev 2026-11-08: the app ships as a released container image. Server never builds.
**Ops side (deploy, upgrade, rollback, backup, troubleshoot) = `docs/SERVICE-HANDOFF.md`.** This file = local dev + how a release is made.

| Stage | Where | URL | Who |
|---|---|---|---|
| A | Jeremy PC (Windows) dev | http://localhost:5173 | dev chat |
| Release | GitHub Actions → GHCR | `ghcr.io/chicenwangs/lifetracker:X.Y.Z` | dev chat (push tag) |
| B | Ubuntu homelab, Docker, LAN test | http://<homelab-ip>:3000 | deploy chat |
| C | Cloudflare Tunnel | https://planner.jeremyjosh.org | deploy chat, then users |

## 0. Env vars (dev)

`.env.example` (repo root) → copy to `app/.env`. Prod template = `deploy/.env.example` (see SERVICE-HANDOFF §3).

| Var | Dev value | Note |
|---|---|---|
| DATABASE_PATH | ../data/app.db | parent dir auto-created |
| SEED_DIR | ../data/seed | Notion import input |
| ORIGIN | http://localhost:5173 | must equal browser URL exactly |
| APP_SECRET | 32+ random | HMAC key. Required |
| SETUP_TOKEN | 32+ random | 20+ chars; empty = /setup off |
| TZ | Asia/Kuala_Lumpur | |
| ADDRESS_HEADER | unset | prod behind tunnel only |

Random: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## A. Local dev (Windows)

Need: Node 22 LTS (not 24), Git, Python 3. Folder `Desktop\life-tracker`.
```powershell
cd "$HOME\Desktop\life-tracker\app"
npm ci
copy ..\.env.example .env      # fill APP_SECRET, SETUP_TOKEN
npm run dev                    # http://localhost:5173, migrations run on boot
```
First run: `/setup` → admin `jeremy` → `npm run db:seed -- --owner jeremy` (counts must match `..\data\seed\_report.json`). Locked out: `npm run reset-password -- jeremy`.
Re-import after new Notion export: `python ..\scripts\transform_notion.py` → `npm run db:seed -- --owner jeremy` (new ids only; app edits kept).
Checks before a release: `npm run lint && npm run check && npm run test:unit && npm run test:e2e` (CI runs the same).

## Release (how an image gets made)

1. Main is green in GitHub Actions (`ci.yml`: lint, svelte-check, unit, e2e, Docker build).
2. Bump `app/package.json` `version`, commit "release: vX.Y.Z" with notes in the message.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. `release.yml`: runs CI again → builds `app/Dockerfile` → pushes `ghcr.io/chicenwangs/lifetracker:X.Y.Z`, `:X.Y`, `:sha-<short>` → creates the GitHub Release (auto notes + `SERVICE-HANDOFF.md` + flat `deploy-vX.Y.Z.tar.gz` of `deploy/`). Only plain `vX.Y.Z` tags publish; `v1.1.0-rc1` does nothing.
5. First release only: GitHub → Packages → `lifetracker` → keep it **private**; link it to the repo.
6. Hand the version number to the deploy side. They change `APP_VERSION` and pull.

SemVer: fix = PATCH, feature = MINOR, breaking/ops change = MAJOR. Say "migration" in the notes when a release adds `drizzle/*.sql` (rollback then needs the pre-upgrade backup).

Image rules: build context = repo root, `.dockerignore` keeps out `data/`, `.env*`, `.git`, docs. No personal data or secrets in any layer. Seed is read at runtime from the mounted `data/seed`.

Prod-mode run without Docker (to test the built server): `npm run build`, then `node build` with prod env (`ORIGIN=https://planner.jeremyjosh.org ADDRESS_HEADER=CF-Connecting-IP …`): `/healthz` 200 without header, other paths 400 without `CF-Connecting-IP`, cookies `__Host-lt_session; Secure`.

## Repo hygiene

`.gitignore`: `.env`, `app/.env`, `data/*` (keeps `data/.gitkeep`), `node_modules`, builds, `*.db*`. Repo private. `data/` = personal info (calendar, places, people facts). Never commit it, never COPY it into an image.

## Dev troubleshoot

| Problem | Fix |
|---|---|
| better-sqlite3 load/compile error | Node 24 → use Node 22; `npm ci` again |
| Times off by 8 h | date-only parsed with `new Date()`; use `lib/time.ts` |
| Every POST 403 | `ORIGIN` ≠ browser URL |
| Seed count mismatch | re-run transform; import with correct `--owner` |
| `node build` ignores .env | use `node --env-file=.env build` |
