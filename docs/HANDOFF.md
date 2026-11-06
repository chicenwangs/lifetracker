# HANDOFF — read first in a new chat

Caveman doc. State as of 2026-11-06. Repo: `github.com/chicenwangs/lifetracker` (private). PC copy: `Desktop\life-tracker`.

## State

- **P1 done + working on Jeremy PC** (Stage A, localhost:5173). Real Notion data imported.
- Tests: 139 unit (`npm run test:unit`), 11 e2e (`npm run test:e2e`). Lint + svelte-check clean.
- Quick add = N palette (2026-11-06): `/type title /calendar|/planner day time` any order, slash menu, errors on Enter, `/planner` = item + linked block. Spec REQUIREMENTS §4.3, TECHNICAL §8.
- Read order for coding: README → REQUIREMENTS → TECHNICAL → P1-NOTES (spec deviations) → this.

## Env facts (bit us before)

- Node **22** only (winget `OpenJS.NodeJS.22`). Node 24 breaks native deps.
- `better-sqlite3` pinned **12.11.1** (13.0.3 has no Windows prebuilds). SvelteKit pinned **2.x**.
- Env loads via `$env/dynamic/private` (dev reads `app/.env`). Scripts (`db:seed`, `reset-password`) read `.env` themselves.
- Migration `drizzle/0000_init.sql` hand-patched (COALESCE index, username NOCASE). Recheck after `db:generate`.
- Claude cloud session pushes via GitHub app; commits authored `Claude <noreply@anthropic.com>`.

## Code map (built)

| Area | Files |
|---|---|
| Boot/guard | `hooks.server.ts`, `lib/server/{env,db,purge}.ts` |
| Auth | `lib/server/{auth,crypto,ratelimit,setup,invites}.ts`, routes `login signup setup logout` |
| Data | `lib/server/repo/{users,calendars,sessions,items,blocks,courses,goals,meta}.ts`, `lib/server/{calendar,seed,search,quickadd-server,http,validate}.ts` |
| Shared | `lib/{time,quickadd,types,colors}.ts`, `lib/client/{api,toast,bus,obj}` |
| UI | `MonthCalendar` (FC dayGrid), `WeekCalendar` (FC timeGrid), `DayPlanner` (custom), `StatusSquare`, `QuickAdd`, `AppHeader`, `DueTodayChips`, `GoalsPanel`, `UndoToast`, `Markdown` |
| Pages | `/` `/week` `/item/[id]` `/settings/{account,sessions,courses,goals}` `/trash` |
| API | `/api/{calendar,items,items/:id(+cycle),blocks(+cycle),courses,goals,trash,unscheduled,quickadd,me/prefs}` |

Still pseudocode stubs: `access.ts`, `sharekeys.ts`, `ics.ts`, `places-logic.ts`, `workouts-logic.ts`, repo `grants/places/lists/people/ideas/workouts/invites/sharekeys`, P2 routes + API.

## Phase 2 plan (order)

Gate: P1 used daily ~1 week first (REQUIREMENTS §3). Do DEPLOYMENT Stage B (homelab Docker + backups) in that week.

1. **Access layer** — `access.ts` (listAccess, assertCanWrite, filterItem/filterBlock, busyId), grantee PATCH schema. Unit leak tests first (TECHNICAL §7).
2. **Sharing** — share keys (make/redeem/revoke, HMAC, 60 bits, single use), grants, `/settings/sharing` (DesktopSharing.dc.html). Calendar API returns `others[]`.
3. **Overlap UI** — toggle (FR-S10, saved server), partner chips striped + badge (FR-S11), planner lanes Me | Neina (FR-S12), edit-grant writes + `updated_by` (FR-S16/S18), read-only partner card on `/item/[id]`.
4. **Invites UI + Users + Import UI** — `/settings/{invites,users,import}` (backend for invites/signup already done).
5. **Places** — filters, open-now (Night 17–02 prev-day rule), pick random, stars, Been here, dup warn.
6. **Lists** — checklist, reorder, Plan as a date.
7. **People** — fact cards, Plan it (private=1), side panel. Never shared.
8. **Ideas** — 4-stage board, channel filter, >70 warn.
9. **Workouts** — split, today panel, log session, 4 ISO weeks progress.
10. **Search** — FTS sync in repo helpers + `/search` grouped.
11. Self-host Inter font. Nav shows new pages as they ship.
12. **P2 acceptance** (REQUIREMENTS §6) as e2e: Neina signup → key → overlap filters (no hidden titles in network JSON) → private = Busy → revoke → 404 on every Jeremy private-module id.

Then Stage C (Cloudflare Tunnel) so Neina can log in from her device.

## Open owner decisions (REVIEW.md "Open")

Type oddities to retype, duplicate places to merge, 4 stale "doing" items, movies in Date ideas, missing place data, undrawn wireframes (setup/settings/import — built plain, fine).
