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
| Quick add `ds quiz fri 2pm /exam #ds /calendar` (+ planner default, `/both`) | e2e 7, unit `quickadd.test.ts` (154) |
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

## UX round 1 — 2026-11-06 (owner asks)

| Ask | Built | Where |
|---|---|---|
| Title edit on title itself | hover = dotted underline + pencil, click = edit in place, Enter saves, Esc cancels. Details form gone | `ItemView.svelte` |
| Dark mode, default dark | `users.theme` (migration 0002, default dark). Sun/moon in header + Settings > Preferences. SSR sets `<html data-theme>` (no flash). Login page uses `lt_theme` cookie. Type colours now CSS vars (`colors.ts` returns `var(--work-bg)` etc) | `app.css`, `hooks.server.ts`, `lib/client/prefs.svelte.ts` |
| Click item = centre peek, blurred bg | panel grows from click point, backdrop blur. URL = `/item/:id` via pushState (Back/Esc/×/backdrop close; reload = full page). Open state in `lib/client/peek.svelte.ts` NOT page.state (invalidateAll wipes page.state) | `ItemPeek.svelte`, `+layout.svelte` |
| Exam days left | Exam + not done + dated: chip badge `5d` / `Today` / `2d late` (filled red when ≤ 3 d); peek pill "5 days left" | `time.ts examCountdown` |
| Item = big markdown page | body = notes. Click to write, autosave 700 ms, Esc/blur = render. Props (type/date/time/until/course/secret) inline row, save on change. Steps list only shown if steps exist (no add-step UI now). "Also in course" removed | `ItemView.svelte`, `GET /api/items/:id/view` |
| Right column order + level | Delete → History → Time blocks. Grid columns start same line | `ItemView.svelte` |
| Time blocks in item view | real DayPlanner of that day (same timeline as Home). This item's blocks full colour, others muted dashed. Drag empty = block linked to item (label = title, no prompt). "Drag me" chip = 60-min block. Opens on next upcoming block day, else today | `DayPlanner` props `linkItemId focusItemId tip height` |
| Hover ⊗ quick delete | planner blocks (top right) + month chips (smaller). Undo 5 s via trash restore. Single block delete now returns `{batch}`; restore counts blocks | `lib/client/remove.ts` |
| Plan before bed / morning | `users.plan_mode` night/morning/off/NULL(not asked). night: Home (no `?d=`) opens tomorrow once today's last block/timed item (60 min) has ended; overnight blocks (Sleep) ignored. morning/off/NULL = today. Settings > Preferences. First-use tutorial (later) should ask + PATCH `/api/me/prefs {planMode}` when NULL | `lib/planahead.ts` |

Fixed on the way: FullCalendar var overrides never applied (`.grid :global(.fc)` missed — `.fc` is the same element). Minifier dropped plain `backdrop-filter` (Firefox) → set via CSS var.
Tests: +6 unit (planahead), +3 e2e (peek flow, theme, plan-ahead). Colour asserts now dark values.

## UX round 2 — 2026-11-06 (owner asks)

| Ask | Built | Where |
|---|---|---|
| N palette = blurred bg like item peek, centred | scrim uses `--scrim` + 8 px backdrop blur, palette dead centre (vertical + horizontal), pop-in. Body scroll locked while open | `QuickAdd.svelte` |
| Live timeline while typing a time | once a time token parses, a 2nd window shows that day's planner (real blocks, fetched per day, cached until any calendar write) + dashed draft that slides as you type. Tinted with Type colour once `/type` or `#course` typed. "free" / "overlaps N blocks" pill. Crosses midnight → first day only, clipped at 24:00 ("ends next day"). `/calendar` = dotted 30-min marker "calendar item". Wide screens (≥1360 px): hangs off the palette's right, palette never moves. Narrower: under it | `TimelinePreview.svelte`, `DraftBlock.svelte` |
| Commands in the timeline drag | drag empty time → command box in the draft (same grammar, ghost hint, `/` `#` menu). Dragged day+range used unless you type one (typed wins, box moves live). Default planner; Planner / Calendar / Both toggle (= `/calendar`, `/both`). Undo toast | `SlotCommand.svelte`, `CommandInput.svelte`, `DayPlanner.svelte` |
| Same on Week page | `prompt()` gone. Drag empty slot → popover with the same command box; typed time moves the grid selection live (dashed draft look); header shows live range | `routes/week/+page.svelte`, `WeekCalendar.svelte` (`showSlot/clearSlot`, `unselectAuto:false`) |

