# HANDOFF — current state (2026-11-24)

Caveman doc. Read `AGENTS.md` first (one page), then this. Repo `github.com/chicenwangs/lifetracker` (private), branch `main`, PC copy `Desktop\life-tracker`.

## Now

- **Latest release = v3.1.2** (2026-11-24, bug-fix patch, milestone 3.1.2). `app/package.json` = 3.1.2. Android APK `life-tracker-3.1.2.apk` on the release; installed phones self-update. Live upgrade = owner.
- Live = `https://planner.jeremyjosh.org` (homelab Docker Compose + Cloudflare Tunnel). Last verified 2026-11-19: `/healthz` → `version":"3.0.0"`, `jobs:true`; not re-checked since v3.1.x. Owner deploys; agents never deploy and never touch live data.
- **main has v3.2 work, not tagged:** Postpone/Skip (#384), Slipped list (#385), print week (#387), ICS calendar feed (#388), `agenda()` refactor (#386), Keep restore test (#382); #383 was already fixed. No migration. Owner tags + builds the APK.
- **424 unit** · **desktop e2e 52** · **phone e2e 328** (CI, 2026-11-25). Last independent QA pass — `docs/v3/QA-RUN-2026-11-23.md` (v3.1.2).
- Mobile overhaul (#106) done. v3.0.0 shipped repeating items, reminder actions, Android widgets/updater, offline, security + QA fixes.
- Next = v3.3 per `docs/v4/PLAN.md` §8 (migration 0011 first, owner merges it) and `docs/v4/BREAKDOWN.md`; build loop contract `qa/BUILD-LOOP.md`. v2.1 backlog (`docs/v2/CHAT-HANDOFF.md` §v2.1) and `docs/REVIEW.md` Open items are parked. One branch + PR per issue off `main`.

Release history and per-phase test counts: `docs/v2/PHASES.md` (v3 row = mobile overhaul, migrations 0009/0010). Release notes: `docs/v2/RELEASE-NOTES.md`. What the app does now, newest first: `docs/BUILD-NOTES.md`.

## Run / test

```powershell
cd app
npm run dev                # 5173, uses app/.env (real data — do not test on it)
npm run check              # svelte-check
npm run lint               # prettier --check + eslint
npm run test:unit          # vitest
npm run test:e2e           # 52 desktop tests, own temp DB on 4173 (E2E_PORT to change)
npm run test:e2e:phone     # phone + phone-landscape, 328 tests
```

Against the throwaway QA DB instead of real data:

```powershell
cd app
$env:DATABASE_PATH='../data/qa/app.db'; $env:ORIGIN='http://localhost:4174'
npm run dev -- --host 127.0.0.1 --port 4174 --strictPort
```

Login: `phone` / `dyzw_qid3LlYwGbj` (`data/qa/TEST-LOGIN.txt`). `data/` is gitignored and never pushed.

## Env facts (bit us before)

- Node 22 only. Node 24 breaks the native deps.
- `better-sqlite3` pinned 12.11.1 (13.x has no Windows prebuilds). SvelteKit pinned 2.x.
- Env via `$env/dynamic/private`; dev reads `app/.env`, scripts (`db:seed`, `reset-password`) read `.env` themselves.
- `drizzle/0000_init.sql` is hand-patched (COALESCE index, username NOCASE) — recheck after `db:generate`.
- Migrations 0000–0010, forward-only; boot runs them. Dormant tables stay.
- Cloud sessions push via GitHub app as `Claude <noreply@anthropic.com>`.
- e2e in the cloud container: `PW_CHROME=/usr/bin/google-chrome npx playwright test`.
- E2E and a dev server share `.svelte-kit` — do not run two Vite servers on the same checkout. Different ports are fine; the same checkout is not.

## Architecture

| Layer | Where |
|---|---|
| Pages | `app/src/routes/**/+page.svelte`, `+layout.svelte` (shell, mobile bottom bar, tour, offline badge) |
| API | `app/src/routes/api/**/+server.ts` → repo layer |
| Server | `lib/server/` — `env`, `db`, `auth`, `http`, `access`, `calendar`, `agenda` (Android sync range), `ics` + `icsfeed` (calendar feed), `search`, `reminders`, `push`, `attachments`, `quickadd-server`, `purge`, `seed`, `repo/*` |
| Shared (pure) | `lib/time.ts`, `lib/quickadd.ts` (one parser for client preview + server), `planner-layout.ts`, `planahead.ts`, `colors.ts`, `hours.ts` |
| Client | `lib/client/` — `api`, `toast`, `bus`, `peek`, `layers` (Back stack), `offline` (queue), `prefs`, `mobile.svelte.ts`, `refresh` (only `invalidateAll` caller) |
| Editor | Tiptap (`lib/components/pages/*`, block storage ADR-003) |
| Android | `mobile/` — Capacitor 8; Java in `android/app/src/main/java/io/github/chicenwangs/lifetracker/` (`MainActivity`, `Updater(Plugin)`, `SessionPlugin`, `ThemeBarsPlugin`, `HapticsPlugin`, `Widgets`, `WidgetAction`, `Reminders`, `SyncWorker`, `Native`, `Theme`) |

| Route | What |
|---|---|
| `/` `/today` | day planner + timeline, Now card, week strip, day picker |
| `/week` `/month` | agenda views, swipe, month chips with counts |
| `/item/[id]` | item detail, steps, time blocks, reminders |
| `/keep` | notes, binders, labels, checklist, pin, archive, `?scope=trash` |
| `/pages` `/pages/[id]` | tree, Tiptap editor, `/` menu, internal links, images/files |
| `/pages/graph` | sigma graph + list fallback |
| `/pages/{archive,shared,trash}` | page lifecycle + shares |
| `/settings/*` | account, preferences, notifications, calendar (feed link), sharing, sessions, users, types, import, help |
| `/cal/<token>.ics` | public read-only ICS feed (secret token in the path, no login) |
| `/more` `/trash` | phone browse menu, deleted items/blocks (30 days) |
| `/login` `/signup` `/setup` | auth (invite/open, `SETUP_TOKEN` for first admin) |

API (`app/src/routes/api/`): `attachments blocks calendar database-properties database-records databases database-views graph items item-types keep me native pages page-shortcuts push quickadd reminders search shares trash undo unscheduled`.

## Rules that keep it correct

- Repo layer owns SQL + scoping; routes never build SQL; never trust client user/owner ids.
- One access check for every shared object: `level()` / `need()` in `lib/server/repo/shares.ts`. It returns null for soft-deleted rows — that is why Keep restore is broken (below).
- Item `date`/`time` owner-local; blocks and `*_at` UTC. Never `new Date('YYYY-MM-DD')` for a day key.
- No behaviour keyed on a type *name* — use `item_types` flags.
- New setting default = old behaviour. Undo journal for every mutation.
- Phone: layout < 700 px or coarse pointer ≤ 500 px height; 48 dp targets; one bottom sheet; Back closes the top layer; no desktop wording.
- Docs: `AGENTS.md` → this → `BUILD-NOTES.md` → `v2/PRD`/`FEATURES`/`DESIGN`. When docs disagree: code > BUILD-NOTES > TECHNICAL > REQUIREMENTS.

## Known issues (re-verified 2026-11-23, QA pass of release/3.1.2)

1. `/pages/graph` logs an unhandled `Sigma: Container has no width` at phone width (graph still renders).
2. Theme e2e test is invalid between 23:59 and 00:00 (it sets Light 00:00 / Dark 23:59).
3. Offline testing on `vite dev` can show a stale service-worker cache (old rows, dead hydration). Use a built server.

## Product decisions worth keeping

- Out of this app: Places, Lists, People, Ideas, Workouts — their own services/subdomains; their data was folded into Keep via Settings › Account. Dormant tables `goals`, `courses`, `items.course_id` stay until a rebuild migration.
- Sharing is view/edit, never live co-edit (409 keeps text, ADR-008). Calendar sharing is by swap code, view-only.
- Keep and Pages are separate products on purpose: Keep = quick notes; Pages = long-form wiki + databases.
- Group/trip features stay in Keep binders; no new module.

## Open owner decisions

`docs/REVIEW.md` §Open — mostly Notion-import data cleanups (type oddities, duplicate places, stale "doing" items, movies in Date ideas). Do not bulk-close without the owner.
