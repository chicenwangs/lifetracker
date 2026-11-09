# Build notes — what the app does now (2026-11-08)

Caveman doc. Wins over REQUIREMENTS + TECHNICAL where they differ. History is in git log.

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
- Shared input `CommandInput.svelte` (ghost hint, `/` menu). Drag boxes use `SlotCommand.svelte` with `QAContext.slot`; API `POST /api/quickadd {text, slot?}`.

## Item view

- Centre peek (URL `/item/:id` via pushState; reload = full page). Title edits in place. Body = markdown notes, autosave 700 ms. Props row inline (type, date, time, until, secret). Right column: Delete → History → Time blocks (real DayPlanner of that day, this item's blocks highlighted).

## Accounts + sharing

- Sign-up open: no code, 5 accounts per IP per 15 min. Admin Settings > Users: Open / Invite only (then `/signup` asks for `INV-` code made there, 7 days), account list.
- Settings > Sharing: make a code (`LT-XXXX-XXXX-XXXX`, shown once, single use, 24 h or 7 d) choosing visible kinds Work, Exam, Event, Hobby, Dating, No type, Planner blocks; rest shown as Busy or hidden. Enter someone's code. Lists: calendars I can see (Shown/Hidden, Leave), who can see mine (Remove), unused codes (Cancel). Mutual = both make + both enter.
- Server filter `access.ts`: visible rows read-only with `itemId` null; hidden rows `busy_<hmac>` + "Busy" or dropped; "Keep secret" always Busy; steps and notes never sent. 5 bad redeems per user per 15 min. Own code refused. Re-redeem replaces settings.
- `getCalendar` adds partner rows when `users.overlap_on` and grant `in_overlap`. Stats, heatmap, plan-ahead use own rows only.
- Partner entries: striped in type colour, dashed edge, owner initial badge, no square/drag/click/delete. **Overlap** switch on Home and Week headers, shown only when something is shared with you.

## Tests

- Unit 237: quickadd, time, hours, planahead, auth (open + invite-only sign-up), seed, schema, sharekeys, access (JSON leak check), places stub.
- e2e 14 (serial, fresh DB): setup, remember cookie, lockout, month chips, planner drag/resize/overnight, chip → block, N palette + live timeline, planner drag commands, week drag box + Not scheduled + heatmap + roll, peek, sign-up + share codes + overlap + remove, theme, plan-ahead (skips near midnight), reset-password.

## Known small things

- Google Fonts is the only external call (self-host later).
- Month drag of a multi-day item keeps its span; change the span on the item page.
- `scripts/transform_notion.py` still writes `courses.json` / `goals.json` (ignored).
