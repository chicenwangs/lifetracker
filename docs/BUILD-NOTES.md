# Build notes — what the app does now

Caveman doc. Was P1-NOTES.md (renamed in v2 P1). Wins over REQUIREMENTS + TECHNICAL where they differ. History is in git log.
v1.1.0 part below is from 2026-11-08; v2 sections are added per phase (branch `v2`, not released yet).

## v2 P1 — foundations (2026-11-13)

- **Item types** (`item_types`, migration 0003). 10 per user incl. 5 built-ins. Built-in keys = the v1 values (`Work Exam Event Hobby Dating`), so `items.type`, `blocks.type` and share codes needed no rewrite. **Differs from DESIGN §5 on purpose:** column stays `type` (not `type_key`), built-in keys stay capitalised. Custom key = the type's id (`ity_…`). Labels: Work, **Deadline** (Exam), Event, Hobby, **Date** (Dating). Deadline colour #B84A44.
- Type flags, never names: ★ default (quick add), Counts down (countdown badge), Share by default (pre-ticks share codes). Type bar on Month + Week: click = hide/show (per user, `users.hidden_types`, own rows only), + = new type, n / 10. Settings › Item types: ↑↓ order, colour, name, quick-add word, use count, flags, delete + move (one undo).
- Quick add reads the user's types (custom `/slug`; old `/exam` `/date` `/dating` still work and still find the menu entry), default type, block length, destination (Timeline/Calendar; a dragged range still = planner, a month day still = calendar), region date order (US reads 11/16 first).
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
