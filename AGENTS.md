# AGENTS.md — Life Tracker session brain

Read this first. One page of truth; deeper docs at the end. Caveman style: short lines, no filler.

## What this is

- Self-hosted Notion replacement for one household (owner + partner, 2–5 users). Calendar + day planner + notes (Keep) + wiki (Pages, databases, graph) + reminders + sharing.
- Repo `github.com/chicenwangs/lifetracker` (private). Local: `C:\Users\jeremy josh\Desktop\life-tracker`. Branch `main`.
- Latest release: **v3.1.1** (tag, GHCR image, GitHub Release, APK; 2026-11-20). `app/package.json` = 3.1.1. 3.1.2 (bug-fix patch) is in progress on `main`, not released.
- Live: `https://planner.jeremyjosh.org` (homelab Docker Compose + Cloudflare Tunnel). Last verified 2026-11-19: `/healthz` → `{"ok":true,"db":true,"version":"3.0.0","jobs":true}`. Not re-checked since v3.1.x. **Owner deploys. Agents never deploy and never touch live data.**
- Android app ships per release (`life-tracker-X.Y.Z.apk`), Capacitor 8 shell in `mobile/`.

## Run it

```powershell
cd app
npm install                # Node 22 only; Node 24 breaks better-sqlite3
npm run dev                # http://localhost:5173, reads app/.env
```

- `app/.env` (copy of `.env.example`) points `DATABASE_PATH=../data/app.db` — that is the owner's real data. **Do not test against it.**
- Test copy: `DATABASE_PATH=../data/qa/app.db` (+ `ORIGIN=http://localhost:<port>` matching the port). Sweep DB login: username `phone`, password `dyzw_qid3LlYwGbj` (in `data/qa/TEST-LOGIN.txt`).
- Other scripts: `npm run check` (svelte-check), `npm run lint` (prettier + eslint), `npm run test:unit`, `npm run test:e2e`, `npm run test:e2e:phone`.
- API dev server: `npm run dev -- --host 127.0.0.1 --port 4174 --strictPort`.

## Stack (do not drift)

- Node 22 · SvelteKit 2 + Svelte 5 runes · TypeScript · better-sqlite3 (pinned 12.11.1) · Drizzle SQL migrations (forward-only, `app/drizzle/0000…0010`) · zod `.strict()` · Tiptap editor · sigma graph · web-push · Vitest · Playwright (desktop + phone projects) · Capacitor 8 (Java plugins in `mobile/android/app/src/main/java/...`).
- One process, one SQLite file, no external services. Deliverable = Docker image on GHCR + GitHub Release.
- Routes never build SQL; `app/src/lib/server/repo/*` owns SQL + scoping. Never trust client user/owner ids.
- Item `date`/`time` are owner-local; time blocks and `*_at` columns are UTC. Never `new Date('YYYY-MM-DD')` for a day key.
- No behaviour keyed on an item-type *name* — use `item_types` flags.
- New setting default = old behaviour. Migrations keep dormant tables.

## Map

| Layer | Where |
|---|---|
| Pages | `app/src/routes/**/+page.svelte` (+ `+page.server.ts` data), `+layout.svelte` (shell, mobile nav, tour) |
| API | `app/src/routes/api/**/+server.ts` → repo functions |
| Server | `app/src/lib/server/` — `auth`, `env`, `db`, `http`, `search`, `reminders`, `push`, `attachments`, `quickadd-server`, `repo/*` |
| Shared logic | `app/src/lib/` — `time.ts`, `quickadd.ts` (pure, client + server), `planner-layout.ts`, `planahead.ts`, `colors.ts` |
| Client state | `app/src/lib/client/` — `api`, `toast`, `bus`, `peek`, `layers`, `offline`, `prefs`, `mobile.svelte.ts` |
| Components | `app/src/lib/components/` (AppHeader, DayPlanner, QuickAdd/CommandInput/QASlots, Month/WeekCalendar, Keep*, Page*, MobileAdd, BottomSheet…) |
| Tests | `app/tests/unit/*.test.ts` (vitest), `app/tests/e2e/*.spec.ts` (desktop), `app/tests/e2e/phone/` (phone projects) |
| Android | `mobile/` — `capacitor.config.json` (`server.url` = site), `android/app/src/main/java/.../` plugins: Updater, Session, ThemeBars, Haptics, Widgets, Reminders, SyncWorker, Native |
| Ops bundle | `deploy/` (compose, backup.sh, restore.sh, .env.example) |

Routes that exist (2026-11): `/`, `/today`, `/week`, `/month`, `/item/[id]`, `/keep` (+ `?scope=trash`), `/pages`, `/pages/[id]`, `/pages/graph`, `/pages/archive`, `/pages/shared`, `/pages/trash`, `/more`, `/trash`, `/login`, `/signup`, `/setup`, `/settings/{account,preferences,notifications,sharing,sessions,users,types,import,help}`.

## Product facts that surprise people

