# HANDOFF — read first in a new chat

Caveman doc. State as of 2026-11-08. Repo `github.com/chicenwangs/lifetracker` (private), branch `main`. PC copy `Desktop\life-tracker`.

## State

- P1 built and in daily use on Jeremy's PC (Stage A, localhost:5173). Real Notion data imported.
- Since P1: UX rounds 1–5, Goals + Courses removed, open sign-up, calendar sharing by code (view-only). Details: `P1-NOTES.md`.
- Tests: 237 unit (`npm run test:unit`), 14 e2e (`npm run test:e2e`). Lint, prettier, svelte-check clean.
- When docs disagree: P1-NOTES > TECHNICAL > REQUIREMENTS. TECHNICAL top banner lists the overrides.
- Read order for coding: README → this → P1-NOTES → REQUIREMENTS → TECHNICAL.

## Env facts (bit us before)

- Node 22 only. Node 24 breaks native deps.
- `better-sqlite3` pinned 12.11.1 (13.x has no Windows prebuilds). SvelteKit pinned 2.x.
- Env via `$env/dynamic/private` (dev reads `app/.env`). Scripts (`db:seed`, `reset-password`) read `.env` themselves.
- `drizzle/0000_init.sql` hand-patched (COALESCE index, username NOCASE). Recheck after `db:generate`.
- Cloud sessions push via GitHub app as `Claude <noreply@anthropic.com>`.
- e2e in the cloud container: `PW_CHROME=/usr/bin/google-chrome npx playwright test`.

## Code map

| Area | Files |
|---|---|
| Boot/guard | `hooks.server.ts`, `lib/server/{env,db,purge}.ts` |
| Auth + sign-up | `lib/server/{auth,crypto,ratelimit,setup,invites}.ts`, routes `login signup setup logout`, `AuthShell`, `AppIcon` |
| Data | `lib/server/repo/{users,calendars,sessions,items,blocks,sharekeys,grants,meta}.ts`, `lib/server/{calendar,access,seed,search,quickadd-server,http,validate}.ts` |
| Shared | `lib/{time,quickadd,types,colors,hours,planner-layout,planahead}.ts`, `lib/client/{api,toast,bus,peek,prefs,hours,remove,partner}` |
| UI | `MonthCalendar`, `WeekCalendar`, `WeekMap`, `DayPlanner`, `DraftBlock`, `RollHandle`, `QuickAdd`, `CommandInput`, `SlotCommand`, `TimelinePreview`, `ItemPeek`, `ItemView`, `OverlapToggle`, `AppHeader`, `StatusSquare`, `UndoToast`, `Markdown` |
| Pages | `/` `/week` `/item/[id]` `/trash` `/settings/{account,preferences,sessions,sharing,users}` |
| API | `/api/{calendar,items,blocks,trash,unscheduled,quickadd,me/prefs,share-keys,share-keys/redeem,grants}` |

Still pseudocode stubs: `ics.ts`, `places-logic.ts`, `workouts-logic.ts`, repo `places/lists/people/ideas/workouts`, those routes + APIs, `/settings/{invites,import}` pages, `/search` page.

Dormant (data kept, no code uses it): DB tables `goals`, `courses`, column `items.course_id`. A drop migration needs an `items` rebuild (FK).

## Next (order)

1. DEPLOYMENT Stage B: homelab Docker + backups. Then Stage C (Cloudflare Tunnel) so Neina can sign up from her device.
2. Self-host Inter (Google Fonts is the only outside call).
3. Places → Lists → People → Ideas → Workouts (REQUIREMENTS §4.6–4.10).
4. Search page (FTS index already built on import).
5. Settings > Import UI.
6. Sharing extras if wanted: edit grants (FR-S16/S18), planner lanes "Me | name" (FR-S12), read-only partner card on `/item/[id]`.

## Open owner decisions (REVIEW.md "Open")

Type oddities to retype, duplicate places to merge, 4 stale "doing" items, movies in Date ideas, missing place data.
