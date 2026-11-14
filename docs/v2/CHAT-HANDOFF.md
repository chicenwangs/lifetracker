# Life Tracker — chat handoff (2026-11-14, v2.0.3)

Paste this into a new chat. It is the full context. Caveman style.

## 1. What it is
- Self-hosted life planner for one household (owner + partner). 2–5 users, one server, one Node process, one SQLite file.
- Repo `github.com/chicenwangs/lifetracker`. Local `C:\Users\jeremy josh\Desktop\life-tracker`, app in `app/`.
- Stack: Node 22 · SvelteKit 2 + Svelte 5 runes · better-sqlite3 (pinned) · Drizzle migrations · zod `.strict()` · Tiptap · sigma 4 · Vitest · Playwright.
- Features: Home (month + day planner), Week, quick add (N), item types, undo, Keep notes, Pages + databases + graph, Ctrl+K search, reminders + Web Push, page/note sharing, calendar sharing by code, phone screens + PWA, welcome tour.
- Live today = **v1.1.0** at `https://planner.jeremyjosh.org` (homelab, Docker Compose, Cloudflare Tunnel). **Claude never deploys.** Owner does.

## 2. Where things stand
- **v2.0.3 released** 2026-11-14. Tag `v2.0.3` → GitHub Actions → image `ghcr.io/chicenwangs/lifetracker:2.0.3` (+ `:2.0`, `:sha-…`) + GitHub Release with `deploy-v2.0.3.tar.gz`, `SERVICE-HANDOFF.md` and (with the signing secrets) `life-tracker-2.0.3.apk`.
  - v2.0.3 = v2.0.2 + PR #18 Android app (`mobile/`: widgets, reminder alarms, in-app update) + `GET /api/native`. **No migration.**
  - v2.0.2 = v2.0.1 + PR #16 (phone pass, Android push fixes) + PR #17 (phone account menu on top). **No migration.**
  - v2.0.1 = v2.0.0 + PR #15: Pages UI to wireframes, graph fix (giant nodes, dark mode), no visible scrollbars, header pin reorder/unpin in Settings › Preferences, phone All pages (search + recent). **No migration.**
