# Build notes — what the app does now

Caveman doc. Was P1-NOTES.md (renamed in v2 P1). Wins over REQUIREMENTS + TECHNICAL where they differ. History is in git log.
Newest first. Latest release = v3.1.2 (2026-11-24; v3.1.1 + v3.1.0 2026-11-20, v3.0.0 2026-11-18). Sections below cover v2 phases, then the v1.1.0 state from 2026-11-08. Live was last verified at v3.0.0 on 2026-11-19. Read `AGENTS.md` for current bugs.

## v4.0.0 (in progress, 2026-11-26 →)

- Repeat from completion (card 09, O-9, O-11, D-V4-10, D-V4-27): the item sheet's Repeat box has `Next one counts from` → `Scheduled date` (default) or `When I finish it`, shown only for a `DAILY` or `MONTHLY` rule with no `BYDAY`, no `UNTIL` and no `COUNT` (a weekly rule always carries BYDAY, so it never qualifies; O-9). Choosing it saves `items.repeat_from_completion` through the normal PATCH (one undo entry), a PATCH that stops qualifying clears the flag in the same edit, and a from-completion series never asks the this/following/all dialog — the whole row is edited. The summary under the box reads "Daily, counted from when you finish" / "Every 3 days, counted from when you finish". The series appears exactly once, at its stored date, in Month, Week, Today, due chips, `/month`, widgets and `id@date` (every other `@date` is 404); old EXDATEs stay stored and dormant. Finishing it (row tick, item sheet or a reminder's Done) files a done copy dated today in the owner's timezone (series title, type, private flag, time, notes and span; no rule/UID/EXDATEs/flag) and moves the series to today + the interval (monthly clamped, `end_date` shifted by the same delta), back at `todo` with `completed_at` cleared (O-11); both rows are one undo entry that restores the old date and deletes the copy. Reminders: an open relative one recalculates from the new date, `recalcOwner` runs on both PATCH and `/cycle`, a fired reminder is recreated for the new date, exact-time ones stay put and `advanceRepeating` does nothing for these series. A completion cancels the finished occurrence's other exact (or snoozed) reminders in the same undo entry, so Done on one later is a 404 and files no second copy; an API completion request that omits `seenDate` still completes but keeps the old reminder set (the optional-seenDate residual — every UI path sends the date). An overdue series slips (card 04); the ICS feed writes one VEVENT at its date with no RRULE/EXDATE (card 07). Normal repeats: finishing one occurrence now leaves the series at `todo` (O-11).
- Migration 0011 (card 08, D-V4-09, D-V4-26): four ADD COLUMN columns and no behaviour — `items.repeat_from_completion` (0), `items.ics_uid` (NULL, with a partial UNIQUE index on `(calendar_id, ics_uid)` for live rows only), `item_types.on_calendar` (1) and `users.digest_time` (NULL = off, loose `HH:MM` CHECK); no table rebuild, so old rows keep the old behaviour. The `items_source` CHECK still allows only `'notion'`.