Parser: `QAContext.slot {date,start,end}` (drag range) + `QAParse.fromSlot`; `withTarget(text, target)`; `ghostHint(..., slotted)`. API `POST /api/quickadd {text, slot?}` (zod strict, end ≤ 2880).
Shared: `lib/planner-layout.ts` (clip + column packing, used by DayPlanner + preview).
Fix on the way: Home refreshes serialised (a refresh asked for mid-flight runs again after) — closing the item peek sometimes showed stale planner.
Tests: +7 unit (slot, withTarget, slotted ghost), +2 e2e (planner drag commands + /calendar toggle, week drag box), N-palette e2e checks the live timeline.

## UX round 3 — 2026-11-06 (owner asks)

| Ask | Built | Where |
|---|---|---|
| Roll empty hours away, drag to expand | Timeline shows a visible hour range (default **07:00–24:00**). Top + bottom edges are drag handles (`row-resize` cursor, like a sidebar splitter), whole hours, min 3 h. Rolled hours become a striped strip "00:00 – 07:00 · 1 hidden: Sleep"; click = unroll, drag = adjust, arrows = ±1 h, Enter = unroll. Grid stays top-justified (no auto-scroll to 07:00 any more; height follows the range). Blocks cut by the range get dashed edges, no resize handle on the cut side. While typing a time outside the range in a drag box, the view widens temporarily | `RollHandle.svelte`, `DayPlanner.svelte` |
| Same on Week | FullCalendar `slotMinTime/slotMaxTime` follow the same setting; handles overlay the grid edges; `contentHeight:'auto'` (no inner scroll). Hidden-block names collected across the 7 days | `WeekCalendar.svelte` |
| Gap all-day ↔ first hour (week) | `.fc-timegrid-divider` = 20 px band (ground colour); top roll handle sits in it | `WeekCalendar.svelte` |

One setting for Home + Week + item view: cookie `lt_hours=7-24` (read by `+layout.server.ts`, so SSR renders the right range, no jump). Pure helpers `lib/hours.ts` (`parseHours`, `clampHours`), client state `lib/client/hours.svelte.ts`. N-palette timeline preview keeps all 24 h (it scrolls to the draft).
Tests: +2 unit (hours), e2e: rolled strip names hidden Sleep → click unrolls → drag top edge 7 h back → survives reload, top-justified; week gap ≥ 18 px, bottom edge drag hides 23:00, click restores. Existing planner e2e coordinates now offset by 07:00.

## UX round 4 — 2026-11-07 (week page)

