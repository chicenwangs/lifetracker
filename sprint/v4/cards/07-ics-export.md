# Card 07 · feat: ICS export

- Source: BREAKDOWN PR 7 (lines 49–56) · PLAN §3B (lines 93–96), §5 item 2 (line 178), §7 item 4 (line 236), §8 PR 7 (line 257) · DESIGN §0 (lines 9–15; no board for this screen) · decisions O-1 item 4, D-V4-08, D-V4-25, D-V4-37
- Needs: 05 · Size: M · Branch: `v4/07-ics-export`

## What

A read-only calendar feed per user, so the plan shows in Google or Apple Calendar. Settings › Calendar feed (Planner group, every signed-in user) makes one URL, returned once by the form action's `form.url`; `GET /cal/<token>.ics` needs no login and serves the user's own items for today −30 d … today +365 d as **one VEVENT per series**, with RFC-valid RRULE + EXDATE, timed values as UTC instants, private items as "Busy", and nothing from a calendar shared with the user. Rotate kills the old URL; Turn off deletes the feed. `users.ics_token_hash` already exists (`app/src/lib/server/schema.ts:57`), so no migration.

Owner decisions that apply: **O-1** item 4 (private items export as "Busy", own items only), **D-V4-25** (series grouping, RFC 5545 encoding, no token in a log, form-action URL, `maxDays`, bare 404, `/cal/` CORP exemption, Planner group).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Settings has a `Calendar feed` section at `/settings/calendar-feed`, added as one row to `SECTIONS` in `app/src/lib/settings-sections.ts` in the **Planner** group with no `admin` flag, so it appears in the desktop side nav and the phone Settings list (`/settings`). Never created: the line "No feed yet. Create a link to see your plan in another calendar." + `Create feed link`. Created: "Feed is on. Anyone with the link can read your items." with `Rotate` + `Turn off`, and no URL (shown once, C3).
- C2 `Create feed link` mints a random 32-byte token, stores only its SHA-256 hex in `users.ics_token_hash`, and returns the full URL `<ORIGIN>/cal/<token>.ics` in that one form-action response only (`form.url`, the `?/` submit-action pattern the sharing page uses) — the plain token is never stored in the DB and never written to a log (C5); a reload shows that a feed exists without the URL.
- C3 The one-time panel shows the URL with `Copy` (writes it to the clipboard and flips to "Copied", same pattern as the share code at `app/src/routes/settings/sharing/+page.svelte:43-55`), `Rotate` and `Turn off`.
- C4 `Rotate` replaces the hash with a new token and shows the new URL once (the old URL is dead, C5); `Turn off` sets `users.ics_token_hash = NULL`; both survive a reload and are confirmed by fetching the old/new URL.
- C5 `GET /cal/<token>.ics` works with no session cookie: `/cal/` is added to `PUBLIC` in `app/src/hooks.server.ts:36` and exempted from the global `Cross-Origin-Resource-Policy: same-origin` (`hooks.server.ts:96`) so a calendar app can fetch it. A hit is `200` with `Content-Type: text/calendar; charset=utf-8` and `Cache-Control: private, max-age=300`. A malformed, unknown or rotated token — and any internal failure while building the feed — all return one `404` with a bare JSON body (no message, no token echo), never a calendar body and never a 500: the route catches every error itself, so no failure reaches `handleError` (`hooks.server.ts:111-117`, which logs `event.url.pathname` — that path contains the token).
- C6 The feed contains only the signed-in user's own default-calendar items returned by `agenda(me, addDays(today, −30), addDays(today, 366), { maxDays: 400 })` (card 05; the range is `[from, to)`, so it ends today +365), with `hidden_types` already applied inside `agenda`. `agenda` gains the `maxDays` option with the old 62 as its default (card 05 C6 unchanged), and `getCalendar`'s 62-day cap (`app/src/lib/server/calendar.ts:19`) is not touched. `ROW_CAP` still applies. No blocks, no items from calendars shared with the user (even with `overlapOn` on), no partner rows.
- C7 All-day items are `DTSTART;VALUE=DATE:<date>` with `DTEND;VALUE=DATE:<end_date + 1 day>` when `end_date` is set (`end_date` is inclusive, ICS `DTEND` is exclusive); a timed item keeps its `time` and its UTC mapping.
- C8 A repeating item is **one VEVENT for the whole series**: `toDTO` gains `exdates` (`ItemDTO`) so the agenda row carries each stored local date, and the route groups the agenda rows by `seriesId ?? id`, emitting one VEVENT per group with `DTSTART` = the group's `seriesDate` (a one-off: its `date`). `RRULE` keeps only `FREQ`, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `UNTIL`, `COUNT`; `UNTIL` is `UNTIL=YYYYMMDD` for an all-day series and a UTC `...T{time}Z` instant for a timed series. One `EXDATE` line per stored exdate: `EXDATE;VALUE=DATE:YYYYMMDD` for an all-day series, `EXDATE:<UTC instant>Z` for a timed series (the stored values are the user's local dates).
- C9 Timed items use UTC instants, `DTSTART:<YYYYMMDDTHHMMSSZ>` and `DTEND:<YYYYMMDDTHHMMSSZ>`, with no `TZID` and no `VTIMEZONE` (D-V4-08); the length is 60 minutes, or the length of the earliest linked planner block (`blocksRepo.forItem`) when there is one. `UID` = `<seriesId>@lifetracker` — never the expanded `id@date`. `DESCRIPTION` is the public item's `notes`, read with one batched `itemsRepo.notesFor(ids)` call for all exported series (never one query per item, D-V4-37); a private item is `SUMMARY:Busy` with no `DESCRIPTION`.
- C10 Text is valid ICS: `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID` / `END:VCALENDAR`, text escapes `\`, `,`, `;` and newlines, and every physical line is folded at 75 octets with a leading space.
- C11 Unauthenticated requests are rate-limited per client IP through `app/src/lib/server/ratelimit.ts` (`ipKey`, every request counts); over 120 requests per 15-minute window returns `429` with no feed body (D-V4-08).
- C12 Phone path: the section is reachable from the phone Settings list under Planner; `Copy`, `Rotate` and `Turn off` are ≥ 48 dp, Back returns to Settings, and the page has no "Click"/"Ctrl"/key-hint copy. No BottomSheet is needed because the URL is shown inline, not in a popover.
- C13 Undo: Create/Rotate/Turn off change `users.ics_token_hash`, which the undo journal excludes on purpose (`app/src/lib/server/undo.ts:11` — "Never sessions, users, grants, share codes"), so there is no undo toast; the page's own Rotate/Turn off are the reversals.
- C14 States (DESIGN §3): empty = the one short empty-state line from C1 + `Create feed link`; loading = the server-rendered section, no skeleton and no spinner; error = inline `.alert` with the server message + `Retry` for a failed Create/Rotate/Turn off, never a toast; the feed route itself is a machine response with no UI state.
- C15 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§3 planner), `docs/SERVICE-HANDOFF.md` (a public unauthenticated GET `/cal/<token>.ics`, rate-limited, no outbound call, no new env var; calendar apps re-fetch on their own schedule, the 5-minute cache is the minimum).

## Out of scope

- Blocks as events (BREAKDOWN line 53 says "not exported"; D-V4-08 keeps them out).
- Shared or partner calendars, and per-feed type filters.
- Subscribing to a URL (server fetching an outside `.ics`) — that is card 11 territory in reverse and PLAN §3C line 124 defers URL import.
- CalDAV write access, event colours, alarms (`VALARM`), `X-WR-CALNAME`.
- A migration: the token column is already there.

## Files likely touched

- `app/src/routes/settings/calendar-feed/+page.svelte` (new), `+page.server.ts` (new: `create` / `rotate` / `off` actions returning `form.url`)
- `app/src/lib/settings-sections.ts` (new row, `group: 'Planner'`)
- `app/src/routes/settings/sharing/+page.svelte` (Copy + "shown once" pattern)
- `app/src/routes/cal/[file]/+server.ts` (new; `<file>` = `<token>.ics`)
- `app/src/hooks.server.ts` (`PUBLIC` line 36; `/cal/` exempt from the CORP header at line 96)
- `app/src/lib/server/ics.ts` (new: the pure ICS builder + series grouping)
- `app/src/lib/server/agenda.ts` (new in card 05; gains the `maxDays` option)
- `app/src/lib/server/repo/items.ts` (`toDTO` 43–65 gains `exdates`; `inRange` 108–164 already sets `seriesId`/`seriesDate`; new batched `notesFor(ids)`)
- `app/src/lib/types.ts` (`ItemDTO.exdates`)
- `app/src/lib/server/repo/users.ts` (token hash get/set; `safe()` does not expose it)
- `app/src/lib/server/repo/blocks.ts` (`forItem`, line 87)
- `app/src/lib/server/crypto.ts` (`sha256hex`; add the 32-byte token)
- `app/src/lib/server/ratelimit.ts` (`ipKey`, `check`, `fail`)
- `app/src/lib/server/schema.ts` (`icsTokenHash` is already present)
- `app/tests/unit/v4-07-ics.test.ts` (new), `app/tests/e2e/v4/07-ics.spec.ts` (new), `app/tests/e2e/phone/v4-07-ics.spec.ts` (new)

## Tests

- Builder: unit ICS text in `app/tests/unit/v4-07-ics.test.ts` — escaping of `\`, `,`, `;` and newlines, 75-octet folding, all-day, multi-day, a repeating series collapsing to one VEVENT (grouped by `seriesId`/`seriesDate`), `UNTIL`/`EXDATE` in both the all-day (`VALUE=DATE`) and timed (UTC `Z`) encodings, UTC instants, Busy/private with no DESCRIPTION, `DESCRIPTION` = notes for a public item via one batched `notesFor` call for N series, UID = series id, and the identical 404 body for unknown/malformed/rotated and for a forced internal failure. Desktop e2e create link → fetch without the session cookie → contains the item → rotate → old link is 404, in `app/tests/e2e/v4/07-ics.spec.ts`; phone settings + Copy in `app/tests/e2e/phone/v4-07-ics.spec.ts`.
- Blind (tester, from Done when only): `app/tests/e2e/v4/07-blind.spec.ts`, `app/tests/e2e/phone/v4-07-blind.spec.ts`, `app/tests/unit/v4-07-blind.test.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§3 planner), `docs/SERVICE-HANDOFF.md` (public route + no new outbound calls).

## Decided

- Decided: D-V4-08 — new `Calendar feed` Settings section; UTC `...Z` times, no VTIMEZONE (PLAN §3B allows it); per-IP rate limit 120 per 15 min; blocks not exported; earliest linked block's length; this card raises the agenda range limit for −30…+365 days (ROW_CAP still applies).
- Decided: D-V4-25 — `toDTO` gains `exdates` and the feed groups by `seriesId`; all-day `UNTIL=YYYYMMDD` / `EXDATE;VALUE=DATE`, timed UTC `...Z`; the route catches every error and returns 404 so no token reaches `handleError`; the one-time URL rides a form action (`form.url`), never stored; `agenda` gains `maxDays` and the feed asks 400; 404 bare JSON only; UID = `seriesId`, DTSTART = `seriesDate`; DESCRIPTION = `notes` for public items, none for private; `/cal/` exempt from CORP; section in the Planner group for every user.
- Not a change: finding 12 (file paths) — `app/src/lib/server/ics.ts` and `app/src/routes/cal/[file]/+server.ts` are new; every other path in the Files list exists as written.
- Decided: D-V4-37 — `DESCRIPTION` comes from one batched `itemsRepo.notesFor(ids)` lookup for the exported series, never one query per item.