- Quick add grammar (one input): `title  tomorrow 3pm to 4pm /type /calendar|/both /remind 2h`. No time → planner refuses and says so; `/calendar` = all-day item. Batch add keeps the sheet open. Shared parser `quickadd.ts` powers every entry point.
- Theme: Auto (Light 07:00–16:59, Dark 17:00–06:59, editable) or fixed via the sun/moon button. `--pill`/`--pill-ink` must be paired in both themes.
- Undo: every mutation posts to the undo journal; Ctrl+Z (and the toast Undo) replays the inverse. Page editor keeps its own history.
- Access: single check `level()`/`need()` in `lib/server/repo/shares.ts` for item/page/note/database-record. Trashed rows return "not found" there — restore paths must not go through it.
- Phone layout = width < 700 px, or coarse pointer with max-height 500 px. One shared bottom sheet (`BottomSheet.svelte`); Back closes the top layer (`use:backCloses`); hit areas ≥ 48 dp on phone, ≥ 24 px desktop; no "Click/Ctrl/PC" copy on phone; swipes move between peers, long-press selects.
- Offline: service worker shell + offline badge; Keep edits and quick adds queue in `lib/client/offline.ts`; the Android app adds a real `offline.html` fallback.
- Android extras: 6 widgets (Timeline, Keep, Now&Next, Quick, Countdown, Week), exact-alarm reminders (no FCM), in-app updater that polls GitHub Releases, theme-matched status bars, sign-out clears alarms/cache.

## Current state (2026-11-19)

- v3.0.0 released 2026-11-18 (mobile overhaul #106, repeating items #72/#73, security pass #22–#59, review fixes #155–#211, QA-loop fixes #221–#232). Migrations 0009 (`users.hints_seen`), 0010 (`users.default_reminder`).
- Tests at this commit, run locally on 2026-11-19: **371 unit** (29 files, ~16 s), **desktop e2e 25 passed / 1 skipped** (26 total, 2.4 min), phone e2e see `docs/v3/QA-RUN-2026-11-19.md`.
- Docs drift was fixed 2026-11-19 (live version, test counts, tree, handoff). If a doc disagrees with code, code wins, then update the doc.
- Backlog lives in `docs/v2/CHAT-HANDOFF.md` §"v2.1" and open review items in `docs/REVIEW.md`.

## Known issues (re-verified 2026-11-23, QA pass of release/3.1.2)

1. `/pages/graph` throws an unhandled `Sigma: Container has no width` error in the browser console (dev, phone-width view). Graph still renders; console is not clean.
2. Theme e2e test is a midnight hazard: it sets Light 00:00 / Dark 23:59 and asserts light; it failed at 00:00 and passed at 00:01. Run e2e outside that minute.
3. Dev server + service worker can serve a stale cached page (old data, no hydration) when the server is down. Do not judge offline behaviour on `vite dev`; build and run the server.

## Testing recipe (localhost + Android emulator)

- Unit: `cd app; npm run test:unit`. E2E: `npm run test:e2e` (26 desktop) / `npm run test:e2e:phone` (phone + landscape, ~246). E2E uses its own temp DB (`E2E_DIR`, port 4173) — no need to stop a dev server on another port, but both share `.svelte-kit`, so do not run two Vite servers on the same checkout.
- Emulator: AVD `lt_pixel7` (`%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd lt_pixel7`), `adb` in `%LOCALAPPDATA%\Android\Sdk\platform-tools\`. Start the dev server on **4174** against `data/qa/app.db`, then `adb reverse tcp:4174 tcp:4174`.
- Debug APK `mobile/android/app/build/outputs/apk/debug/app-debug.apk` embeds `http://localhost:4174` (cleartext). `adb install -r` it; the installed release app is older and will offer the newest release as an update instead.
- WebView inspection works on the debug build: `adb shell cat /proc/net/unix | findstr webview_devtools`, `adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>`, then `http://127.0.0.1:9223/json` → CDP WebSocket (Node 22 has global `WebSocket`). That is how to read `document.body.innerText`, click, and screenshot without OCR. `adb shell uiautomator dump` shows only an empty `<WebView>` node — not useful here.
- Emulator is slow: allow seconds between action and assertion; a `System UI isn't responding` dialog means the host is starved, tap Wait.
- Clean up test rows you create (or use a throwaway copy of `data/qa/app.db`).

## Docs map

| Doc | Use |
|---|---|
| `docs/HANDOFF.md` | current state, env facts, next steps (new chat reads this after AGENTS.md) |
| `docs/v2/PRD.md` → `FEATURES.md` → `DESIGN.md` | v2/v3 product truth, D-xx decisions |
| `docs/v2/PHASES.md` | release history + per-phase test counts |
| `docs/v2/CHAT-HANDOFF.md` | v2.0.4 snapshot + v2.1 backlog (banner: superseded) |
| `docs/BUILD-NOTES.md` | what the app does now, newest first |
| `docs/v3/MOBILE-SPRINT.md`, `docs/v3/QA-LOOP.md` | mobile sprint plan, QA method |
| `docs/SERVICE-HANDOFF.md` | ops contract: deploy, upgrade, rollback, backup, troubleshooting |
| `docs/DEPLOYMENT.md` | local dev → image |
| `docs/REVIEW.md` | review fixes + open owner decisions |
| `docs/security/*` | security audits (2026-11-15) |
| `docs/adr/*` | architecture decisions (monolith+SQLite, Tiptap, block storage, attachments, push, graph, offline) |
| `docs/REQUIREMENTS.md`, `TECHNICAL.md`, `PSEUDOCODE.md`, `STRUCTURE.md` | v1 spec/history — superseded, kept for history |