| Ask | Built | Where |
|---|---|---|
| Drop Due soon + Unscheduled | gone. One **Not scheduled** list = all-day items touching this week, not done, with no planner block anywhere (`items.allDayUnblocked`) | `week/+page.server.ts`, `repo/items.ts` |
| Put blocks back | drag any timeline block onto Not scheduled (panel lights up while a block is dragged). Linked block → block deleted, its item shows in the list. Plain block → becomes an all-day item (label, type, day) and the block goes. Undo toast restores. Drag a list row onto the grid = 60-min linked block (as before) | `WeekCalendar` `eventDragStart/Stop`, `week/+page.svelte unschedule()` |
| Week-of-month highlight + heatmap | top of the side column: month grid (the week's month, ISO Thursday rule), current week row outlined + "Week N of M". Cell shade = planner hours that day (0, <2, <4, <6, 6 h+; midnight-crossing blocks split per day). Red dot = all-day items not blocked. Click a row = go to that week | `WeekMap.svelte`, `HeatDay` in `lib/types.ts` |
| Week timeline like Home | blocks: 8 px radius, 18 px square, hover ⊗ delete (blocks + all-day chips + list rows) with the same undo toast as Home | `WeekCalendar.svelte` |
| Doubled highlight | FC `.fc-highlight` made transparent; the dashed mirror is the only box | `WeekCalendar.svelte` |

e2e (week test): heatmap shows "Week N of M" + one highlighted row; one mirror + transparent highlight while selecting; drag plain block → Not scheduled → it is a list row and gone from grid; ⊗ on list row and on a block.

## UX round 5 — 2026-11-08

- **Home/Week drag = grey by default.** A block (or `/calendar` item) made from a timeline drag with no `/type` or `#course` is saved with type None (grey). The N palette keeps its Event default. Draft box is grey until a type is typed (`DraftBlock` uses None colours for `type=null`). Server: `quickAdd(..., slot)`; unit test added.
- **Week hour bands.** Odd hours get `--band` (light `rgb(0 0 0/.035)`, dark `rgb(0 0 0/.24)`) on both the lanes and the label column via FC `slotLaneClassNames/slotLabelClassNames`, so a drag's length reads in hours.
- **Week today.** No fill any more; a light dotted outline (`--today-line`) runs down the whole column: header, all-day row, hours.

## Removed: Goals + Courses — 2026-11-08 (owner ask)

Gone from the app: Home goals panel, Settings > Goals / Courses pages + header menu links, `/api/goals*`, `/api/courses*`, `repo/goals.ts`, `repo/courses.ts`, quick-add `#course` (menu, slot, Work default, note) — `#word` is now plain title text, item view Course field, "Also in course" query, `courseId` on `ItemDTO` and item create/patch, `CourseDTO`/`GoalDTO`, `quarterKey`.
Kept on purpose (non-destructive): DB tables `goals`, `courses` and column `items.course_id` stay with their data, marked DORMANT in `schema.ts`; nothing reads or writes them. A drop migration can be added later (needs an `items` table rebuild because of the FK).
Seed import no longer reads `courses.json` / `goals.json` and strips `course_id` from items; `scripts/transform_notion.py` still writes those files (ignored).
Tests: quick-add/seed/time units updated; e2e checks the two APIs now 404 and `#ds` opens no menu. REQUIREMENTS updated; TECHNICAL/PSEUDOCODE/STRUCTURE still mention them historically.

## Sign-up + calendar sharing — 2026-11-08 (owner ask)

**Auth pages.** New app mark (`AppIcon.svelte`, currentColor: white on dark, ink on light) replaces the 4-square logo + name (name kept as a hidden `<h1>` for screen readers). Consistency fixes: signup password hint matches setup ("10–128 characters. Common passwords blocked."), no hard-coded "Ask Jeremy", active tab uses the same `--rule` pill as the header/settings nav, checkboxes/radios use `accent-color: var(--ink)` app-wide (no browser blue).

**Open sign-up.** `invites.signupOpen()` (app_meta `signup_open`, default open). Open: no code, 5 new accounts per IP per 15 min, username race checked inside the transaction. Admin page Settings > Users: Open / Invite only, invite codes (7 days) when invite-only, account list. Header menu + settings nav: Sharing (all), Users (admin).

**Sharing (view-only).** Settings > Sharing: 1 make a code (pick Work/Exam/Event/Hobby/Dating/No type/Planner blocks; rest Busy or hidden; 24 h / 7 d) → `LT-XXXX-XXXX-XXXX` shown once + Copy; unused codes cancel. 2 enter their code. Calendars I can see (Shown/Hidden, Leave). Who can see mine (Remove).
Server: `repo/sharekeys.ts` (HMAC only, single use, own code refused, 5 bad tries/15 min, re-redeem replaces + reopens), `repo/grants.ts`, `access.ts` filter (visible = full read-only DTO, `itemId` null; hidden = `busy_<hmac>` id + "Busy", or dropped; private always Busy; steps never; no notes). `getCalendar` adds partner rows when `overlapOn` and grant `inOverlap`; stats/heatmap/plan-ahead use own only. API: `/api/share-keys`, `/api/share-keys/[id]`, `/api/share-keys/redeem`, `/api/grants`, `/api/grants/[id]`.
UI: partner entries striped in type colour + dashed edge + owner initial badge, no square/drag/click/delete (month, week, planner); Busy = grey italic. **Overlap** switch (faces + switch) on Home month header and Week header, only when something is shared with you.
Tests: unit `sharekeys.test.ts`, `access.test.ts` (leak check on JSON), open/invite-only signup in `auth.test.ts`; e2e: Jeremy code → Neina signs up (no invite) → redeems → sees Groceries with J badge, DS Quiz only as Busy (not in API JSON) → overlap switch → mutual → Remove hides it.
