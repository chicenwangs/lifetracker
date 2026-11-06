# P1 build notes — 2026-11-06

Caveman doc. What got built, where it differs from spec, what is left.

## Done (REQUIREMENTS §6 P1)

| Acceptance | How checked |
|---|---|
| Fresh DB → /setup → admin, then 404 | e2e 1, unit setup |
| Remember ON Max-Age / OFF session cookie, idle 12 h | e2e 2, unit session expiry |
| 5 bad passwords → locked msg with minutes | e2e 3, unit login |
| Import counts match `_report.json`, 2nd run no change | unit seed (fixture). **Run on your real data once** |
| Month colour blocks, square cycles + persists | e2e 4 |
| Planner drag 13:00–14:30, resize 14:45, 23:00–06:00 both days | e2e 5, unit time |
| Drag DS Quiz chip → linked red block | e2e 6 |
| Quick add `ds quiz fri 2pm !exam #ds` | e2e 7, unit table (43) |
| reset-password script | e2e 8 |

Tests: `npm run test:unit` (103) · `npm run test:e2e` (8, needs `npx playwright install chromium` once).

## Differs from spec (on purpose)

- **SvelteKit 2.70 pinned.** npm default now 3. Spec locks 2.
- **better-sqlite3 12.11.1 pinned.** 13.0.3 shipped no prebuilt binaries → Windows needs C++ compiler.
- **`quickadd.ts` lives in `lib/`** not `lib/server/` so the client preview can import it. Still pure.
- **Env read via `$env/dynamic/private`** (dev loads `app/.env`). CLI scripts read `.env` themselves.
- **`end_date` needs `date`.** Spec CHECK `end_date >= date` passes when date NULL; ours blocks it.
- **Migration SQL hand-patched** (`drizzle/0000_init.sql` top comment): COALESCE index + username NOCASE. Check after any `db:generate`.
- **Seed re-import:** items/blocks refresh only rows not edited in app (`updated_at`). Other tables insert-if-missing (no `updated_at` to compare), so app edits there always win.
- **Month view:** timed items show as chips with time prefix (not in time slots). Week view has the time grid.
- **Week view:** blocks live in the time grid (drag/resize 15 min). Items sit in the all-day row. Drag item from right panel onto a time = 60-min linked block (and sets date if unscheduled). Empty-slot drag asks label with a prompt.
- **Trash page** built now (P2 in spec) since item delete exists.

## Left for P2 (not built)

Sharing + overlap (access.ts filters, share keys, grants, overlap toggle, lanes), invites UI (backend + /signup done), Settings > Users / Import UI, search UI (FTS index built on import), Places / Lists / People / Ideas / Workouts pages, self-hosted Inter font.

## Known small things

- Google Fonts is the only external call (NFR-4; self-host in P2).
- `prompt()` for week-view new block label. Replace with inline input later.
- Month drag of a multi-day item keeps its span. Resize of span = edit item page.