- Calendar feed (card 07, O-1 item 4, D-V4-08, D-V4-25, D-V4-37): a read-only ICS link per user. Settings › Calendar feed (Planner group, every signed-in user) makes one URL, returned once by the form action (`form.url`) with Copy / Rotate / Turn off; only the token's SHA-256 is stored (`users.ics_token_hash`, no migration), a reload only says a feed exists, Rotate kills the old URL and Turn off deletes it. `GET /cal/<token>.ics` needs no session (in `PUBLIC`) and is exempt from the same-origin CORP header; it is rate-limited per client IP (120 per 15 min, every request counts) and returns `404 {}` for unknown/malformed/rotated tokens and for any internal failure — the route catches every error itself, so the token never reaches `handleError`'s path log. The body is the user's own default-calendar items from today −30 to today +365 (`agenda(..., { maxDays: 400 })`, `hidden_types` applied, no blocks, no shared or partner rows), one VEVENT per series: all-day `VALUE=DATE` with an exclusive `DTEND` on a span, timed values UTC `...Z` (60 minutes, or the earliest linked block's length), `RRULE` with only FREQ/INTERVAL/BYDAY/BYMONTHDAY/UNTIL/COUNT (`UNTIL` as `YYYYMMDD` all-day, UTC instant timed), one `EXDATE` per stored date in the same encoding, `UID: <seriesId>@lifetracker`, private items `SUMMARY:Busy` with no DESCRIPTION, public notes as DESCRIPTION from one batched `itemsRepo.notesFor` lookup, TEXT escaped and every line folded at 75 octets. Create/Rotate/Turn off sit outside the undo journal, so no toast; a failed action shows its message inline with Retry. The service worker never caches `/cal/`, so Rotate/Turn off take effect at once even offline; a disabled account's feed is `404` (disabling clears `users.ics_token_hash`).
- Print week (card 06, D-V4-07, D-V4-18): a desktop `/week` `⋯` with one item, `Print week`, calls `window.print()`; no entry on phone. `@media print` (shell rules in `app.css`, week layout scoped to the page, event colours in `WeekCalendar.svelte`) hides the header, phone tab bar, toolbar buttons, `TypeBar`, right rail, gesture/foot hints and toasts, keeps the date-range title, prints black on white in light and dark with the type colour only as a 3 px left border, and forces the 7-column grid at any width (hide `.phone`, show `.wrap`), so a phone-width print is not blank; the grid re-measures when print media turns on and the default 07:00–24:00 rows shrink so the bar, day header and time grid fit one A4 landscape sheet (a long all-day list is not capped and can add a page). `@page { size: A4 landscape }`. No data or request change, so no undo entry; an empty week prints as an empty grid.
- Slipped (card 04, D-V4-05, D-V4-17, O-1, O-4, O-10): `itemsRepo.slipped(me, today)` = own, live, top-level one-off items with `COALESCE(end_date, date)` before today, todo/doing, hidden types out (untyped = `None`), newest first, 50 shown + `N more` and the true total in the header. A collapsible **Slipped · N** strip sits at the top of the Home planner column and the top of `/today`; expanded everywhere, collapsed only on phone landscape. Row: tap = item sheet, `⋯` = the shared `ActionSheet` with the card 03 list (no `Skip this one`: repeats never slip), phone swipe right = done / left = delete with Undo. `Move all to today` = one `POST /api/items/move-all`, one `undoable()` batch over every matching row (not just the 50), time kept and a multi-day span moved; offline/errors show the usual toast, nothing is queued. On phone, while a `BottomSheet` is open the global toast sits 8 px above the sheet's top edge (clamped so it stays on screen on a short landscape screen); desktop keeps it at the bottom (O-10).
- Reschedule (card 03, D-V4-04, D-V4-16): one list — Today · Tomorrow · Next weekday · +1 week · Pick date… — beside the Date field in the item sheet (desktop + phone) and in the phone Today row ⋯ sheet. `Skip this one` on a repeating occurrence (one EXDATE, no new row). Postpone keeps the time, moves a multi-day `endDate` by the same span and (on `id@date`) detaches that one occurrence with no scope dialog; one toast names the earliest linked block's day; Undo restores both dates and closes the item sheet when Undo deleted the row it showed. Offline: postpone queues ("Waiting to sync"), Skip only toasts. Undated items hide Postpone.
- Keep: Restore from Trash works (BREAKDOWN PR 1, D-V4-02).
- Phone Add sheet: rapid taps after "Save note" no longer reach the row underneath (#378, 250 ms tap shield, Undo toast exempt).
- Phone status squares: rapid taps on a row's square no longer change another row (the list re-renders after the first tick); Home, Today and the item sheet tick once (#379, same shield, raised before the POST).
- Keyboard hints render only for `pointer: fine` (D-V4-03, D-V4-15): no `Ctrl`/`Click`/`Esc`/`PC view`, no QuickAdd footer, no `N` hint on a touch screen or phone, in the header, sheets, item sheet, palette, "/" menu and page toolbar. `noDesktopHints` also flags `double-click`/`right-click`.

## v3.1.2 patch (2026-11-24, milestone 3.1.2, QA-loop bugs #272–#313, #324, #348, #362–#364, #375)

- Offline: sign-out keeps queued edits if it fails and waits for a pending notes autosave; Keep create/Retry is idempotent; a 409 offline note edit becomes an "(offline copy)" note; Home ticks + desktop quick add queue offline; quick add typed at session expiry is sent after sign-in.
- Item page: the address follows the row on screen through the router (`goto`, not a raw `replaceState`), so a "This and following" or "This item" edit never 404s on the next refresh. Undo of a split moves the sheet back to the row it came from (`sessionStorage` `lt.cameFrom.<id>`, survives a reload). One module-level `nav` promise is shared by every ItemView, so the instance the `{#key}` remount retires waits for the address change; a retired instance (`gone`) stays quiet on load failure (#375).
- Phone rows: action sheets build their actions from a plain value (`actionsFor(x)`), never from state the sheet clears on close.
- Keep checklist on phone: the `⋮⋮` handle is a named 48 dp button; tap = sheet with Move up / Move down / Indent / Outdent, drag unchanged. Desktop keeps it out of Tab order (`tabindex=-1`, `aria-hidden`).
- Help › Quick add lists the repeat grammar (`every …`, `until <date>`, `for N days|weeks|months|years`) on desktop and phone.
- Undo note: no `Ctrl+Z` key hint on phone. Phone 48 dp e2e check rounds sub-pixel sizes.

## Owner test pass (2026-11-16, 3-day test list, issues #61–#86)

- Pages: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z on a page = editor history, also after a toolbar click (toolbar keeps focus; capture key handler beats the app-wide server undo). Column 1100 px, text 17 px on ≥ 1024 px. Title `autocomplete=off`.
- Header pins: no page icon; faint `|` before each pin.
- Keep: note dialog 960 px / 90 vh, title 22 px, text 17 px on ≥ 700 px. Inputs `autocomplete=off` (no browser form history). N does nothing while any `aria-modal` dialog is open. Checklist rows: `⋮⋮` handle (mouse + touch): drag up/down = reorder among siblings, sideways ≥ 40 px = indent/outdent. Keys: Alt+↑/↓ move, Tab / Shift+Tab indent, Enter new line. Touch hides ↑↓→← buttons; × on the focused row.
- Calendar chips (Month, Week, phone week): title wraps to 2 lines (`line-clamp`, FC nowrap undone). Delete ✕ circle filled with the chip colour (`--x-bg`), so it reads in dark. Tick pop plays only on the square just ticked, once (`.lt-sq.on.pop`; re-feeds re-create all squares).
- Dark: every `--pill` fill pairs with `--pill-ink` (code blocks, page links, link picker, page menu, DB pills + type buttons, Ctrl+K row, phone Add tabs).
- Quick add: **no /type = No type** everywhere (owner; ★ default removed from Type bar + Settings › Item types, `is_default` column dormant, a starred custom type can be deleted). Shared `QASlots` (Type · Title · Goes to · Day · Time · Remind) under the N palette, the drag/day popups and the phone Add sheet. Drag/day popups = palette look (big input, 460 px). Ghost hint follows the input's sideways scroll. `/` list opens upward when the visual viewport has no room below (phone keyboard).
- Phone Today: "To do today · no time set" card removed (and the give-a-time sheet). Hold a timeline row ~0.5 s = delete + Undo toast; moving > 10 px cancels; the ending tap is swallowed.
- Android: "To do today" widget removed (6 widgets). `/api/native` still sends `todos` for older installs.
- Settings › Users: Storage column = uploaded files per person vs `UPLOAD_QUOTA_BYTES` (`usageByOwner`, same rule as the quota check).
- Was parked here, now shipped: phone tour (P8, welcome tour once + Settings › Help), repeating items + default reminders (#72, #73, v3.0.0).

## Security hardening (2026-11-16, audit of v2.0.4, issues #22–#59)

- Push: only browser push hosts (`pushHostOk`, port 443), 10 s send timeout, 10 devices per user, test send 5 per 15 min, endpoint can't be taken by another account without its keys. Stuck reminders count as a try (crash can't loop). 500 waiting reminders per owner.
- Sign-in: `safeNext` re-checks the parsed path (`/.//x` → `//x`). Username-wide login limit charged before the argon2 await (parallel IPs). Password change serialised per user. New installs: setup writes `signup_open=0` (old installs keep theirs). Invite code checked before the username. Admin Disable (null hash + all sessions gone).
- Shared content: link marks only `target=_blank`, `rel` from noopener/noreferrer/nofollow, no `class`. Database block id must be `pdb_…`. Option colours `[a-z0-9-]` (and DbCell falls back). An editor keeps only the owner's files the page already had. Record page creation needs edit. Share-by-username: 10 unknown names per 15 min.
- Limits: chunked writes without Content-Length → 411. `UPLOAD_QUOTA_BYTES` (2 GB). Share codes: 50 made per day, purged 30 days past expiry. Compose limits (app: memory + 2 CPUs + pids; cloudflared: memory + pids, no CPU cap); cloudflared read-only, caps dropped, dated tag default (2026.10.7).
- Headers: HSTS (https only), COOP + CORP same-origin.
- Ops: release APK job — npm runs without the signing key or token. backup/restore refuse symlinks under `data/`; restore extracts only plain files under `uploads/`, not as their owner. Optional `age` encryption (`LT_AGE_RECIPIENT` / `LT_AGE_IDENTITY`).
- Android: `allowBackup=false`, widget tick only for ids it showed, updater only GitHub release URLs, reminder hides title on a private lock screen, `//` paths refused.
- Accepted, unchanged: username lockout trade-off, `/healthz` version, Actions by major tag (SERVICE-HANDOFF §6).

## Widgets v2 + phone UX + motion (2026-11-14, owner tried the app)

- Today: tick was invisible — `StatusSquare` set `color` on itself, so its default ink (`currentColor`) became the on-colour: fill, border and tick all the box colour. Now fill = ink, tick = `--sq-on` (Today passes the box colour). "Back to now" gone. Now row = full-width band (`--now-band`: #ececf0 light, #2c2b5e dark). ‹ › 44 px with the yellow shadow.
- No blue tap flash (`-webkit-tap-highlight-color`). Keep phone editor: text fills, tools at the bottom.
- Keep: open note = shallow history entry (`pushState`), closed on `popstate`. Back / Android edge swipe closes the note and stays on Keep (was: Today). `page.state` alone failed: saving runs `invalidateAll`, which dropped it and closed the note. `?note=` / `?new` open via `afterNavigate` + `setTimeout` (kit throws "router not initialized" on first load otherwise).
- Motion: 20-principle audit `docs/v2/UX-MOTION-AUDIT.md`. Done square squash + overshoot, tick draws itself, `navigator.vibrate(8)` (app + Android Chrome, `VIBRATE` permission), 40 px squares on touch, press feedback on + and note cards.
- Widgets: 6 now (Today timeline, Keep, Now and next, Quick add, Countdowns, Week ahead; To do today removed 2026-11-16). App look (card + yellow hard shadow, type colours, tick squares, now band, note colours), Light / Dark / Auto from the account (`Theme.java`, same rule as `lib/theme.ts`). Lists scroll (`androidx.core:core-remoteviews` → `RemoteCollectionItems`), + bottom-right. Ticks in Today change on screen at once, then PATCH with `Origin` (`WidgetAction` = invisible activity: broadcasts can't open the app on Android 12+).
- `/api/native` adds `theme`, row `id/kind/status/bg/ink/endTime`, `todos`, `days` (7), `countdowns` (60 days, "counts down" types).
- `WidgetShotsTest` (Robolectric, native graphics) draws every widget light + dark → CI artifact `widget-shots`. Found: a tinted outline-only shape fills solid black (needs a clear `<solid>`), `--` inside XML comments, `'` in strings. Robolectric doesn't fill widget lists (no launcher) → the test draws the rows the widget built.
- Not checked: a real launcher (row taps, scrolling, resize). Same code path as the shots, but only a phone proves it.

## Android app (2026-11-14, owner: "port it all to mobile", widgets for Keep + timeline, in-app updates)

- `mobile/` = Capacitor 8.6 Android shell: loads the server URL (pages always fresh), native extras only. `mobile/README.md` has the how.
- Server: `GET /api/native` (`lib/server/native.ts`) = today's rows (Today's rules: owner tz, timed items 60 min, hidden types out, type colour), 8 notes, `reminders.upcoming` (next 48 h, kinds that are on). Unit test `native.test.ts`.
- Native: `SyncWorker` (15 min + on leaving the app) → widgets + exact alarms per reminder (no Firebase; web push can't work in a WebView). Boot / app update resets alarms.
- Widgets: Timeline (now on, 6 rows, `+` → `/today?add` opens quick add) · Keep (notes, `+` → `/keep?new`). Signed out / never synced = says so.
- In-app update: newest GitHub Release APK; same signing key required by Android. Settings › Help shows version + Check for updates (only inside the app, `lib/client/native.ts`). Notifications page explains alarms inside the app.
- CI: `ci.yml` `apk` = unsigned release build (`assembleRelease`) + debug unit tests on every PR; `release.yml` `apk` = signed release APK on the release. Key made on the dev PC (`~/.lifetracker-android/`), secrets set by the owner (auto mode blocked `gh secret set`).
- minSdk 26 (java.time). Icons + splash from `app/static/icon-*.png`.
- Also: Today past rows lost the time dimming too (axe); e2e reminder test used "today 3 pm" → 2 days out (failed after 3 pm).
- Not checked: any real phone or emulator (no Android SDK here). CI compile only.

## Push + audit pass (2026-11-14, owner: no Chrome push on Android) — released in v2.0.2

- Push sent at `urgency: high` (was normal: FCM holds it while an Android phone sleeps).
- `sw.js`: `renotify: true` (same route = silent swap before), PNG icon (Android can't draw SVG).
- App load re-sends this device's subscription (`lib/client/push.ts` `resyncPush`). Fixes: server dropped the row (410, restore), VAPID keys changed (old sub dropped, new one made).
- Send a test: says why nothing went (device expired / keys rejected / service error).
- `VAPID_SUBJECT=mailto:` (bare, as in `.env.example`) = unset.
- Sign out drops this device's push first (max 2 s): a signed-out phone showed private titles.
- Reminder links: block → owner's local day (was UTC day); archived note → Keep archive.
- More = wireframe MMore: Pinned pages · Browse · App, value + › per row.
- Today past rows: grey colour, not opacity (axe: 2.3:1 text).
- e2e: two races fixed (goto before delete landed), axe test 180 s.
- Not checked: real FCM delivery (dev PC has no push service). Owner: Send a test on the phone after deploy; if it fails, `docker compose logs app | grep push` shows the code.

## Phone pass (2026-11-14, after v2.0.1, owner's phone screenshots)
- Header: one row on phone (mark left · Search · theme · avatar right), not sticky, no `?`/Ctrl+K hint.
- Bottom bar: wireframe MBar icons (clock, calendar, note, ☰ More — the old More dots never drew), round caps, pill behind the icon only.
- Today: timeline top-aligned — the "now" row (or the first, e.g. 07:00) starts at the very top, no blank space above. Fixed a class clash (`.cur`) that drew the current row as a white panel. Header like MToday: date line over "Today", ‹ › on the right.
- Keep (MKeep): title + New note, full-width search, one swipe row of chips (Notes · binders · labels · Shared with me · Archive · Trash), 2-column notes. Phone cards keep ↑ ↓ only; Pin / Archive / Delete are in the note. Trash keeps Restore / Delete forever.
- **Shared with me** split: pages → `/pages/shared` inside the Pages layout (tree + list like Archive, search, Can edit / View only chip); notes → `/keep?scope=shared` as normal Keep cards ("from X · view only", no reorder/pin/archive). Old `/shared` = 308 to `/pages/shared`.
- Settings: section links = swipe chip row on phone; wide tables (types, devices, users) scroll inside their card.
- Every phone page gets room for the bottom bar (`body` padding in `app.css`), so the last card scrolls into view (Settings › "When do you plan your day?" was stuck under the bar).
- `+error.svelte`: 404/500 show a card with "Go home", not the bare default page.

## v2.0.1 — Pages look to wireframe + audit fixes (2026-11-14, PR #15)
- Tree (`wireframes/v2/PagesTree`): New page button + ▤ New database + «, 32 px rows, pin icon on header-pinned pages, tools as a list (Knowledge graph, Shared with me, Archive, Trash). Current row = `--pill-card`.
- Page (`Pages`): top bar = crumbs (… / current) · save state · **Pin** (pressed when pinned) · **Share** · ⋯ (Move, Copy link, Archive, Delete). Body = 760 px column, 32 px title. Database pages get the full width (`Database`).
- Editor: soft toolbar, tight block spacing, to-do box lined up with its text (24 px hit area), done = struck through, quiet table borders, header cells filled. "Delete table" button gone (Delete block does it). Slash menu = name + hint, yellow shadow, key help line.
- Index / Archive / Trash / Graph cards get padding (`.panel` had none outside Settings). Phone: no duplicate index card, no « button.
- Graph: sigma 4 sizes nodes in graph units by default → giant circles. Now `itemSizesReference: 'screen'`, all labels shown, colours from theme (dark mode readable).
- `--muted` was never defined (10 files used it, fell back to ink): now = `--quiet`.
- Audit vs FEATURES/wireframes, fixed: **no visible scrollbars** now global in `app.css` (§1.12, was only on DB tables) · **Header pins** card in Settings › Preferences: ↑ ↓ reorder + Unpin (§2, API already took the order) · phone **All pages** (MPages): title, search by title, Recent 5 (swipe row, `pages.recent`).
- Open (owner call): Home "Due today" row vs spec "No time set today" — list also holds timed items (v1 FR-H12), so a rename alone would be wrong. Graph archived nodes = grey + "· archived", not dashed (sigma 4 has no dashed ring). `npm run dev`: graph layout worker is a `blob:` URL, CSP blocks it (prod build fine).

## v2 P9 — Release prep, no deploy (2026-11-14)

- Feature freeze. Full regression: unit 340, e2e 25 (v1 flows + every v2 phase + axe sweep), lint, types.
- Migration rehearsal log:
  - `tests/unit/rehearsal.test.ts` (runs in CI): builds a real v1.1.0 DB from migrations 0000–0002, fills users (light + dark theme), calendars, items (timed, multi-day, private, trashed), linked blocks, a grant, a share code, a session, dormant lists/ideas → runs every migration like boot → integrity ok, FK check empty, **every v1 column of every v1 row byte-identical**, themes kept as fixed Light/Dark, tour off, 5 built-in types per user → a page, a note, the D-22 importer work on it → `backup()` of the upgraded DB restores identical.
  - Anonymised dev DB (2 users, 398 items, already at migration 0005): `migrate-snapshot.test.ts` clean through 0008. `anonymise-db.mjs` now keeps v2 enum columns (CHECKs broke the scrub).
  - **Not done: a copy of the live backup** (owner chose to skip). Owner backs up before pulling.
- Backup drill: SQLite online backup → restore → integrity + equal rows (in the rehearsal test). `backup.sh`/`restore.sh` incl. uploads not run here (no Docker on the dev PC) — SERVICE-HANDOFF §8 has it as an acceptance check.
- Docs: SERVICE-HANDOFF §5 v1.1.0 → v2.0.0 steps + rollback, §8 v2 checks, §9 limits · RELEASE-NOTES.md · README + HANDOFF status.
- Owner click-through of every board vs app: for the owner after deploy (not possible from here).

## v2 P8 — Phone rest, PWA, offline, tour, help, a11y (2026-11-14)

- Phone (< 700 px): Week = read-first agenda (`PhoneWeek`, 7 day cards, tap day → Today, tap item → item); Month = `/month` compact 6×7 grid with type-colour dots, tap day → Today. More lists Month, Week, Pages, Shared with me, Keep archive, Trash, Settings, Help. Settings + Login already fit 360 px (checked).
- PWA: real `manifest.webmanifest` (standalone, 192/512 + maskable PNGs, apple-touch-icon; PNGs rendered from `favicon.svg`), `theme-color`. `sw.js` registered on every load: caches hashed build files + `/offline.html` (P8; since v3.0.0 also a data cache of last-seen pages and GET `/api`, see ADR-009); push handlers unchanged.
- Offline (ADR-009, D-06): badge while offline; API calls fail with "You're offline. Not saved."; Keep note edits queue on the device and send when back (clash = "(offline copy)" note). Sign-out wipes the queue. (v3.0.0 added planner ops to the queue: ADR-009.)
- Tour (`Tour.svelte`): first sign-in when `tour_state = new` (existing users were set `done` in P1). 7 steps, skips any step whose target isn't on screen (PC vs phone), resize repositions, Esc/Skip saves `skipped`, Finish saves `done`. Settings › Help: Restart the tour + short guides.
- a11y: axe (`@axe-core/playwright`, dev only) has 0 serious/critical issues on 10 screens × light/dark × PC/phone. Fixed: logo SVG without a name, planner block = focusable group (it holds buttons), active pill text in dark mode, FullCalendar other-month days faded to 0.3.
- Perf: Home load < 1.5 s asserted in e2e (local preview server).
- Not done: swipe gestures (buttons cover every action), phone time-picker sheet for blocks (item sheet + Schedule… cover it).

## v2 P7 — Sharing + v1 data import (2026-11-14)

- Migration 0008: `page_shares`, `keep_note_shares` (one row per page/note + person, view|edit, CASCADE). Revoke = delete the row.
- `repo/shares.ts` = the one access check. `need(kind, user, id, min)` → owner id to run the owner-scoped repos with; no access = 404 `Not found` (nothing about the thing), too low = 403.
- Rules: D-01 explicit only (subpages stay private) · D-02 links + breadcrumbs show only pages the viewer can open (else "unavailable", no title) · D-03 a shared page shares its database (rows, record pages) · D-04 no public links. Trashed = gone for them too; archived still shared.
- View = read. Edit = page title/text, database rows; note title/text/checklist. Owner only: share, move, archive, delete, pins, labels, binders, colour, files on notes, database columns + views.
- Files: page docs now keep `attachment_refs` (`page_block`, page id) — before this, page images had no ref and GC would have removed them after 7 d. Download = owner, or can read a page/note that uses it. A pasted URL to someone else's file gives nothing.
- UI: page ⋯ › Share… and note Share… (username + Can view/Can edit, change, Remove) · `/shared` "Shared with me" (link in Pages + Keep sidebars) · "Shared with you · view only" line, read-only editor.
- Co-edit: ADR-008, none in v2.0 (409 + keep text). Search + graph stay mine-only (shared things never leak in).
- D-22: Settings › Account "Old v1 data" turns dormant lists, people + facts, ideas, places, goals, workout split + log into Keep notes labelled "From v1". Once per user (`app_meta`), all or nothing, old tables untouched.
- Cut to v2.1: Keep Takeout import + export, live co-edit.
- Tests: `shares.test.ts` = DESIGN §21 matrix (owner/view/edit/other/revoked/guessed id/guessed file id, 404 bodies say only "Not found") + D-01..D-03 + importer. e2e: share view-only → read, PATCH 403 → revoke → 404 next load.

## v2 P6 — Reminders + push (2026-11-14)

- Migration 0007: `reminders`, `push_subscriptions`, `users.notify_planner|keep|pages`.
- `/remind 1w|3d|2d|1d|2h|15min` in quick add (several: `/remind 1d 2h`, glued `/remind2h` ok; anything else = a problem). Lands on the item (calendar/both) or the block (planner). A time already passed = warning, the item is still made.
- Reminder editor on the item view (offset before its time, or an exact time) and on Keep notes (exact time). API also takes database records (exact time). Not built: page to-dos (cut to v2.1).
- Rules: D-13 all-day items count from 09:00 on their date (1d = 09:00 the day before). D-14 more than 1 h late = sent once marked "missed". D-15 per-kind toggles + 15min, no quiet hours. D-16 archived notes still remind, trashed ones don't. Duplicate time refused. Move/delete/restore/undo re-checks the user's reminders; the runner re-checks the source again before sending.
- Runner in-process (every 30 s, stops before the DB closes); claim in a txn, send outside it, retry with backoff up to 5 times; `/healthz` shows `jobs` + `reminderBacklog`.
- Channels: in-app (toast while the app is open, checked every minute + on tab focus) and Web Push (`web-push`, VAPID from env; payload = title + route only; 404/410 revokes; turning off deletes our row first). Settings › Notifications: explain first, ask the browser only on a click, three honest states, Send a test.
- Push itself is tested only by spike S-4 (Edge). Chrome/Android/iOS + from the homelab = ADR-006 conditions, still open.

## v2 P5 — Graph (2026-11-13)

- `/pages/graph` (Pages sidebar → Graph, Ctrl+K → Knowledge graph). Read model built per request from my live pages + `page_links` (parent edges + link edges), cap 5,000 nodes (most recently opened first; banner when cut). Edges to anything not mine are never sent. `GET /api/graph`.
- Renderer = sigma 4 (WebGL) + graphology; ForceAtlas2 in our own module worker (CSP-safe, ADR-007), runs a fixed number of steps then stops.
- Show toggles: page links, parent/child, archived pages (n). Archived nodes: grey + "· archived" label (sigma has no dashed node outline; legend uses a dashed ring). Scope: whole workspace / around the selected page (1 hop = local graph).
- Click selects (side panel: parent, children, links to, linked from, Open page), double-click opens, drag moves the node on screen only. Keyboard: focus the graph, arrows walk linked pages, Enter opens. "Show as list instead" = accessible list; phones open on the list.
- Not built: filters by area, 2+ hop local graph, DB relations (later).

## v2 P4 — Databases (2026-11-13)

- Migration 0006: `page_databases`, `database_properties`, `database_records`, `database_values`, `database_views` (rows, not JSON; ADR-004).
- A database lives on a page: `/` → Database inserts one inline, ▤ in the Pages tree makes one on its own page. New = Title property + one table view.
- 8 property types (title, text, number, date, checkbox, select, multi-select, url), checked on the server with readable errors (`kg: Number: type digits…`). Select values store option ids.
- Table view: inline cell edit, add/rename/reorder/hide properties, select options, New record, Open as page, delete (confirm; its page goes to Trash). Saved views (add, rename, delete; at least one stays), one sort, filters with AND/OR. Operator list per type in `lib/dbvalues.ts`. Filters/sort run in app code over the database (cap 5,000 records, pages of 100).
- Records open as pages: made on first open, same page after, under the database's page, hidden from the sidebar tree. Title syncs both ways.
- D-19: a type change that leaves values not fitting needs a confirm; those values are kept as they were and shown ⚠ until edited. Deleting a property with values needs a confirm. The title property can't be deleted or retyped.
- Not built (EXT, cut line): board, calendar, list, gallery views; relations, formulas.

## v2 P3 — Pages + Ctrl+K (2026-11-13)

- **Pages** at `/pages` (header link): left tree on every Pages screen (collapsible; phone = All pages), create root/child, rename (title), Move to… (rejects self/descendant), Move up/down, Copy link, Pin to header (≤ 3, D-20 title only, PUT full list), Archive (page + subpages, one undo; pins removed; stays in links/graph; "Archived · Restore" bar), Archive view (search, sort, Was in, Restore → old parent or root) + 90-day suggestions (unticked, Select all, never automatic), Trash (D-18, 30 d, confirm first).
- Editor = Tiptap 3 (ADR-002): text, H1–H3, bullet, numbered, to-do, divider, table (+/− row/col), quote, code, image (upload, **alt text required**), file (upload → link), internal page link (shows the target's current title; archived = italic; gone = "Unavailable page"), external links (http/https/mailto only). `/` menu (Esc keeps "/text"). Inline B I U S code link. Block ↑↓ (also Alt+↑/↓), Duplicate, Delete; block ops close the undo group. Autosave 600 ms; failed save keeps text + Retry; stale revision = 409, text kept.
- Save = replace all of the page's blocks in one txn + rebuild `page_links` + search (ADR-003 closed). Server checks every node/mark/attr against an allowlist, image src must be an uploaded file, page ≤ 1 MB.
- **Search**: one FTS5 index `content_search` (Keep notes + Pages, updated in the same txn; archived hidden unless asked). Replaces the never-used `search_fts` (dropped). Planner items: title match.
- **Ctrl/Cmd+K** palette + header Search button: actions (Quick add, New note, New page, go to …), pages, notes, planner items; Include archived toggle. Owner-only everywhere.
- Not built: drag handle for blocks (menu/keys instead), multi-select blocks, page icons picker, database block (P4).

## v2 P2 — Keep + phone Today (2026-11-13)

- **Keep** at `/keep` (header link): notes (title + body, both optional; created on first content, an empty one is dropped), checklists (nest 4 levels, D-10; Tab/Shift+Tab or →/← buttons; ↑↓ moves an item with its children; collapse), images (attachment store, png/jpg/gif/webp), labels (filter = all ticked labels), binders (note in many; own order), colours (7 pastel, look only), pin, archive, Trash (30 d, D-17; delete forever = confirm), duplicate, Select mode (bulk archive/delete/restore), search over title/body/checklist text (`LIKE`, newest first; FTS comes in P3), ↑↓ reorder (no drag needed).
- Autosave 600 ms + on close; failed save keeps the text with Retry; `revision` refuses stale writes (409). Undo for Keep = toast Undo (archive, trash, pin); Ctrl+Z journal still covers planner only.
- Order = REAL `position` (midpoint insert), not DESIGN's text `position_key`: same behaviour, less code. Rebalance not needed at this scale.
- Not built (EXT/later): drawings, link previews (D-23 off), file (non-image) cards, grid/list toggle, background images (D-11 later), swipe-to-archive (menu action instead).
- **Phone** (< 700 px): bottom bar Today · Calendar · + Add · Keep · Pages (avatar = account sheet; was More). `/` opens `/today` on a phone (`/?desktop=1` = desktop Home). Today: day step + swipe, Now card (current block/timed item + time left, else "Free until"), timeline wheel (snap, centred on now, past dimmed; no Back to now chip). + Add sheet: Plan it (same grammar, batch) / Quick note. Item opens as a bottom sheet. Header hides nav + Add on a phone.

## v2 P1 — foundations (2026-11-13)

- **Item types** (`item_types`, migration 0003). 10 per user incl. 5 built-ins. Built-in keys = the v1 values (`Work Exam Event Hobby Dating`), so `items.type`, `blocks.type` and share codes needed no rewrite. **Differs from DESIGN §5 on purpose:** column stays `type` (not `type_key`), built-in keys stay capitalised. Custom key = the type's id (`ity_…`). Labels: Work, **Deadline** (Exam), Event, Hobby, **Date** (Dating). Deadline colour #B84A44.
- Type flags, never names: Counts down (countdown badge), Share by default (pre-ticks share codes). Type bar on Month + Week: click = hide/show (per user, `users.hidden_types`, own rows only), + = new type, n / 10. Settings › Item types: ↑↓ order, colour, name, quick-add word, use count, flags, delete + move (one undo).
- Quick add reads the user's types (custom `/slug`; old `/exam` `/date` `/dating` still work and still find the menu entry), block length (no /type = No type, 2026-11-16), destination (Timeline/Calendar; a dragged range still = planner, a month day still = calendar), region date order (US reads 11/16 first).
- **Preferences:** theme Light/Dark/Auto + light/dark start (equal starts refused, D-08) + preview; timezone picker; Region (MY/UK: Mon + 24 h + D/M · US: Sun + 12 h + M/D); Quick add goes to; Default block length 15–90. New accounts = Auto (D-07), existing users keep their theme. Header sun/moon = fixed choice; half-circle icon = Auto.
- Visible hours saved on the user (`users.visible_hours`); cookie = first paint only.
- 8 badge colours (`USER_COLORS`).
- **Undo journal** (`undo_actions`, 12 h): every item/block/quick-add/copy/type-delete write stores whole rows before + after. Ctrl/Cmd+Z outside text fields = undo newest; centre note "Undid: …". Refuses if any row changed since ("Can't undo safely"). Delete toasts' Undo uses the same entry. Not journaled: trash restore, settings, sharing.
- **Alt-drag = copy** on Month chips, Week items/blocks, planner blocks (D-09: items + blocks; never status, steps, secret flag, shares). Alt keyup swallowed during a drag.
- No-drag paths: **Schedule…** on due chips + Week "Not scheduled" rows; block menu has Start / End fields; `?` = shortcut sheet.
- 24×24 hit area on status squares and delete buttons; delete always visible on touch. Chip tooltips name the type.
- **Attachments** (store only, nothing uses it until Keep): `POST /api/attachments?name=` raw body, `GET /api/attachments/:id`. D-12: 25 MB, allowlist png jpg gif webp pdf zip docx xlsx pptx doc xls ppt txt md csv, magic bytes checked, temp in `uploads/.tmp`, EXDEV fallback, unreferenced files deleted after 7 days. Owner-only reads until P7. JSON routes refuse bodies > 1 MB; image sets `BODY_SIZE_LIMIT=26M`.
- `migrateDb` turns FKs off around migrations (table rebuilds) and runs `foreign_key_check` after.
- Not done in P1 (moved): header Search/Ctrl+K (P3), Keep + Pages links (P2/P3), pins (P3, needs pages), "Week of 9 Nov" title (kept v1 range title per parity rule).

## Differs from spec (on purpose)

- SvelteKit 2.70 and better-sqlite3 12.11.1 pinned (see HANDOFF env facts).
- `quickadd.ts` in `lib/`, not `lib/server/`, so the client preview can import it. Still pure.
- `end_date` needs `date` (spec CHECK let it pass when date NULL).
- Seed re-import: items/blocks refresh only rows not edited in app (`updated_at`); other tables insert-if-missing. Courses + goals no longer imported; items' `course_id` dropped.
- Month view: timed items are chips with a time prefix. Week view has the time grid.
- Trash page built in P1.
- **Goals and Courses removed** (2026-11-08). Tables kept dormant. `#word` in quick add is plain title text.
- **Sign-up open by default**, sharing is **view-only**, planner shows partner blocks beside mine (no lanes). See Sharing.

## Look

- Theme "gradient C" (2026-11-09, cosmetic only): tokens + both palettes in `docs/THEME.md`, values in `app.css`. Pastel gradient page (night gradient in dark), cards with 1.5px edge + hard yellow shadow bottom-left, header has no bar.
- Dark by default (`users.theme`, sun/moon in header). SSR sets `<html data-theme>`. Login page uses `lt_theme` cookie. Type colours are CSS vars; same pastel chips in both themes. `colors.ts` `edge` = type colour on a plain card.
- App mark `AppIcon.svelte` (calendar + one block, `currentColor`), now also left of the header nav. Favicon `static/favicon.svg` = same mark, white. No app name in header or auth pages (hidden `<h1>` for screen readers).
- Checkboxes/radios `accent-color: var(--ink)`. Active nav pill = `--pill`; active tab / settings link = `--pill-card`.

## Home

- Month (2/3) | day planner (1/3). Due-today chips drag onto the planner.
- Hover ⊗ deletes chips and blocks; Undo toast restores via trash.
- Exam countdown badge on chips (`5d`, `Today`, `2d late`, red when ≤ 3 d).
- Plan before bed (`users.plan_mode`): with `night`, Home opens tomorrow once today's last block has ended.
- Refreshes are serialised (a refresh asked for mid-flight runs again after).

## Planner timeline (Home, item view) and Week grid

- Visible hours shared setting, cookie `lt_hours` (default `7-24`). Top and bottom edges are `row-resize` handles: drag in whole hours (min 3 h), click the striped strip to unroll, arrows/Enter for keyboard. Strip names hidden blocks. Grid stays top-justified.
- Drag empty time → dashed draft box (grey until a `/type`) with the command box inside. Same grammar as N. Dragged day/time used unless typed; typing a time moves the box live. Planner / Calendar / Both toggle. No type typed = type None (grey).
- Blocks: 15-min snap, resize edges, arrows move, Enter edit.

## Week page

- Week grid: odd hours get a darker band (`--band`). Today = light dotted outline down the column, no fill. 20 px gap between all-day row and first hour.
- Drag empty slot → popover command box (replaces old `prompt()`); typed time moves the grid selection. One dashed selection box (FC highlight transparent, mirror styled).
- Side column: month heatmap (week of month highlighted, "Week N of M", shade = blocked hours, red dot = all-day item not blocked, click row = go) → **Not scheduled** (all-day items with no block; drag onto grid = 60-min linked block; drag a block onto the panel = unschedule: linked block deleted, plain block becomes an all-day item; Undo) → stats.
- Hover ⊗ on blocks, all-day chips, list rows.

## Quick add (N)

- Centred palette over the blurred page. Any order: `title day time [/type] [/calendar | /both]`. Default = planner block only; `/calendar` = item only; `/both` = item + linked block. Problems only on Enter. ↑ = last entry.
- Once a time parses, a second window shows that day's timeline with the draft moving as you type. Crossing midnight = first day only. "free" / "overlaps N" pill. Beside the palette ≥ 1360 px, under it below that.
- Shared input `CommandInput.svelte` (ghost hint, `/` menu). Drag boxes use `SlotCommand.svelte` with `QAContext.slot`; API `POST /api/quickadd {text, slot?, day?}`. Phone Add sheet sends `day` = the day shown on screen (default day when the text has none; relative words like `tmr` still count from today). After Add, the phone toast lists server warnings (e.g. "Date is in the past.", "Time already passed today.") and stays 8 s.
- **Grammar** (truth = `app/src/lib/quickadd.ts`; client preview and server share it; never throws; problems show on Enter):
  - Any order. Last day wins, last time wins. Words like `on at by from` need no prefix. Common typos ok (`tommorow`, `wensday`, `febuary`). `#word` stays in the title.
  - `/type` = one of your item types by slug (`/work`, `/hobby` …). None typed = No type. `/` opens the menu. Unknown `/x` = problem.
  - Goes to: `/planner` (aliases `/plan /timeline /block`) = time block only, needs a time. `/calendar` (`/cal`) = calendar item only, time optional. `/both` = item + linked block, needs a time. No destination = your Quick add target pref (default planner). A month-day drag defaults to calendar. Text with `every …` and no destination = `both` if it has a time, else calendar.
  - `/remind 1w|3d|2d|1d|2h|15min` (several ok: `/remind 1d 2h`; glued `/remind2h` ok). Any other offset = problem.
  - Days: `today tonight tmr yesterday`, weekdays (`fri`, `next fri`), `16 nov` (a passed date rolls to next year), `16/11` (D/M; US region = M/D), `2026-11-16`, `in 3 days / 2 weeks / 1 month`, `3 days from now`, `day after tomorrow`, `next week`, `weekend`, `next month`, `end of month` (`eom`). Past date = warning, not a problem.
  - Times: `3pm`, `3:30pm`, `15:30`, `noon`, `midnight`, ranges `3pm to 5pm`, `3-5pm`, `between 3 and 5pm` (also `till`/`until`), end by length `for 2h`, `for 90min`, `for 1h30`. Planner times snap to 15 min ("rounded to 15 min"). One time = block length pref (default 60 min). End before start = crosses midnight; block max 24 h. `all day` = no time, so add `/calendar` (planner needs a time). End time on `/calendar` is dropped (note "end time needs /both").
  - Repeat (#72): `every day`, `every weekday`, `every week`, `every month`, `every year`, `every 2 weeks`, `every mon,wed,fri` (also `every mon and wed`). Weekly gets BYDAY of the start day, monthly BYMONTHDAY. Bare `daily weekly monthly yearly annually` count only when an end phrase is also typed (so "weekly report" stays a title).
  - Repeat end (#262, #268): `until <date>` (also `till`, `til`; date forms as above, or a weekday) and `for N days|weeks|months|years` (first day counts as one). Need a repeat, else problem. End before start = problem. Words are removed from the title; the rule gets `UNTIL=`.
  - Title: leftover words, cut to 300 chars. Empty title = problem ("Add a title first").

## Item view

- Centre peek (URL `/item/:id` via pushState; reload = full page). Title edits in place. Body = markdown notes, autosave 700 ms. Props row inline (type, date, time, until, secret). Right column: Delete → History → Time blocks (real DayPlanner of that day, this item's blocks highlighted).

## Accounts + sharing

- Sign-up open: no code, 5 accounts per IP per 15 min. Admin Settings > Users: Open / Invite only (then `/signup` asks for `INV-` code made there, 7 days), account list.
- Settings > Sharing: make a code (`LT-XXXX-XXXX-XXXX`, shown once, single use, 24 h or 7 d) choosing visible kinds Work, Exam, Event, Hobby, Dating, No type, Planner blocks; rest shown as Busy or hidden. Enter someone's code. Lists: calendars I can see (Shown/Hidden, Leave), who can see mine (Remove), unused codes (Cancel). Mutual = both make + both enter.
- Server filter `access.ts`: visible rows read-only with `itemId` null; hidden rows `busy_<hmac>` + "Busy" or dropped; "Keep secret" always Busy; steps and notes never sent. 5 bad redeems per user per 15 min. Own code refused. Re-redeem replaces settings.
- `getCalendar` adds partner rows when `users.overlap_on` and grant `in_overlap`. Stats, heatmap, plan-ahead use own rows only.
- Partner entries: striped in type colour, dashed edge, owner initial badge, no square/drag/click/delete. **Overlap** switch on Home and Week headers, shown only when something is shared with you.

## Tests

**v2 baseline (P0, 2026-11-13).** Branch `v2` starts at `main` `6c69301` (v1.1.0 + PR #4); CI run #15 on that commit = green. Same suite run locally on Node 22.23.4:
- lint (prettier + eslint) clean · svelte-check 0 errors / 0 warnings
- **Unit 262** in 12 files + 1 migration-snapshot test (13th file) that runs only when `data/snapshot/anon.db` exists, so **CI shows 262 passed + 1 skipped, a dev PC with the snapshot shows 263**.
- **e2e 15.**
- Every later phase: these numbers may only go up. A lower count = a removed test, explain it in the PR.

**Migration test on real data.** `cd app && node scripts/anonymise-db.mjs ../data/app.db ../data/snapshot/anon.db` makes a scrubbed copy (ids, dates, links kept; every other text replaced; sessions dropped; self-check fails if any original text is left). `tests/unit/migrate-snapshot.test.ts` then runs all migrations on a copy of it and checks integrity, foreign keys and v1 row counts. Snapshot is gitignored. The dev DB has 1 user and 0 grants: for the P9 rehearsal, make the snapshot from a **live backup** (`LT_SNAPSHOT=<path>`).

- Unit (v1.0.0 note, count now above): quickadd, time, hours, planahead, auth (open + invite-only sign-up), seed, schema, sharekeys, access (JSON leak check).
- e2e (serial, fresh DB): setup, remember cookie, lockout, month chips, planner drag/resize/overnight, chip → block, N palette + live timeline, planner drag commands, week drag box + Not scheduled + heatmap + roll, peek, sign-up + share codes + overlap + remove, theme, plan-ahead (skips near midnight), reset-password.

## Known small things

- Google Fonts is the only external call (self-host later).
- Month drag of a multi-day item keeps its span; change the span on the item page.
- `scripts/transform_notion.py` still writes `courses.json` / `goals.json` (ignored).