- v2.0.0 (tag 7693218) = all phases P0–P10 (PRs #5–#14). Migration release from v1.1.0 (SQL 0003–0008).
- Branches: `main` = `v2` = release commit `1902feb`. `fix/ui-audit` merged (can delete).
- Tests at release: lint + svelte-check clean · unit 341 · e2e 25 · CI green.
- Not deployed. Live still v1.1.0.

## 3. Deploy + update guide (owner, on the homelab)

Full ops contract: `docs/SERVICE-HANDOFF.md` (also attached to every release). The short version:

### 3a. First time on a new box (no app there yet)
```bash
sudo mkdir -p /opt/life-tracker && sudo chown $USER /opt/life-tracker && cd /opt/life-tracker
gh release download v2.0.3 -R chicenwangs/lifetracker -p 'deploy-*.tar.gz'   # or download from the Releases page
tar -xzf deploy-v2.0.3.tar.gz
cp .env.example .env && chmod 600 .env && nano .env        # APP_VERSION=2.0.3, ORIGIN, APP_SECRET, SETUP_TOKEN, ADDRESS_HEADER
cp tunnel.env.example tunnel.env && chmod 600 tunnel.env   # TUNNEL_TOKEN
mkdir -p data && sudo chown -R 1000:1000 data && sudo chmod 700 data
echo "$GHCR_PAT" | docker login ghcr.io -u chicenwangs --password-stdin   # PAT with read:packages
docker compose --profile tunnel up -d
docker compose ps                                           # app healthy, cloudflared up
curl -s https://planner.jeremyjosh.org/healthz              # "version":"2.0.3"
```
Then `/setup` with `SETUP_TOKEN` → admin → remove `SETUP_TOKEN` from `.env` → `docker compose up -d`.
Make secrets: `openssl rand -base64 48` (APP_SECRET). Push keys (optional): `docker compose run --rm app npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:…`.

### 3b. Live box today: v1.1.0 → v2.0.3 (one time, has a migration)
```bash
cd /opt/life-tracker
sudo ./backup.sh                                   # rollback point: data/backups/app-<ts>.db.gz
cp data/backups/app-<ts>.db.gz /somewhere/off/the/box/
gh release download v2.0.3 -R chicenwangs/lifetracker -p 'deploy-*.tar.gz'
tar -xzf deploy-v2.0.3.tar.gz                      # new compose/backup/restore; keeps your .env and tunnel.env
nano .env                                          # APP_VERSION=2.0.3 (+ optional VAPID_*, UPLOAD_DIR, MAX_UPLOAD_BYTES)
docker compose pull app && docker compose up -d app
docker compose logs -f app                         # wait for: [boot] v2.0.3 db ready … jobs=true push=on|off
curl -s https://planner.jeremyjosh.org/healthz     # "version":"2.0.3","jobs":true
```
Then run the checklist in SERVICE-HANDOFF §8 (v2 lines included).
With VAPID keys: allow outbound HTTPS 443 to the push services (SERVICE-HANDOFF §1).

**Rollback from v2 to v1.1.0** (needs the backup, v1.1.0 can't read the v2 DB):
```bash
nano .env                                          # APP_VERSION=1.1.0
sudo ./restore.sh data/backups/app-<ts>.db.gz      # the backup taken before the upgrade
docker compose up -d app
```

### 3c. Normal update (any later release, e.g. 2.0.2 → 2.0.3)
```bash
cd /opt/life-tracker
sudo ./backup.sh
nano .env                                          # APP_VERSION=X.Y.Z
docker compose pull app && docker compose up -d app
docker compose logs -f app                         # [boot] vX.Y.Z
curl -s https://planner.jeremyjosh.org/healthz
```
Rollback when the release notes say **no migration**: set the old `APP_VERSION`, `docker compose up -d app`. When they say **migration**: old version + `sudo ./restore.sh <pre-upgrade backup>`.
If the release changed `deploy/` files (compose, backup, restore), unpack its `deploy-vX.Y.Z.tar.gz` first (keep `.env`, `tunnel.env`).

### 3d. Day to day
```bash
docker compose logs --since 1h app                                   # [boot] [error] [job] lines
docker compose exec -it app node scripts/reset-password.mjs <user>   # forgot password / lockout
sudo ./restore.sh data/backups/app-<ts>.db.gz                        # restore (drill monthly)
```
Nightly backup (root cron): `15 3 * * * /opt/life-tracker/backup.sh >> /var/log/life-tracker-backup.log 2>&1`. Set `LT_OFFSITE` for an off-box copy. Backups include `data/uploads` since v2.

## 4. Making a release (dev side, Claude can do this)
1. Work on a branch off `main` → PR into `main` → CI green → merge (`git merge --no-ff`, message "Merge pull request #N from chicenwangs/<branch>") → push `main`, then `git push origin main:v2` (keep `v2` = `main`).
2. Bump: `cd app && npm version X.Y.Z --no-git-tag-version`; `deploy/.env.example` `APP_VERSION=X.Y.Z`; add a section on top of `docs/v2/RELEASE-NOTES.md` (say "migration" or "no migration"); SERVICE-HANDOFF §5 upgrade note; README status; PHASES row.
3. Commit `release: vX.Y.Z`, push `main` (+ `main:v2`), then `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`.
4. `release.yml` runs CI → GHCR image → GitHub Release with the deploy bundle → signed `life-tracker-X.Y.Z.apk` (needs repo secrets `ANDROID_KEYSTORE_B64` + `ANDROID_KEYSTORE_PASSWORD`; key on the dev PC in `~/.lifetracker-android/`, see `mobile/README.md`). Red pipeline = no image. Check: `curl -s "https://api.github.com/repos/chicenwangs/lifetracker/actions/runs?event=push&per_page=5"`.
5. A flaky test after the tag: fix on `main`, re-run the failed jobs on GitHub; don't move a pushed tag.
SemVer: PATCH = fixes, MINOR = features, MAJOR = breaking. Never `latest` in prod compose.

## 5. Open items
- **Owner call (don't guess):** Home due row says "Due today"; FEATURES §1.13 + wireframe Main say "No time set today", but the list also holds timed items (v1 FR-H12). Rename + show only untimed items, or keep v1?
- Not verified: Web Push on Chrome/Android/iPhone and through the tunnel (Edge only) · uploads in the real read-only container · migration on a copy of the live backup (owner skipped; CI rehearsal `tests/unit/rehearsal.test.ts` covers a built v1.1.0 DB) · backup.sh / restore.sh in Docker.
- Android app (`mobile/`, v2.0.3): built in CI only (no Android SDK on the dev PC); not tried on a real phone yet.
- v2.1 backlog: live co-edit (ADR-008) · Keep Google Takeout import/export · DB board/calendar/list/gallery views · 2-hop local graph · reminders on page to-dos · swipe gestures · offline queue → IndexedDB · Pages block drag handles + multi-select · Keep grid/list toggle · graph archived nodes dashed (now grey + "· archived") · `npm run dev` graph worker blocked by CSP (`blob:`; prod fine).

## 6. Docs map (truth order)
- `CLAUDE.md` (repo rules) → `docs/v2/PRD.md` (decisions D-xx §12, all closed) → `FEATURES.md` → `DESIGN.md`.
- `docs/v2/RELEASE-PARITY.md` (every v1.1.0 feature stays) · `UX-AUDIT.md` · `SYSTEM-AUDIT.md` · `RELEASE-NOTES.md` · `PHASES.md`.
- Wireframes `wireframes/v2/*.dc.html` + `canvas.json` (live canvas https://claude.ai/artifact/TsaCjQodZ2xHaNYDuBQLJ5). Phone = `M*.dc.html`. Top-level `wireframes/*.dc.html` = v1, reference only. They need a canvas runtime: read markup + sample data.
- `docs/BUILD-NOTES.md` (what the app does now; wins over older docs) · `docs/TECHNICAL.md` · `docs/SERVICE-HANDOFF.md` (ops contract: update when env, outbound calls or backups change) · `docs/adr/`.

## 7. Code rules (CLAUDE.md)
- Repo layer owns SQL + scoping; routes never build SQL; never trust client owner/user ids. Sharing check = `app/src/lib/server/repo/shares.ts` (`need`, `needDb`, `needRecord`; 404 no access, 403 read_only).
- Item `date/time` = owner-local; blocks + `*_at` = UTC. Never `new Date('YYYY-MM-DD')`.
- Migrations forward-only; keep dormant tables. No behaviour keyed on a type *name* (use `item_types` flags). New setting default = v1.1.0 behaviour.
- Every drag has a click/keyboard path. Hit targets ≥ 24 px. No visible scrollbars (global rule in `app.css`).
- Per change: lint + types + unit + e2e green · docs updated · PR · PHASES row.
- Docs caveman style. Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR body ends "🤖 Generated with [Claude Code](https://claude.com/claude-code)".

## 8. Dev commands (from `app/`)
- `npm run dev` (port 5173; `.env` `ORIGIN` must match or the API says `bad_origin`).
- `npm run lint` · `npx svelte-check --threshold error` · `npx vitest run` · `npm run test:e2e` (builds + runs prod on its own port; delete `test-results/` after, or prettier flags `.last-run.json`).
- Colour tokens: `--ink`, `--quiet` (grey text; `--muted` is an alias), `--card`, `--rule`, `--pill-card` + `--pill-ink` (selected on a card), `--ground`.

## 9. Dev PC quirks
- No `gh`, Docker, `sqlite3` CLI or Chrome install for CLI tools (Edge + Brave; Claude in Chrome works).
- PRs: `git push`, then open `https://github.com/chicenwangs/lifetracker/compare/main...<branch>?expand=1` in the browser.
- CI/release status: public API with `curl` (above), no auth.
- SQLite: Node script with `better-sqlite3` from `app/node_modules`.
- Python `open(..., 'w')` on Windows writes CRLF; git normalises to LF on commit, prettier fixes app files.
- Don't pipe `git merge` output (hides a failed merge).

## 10. Owner preferences
- Talk caveman (short, simple words) + ponytail (smallest complete change; end replies with what was skipped / risk).
- Ask before guessing an open decision. Don't deploy. Don't touch live data.
