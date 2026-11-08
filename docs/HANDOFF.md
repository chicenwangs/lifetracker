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

Parked pseudocode stubs (not planned in this app): `places-logic.ts`, `workouts-logic.ts`, repo `places/lists/people/ideas/workouts`, those routes + APIs. Later: `ics.ts`, `/search`, `/settings/{invites,import}`.

Dormant (data kept, no code uses it): DB tables `goals`, `courses`, column `items.course_id`. A drop migration needs an `items` rebuild (FK).

## Next (plan rev 2026-11-08)

Ship first, users after. No new modules.

1. **Stage B, homelab:** Docker compose on Ubuntu, /setup, import, nightly backup + test restore (DEPLOYMENT B).
2. **Stage C, Cloudflare Tunnel:** `lt.<domain>`, no LAN port (DEPLOYMENT C). Self-host Inter before going public.
3. **Then involve users:** Neina signs up on her device, swap share codes. Switch sign-up to Invite only once everyone is in.
4. **Test the core loop + sharing together** for about a week on real devices. Log issues, fix them. P2 acceptance in REQUIREMENTS §6.

Out of this app: Places, Lists, People, Ideas, Workouts. If built, each is its own service on its own subdomain (`places.<domain>` etc.). Their stubs stay parked in the repo; import still loads their data. Search, calendar feed, edit grants, planner lanes = later (P3).

## Open owner decisions (REVIEW.md "Open")

Type oddities to retype, duplicate places to merge, 4 stale "doing" items, movies in Date ideas, missing place data.
