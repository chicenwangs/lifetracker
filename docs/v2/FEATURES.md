# Life Tracker — FEATURES (behaviour)

Caveman doc. Rev 1.1, 2026-11-12. Compact of Feature Spec v1.0 + error fixes (FIX LOG end).
Read PRD.md first. Decisions = PRD §12 (D-xx). Milestones = PRD §13 (M-x). Old planner detail = repo REQUIREMENTS/BUILD-NOTES (BUILD-NOTES wins).
MUST = needed for acceptance. SHOULD = expected unless reason written. MAY = optional.
Tags: **KEEP** = existing, don't break · **CORE** = first release of that feature · **EXT** = full feature, can follow · **LATER** = deferred/blocked.

## 1. Global rules

1. Save state visible: unsaved · saving · saved · failed (keeps text, retry) · offline-pending (never "saved") · conflict (keep both, ask).
2. No success toast before server/local store confirms.
3. Destructive ≠ close. Permanent delete = second explicit step.
4. Hover controls also on focus; touch gets visible button or menu.
5. Shortcuts never break typing or browser nav.
6. States per route: loading (stable skeleton, no empty flash) · loaded · empty (says what to make) · error (retry if safe) · signed out (`/login?next=`) · denied (no data) · offline.
7. Lists/graph/search never show title, text, file or metadata user can't access.
8. Note in many binders/labels shows once per list.
9. Dates/times shown in user tz. Storage rules = DESIGN.
10. Retry never duplicates (verify first if unsure). Errors: what failed + next step. No stack/SQL/paths.
11. Leaving with pending save: try finish; failed → warn before discard.
13. **Naming:** type `Exam` shows as **Deadline**; items due on the shown day show as **"Due today"** (or "Due <date>") above the Home planner (`DueTodayChips`); phone Today has no such list (removed 2026-11-16); Week side panel keeps live name **"Not scheduled"** (any day, drop-back to unschedule). Month/Week toggle stays in the calendar header (live). All v1.1.0 features retained — see RELEASE-PARITY.md. Every drag has a button path (Schedule…, ↑↓, menu Move) per WCAG 2.5.7; every hit target ≥ 24×24 (2.5.8). See UX-AUDIT.md.
12. **No visible scrollbars** (owner 2026-11-12): page and every inner scroller hide the bar (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`); scrolling still works by wheel, touch, keys. Horizontal rows = native-feel carousel: scroll-snap, next card peeks, edge fade, no arrows needed. Scrollable areas stay keyboard-focusable. Phone Recent pages shows 5.

## 2. Header + pins

Order: mark · Home · Week · Keep · Pages · pins (0–3) · Search (Ctrl+K) · quick add · ? shortcuts · theme · avatar. No blank slots. No overflow at desktop widths.
Pins (CORE): "Pin to header" in page menu. Max 3 enforced server-side; 4th → disabled or "replace which?". Reorder persists per user across devices. Unpin never touches page. Title follows page (custom label = D-20). Access lost → removed/unavailable, no leak.
Tests: 0 pins → Home Week Keep Pages only · 1–3 pins after Pages · 4th fails · unpin keeps page · order syncs.

## 3. Life Planner

- **Home / Week / item / quick add (KEEP).** As BUILD-NOTES. Failed refresh keeps last good data + error, never blank calendar. Week ≠ Pages DB calendar view.
- **Month-only type visibility (v4 card 10, O-1 items 2–3, D-V4-11, D-V4-28).** A type with "Month calendar" off (Settings › Types) keeps its own items off the desktop Month grid and the phone Month page and nowhere else: Week, the planner, Today, due chips, Slipped, widgets, digest, reminders, ICS and search still show them. Partner rows, `No type` and planner blocks are never filtered; no "+N hidden" hint — the day just looks empty.
- **X fix (CORE).** Every deletable chip/block/all-day chip/row: control on hover + focus, stays while pointer on it, not clipped (check stacking context / overflow), touch alternative, name "Delete <title>". Double-click = one delete. Fail → item stays + error. Linked blocks follow existing delete rules (one undo unit).
- **Reschedule (v4 card 03, D-V4-04 / D-V4-16).** One list in the item sheet (desktop + phone) beside the Date field and in the phone Today row ⋯ sheet: Today · Tomorrow · Next weekday (Mon–Thu = +1 day, Fri–Sun = Monday) · +1 week · Pick date…. Postpone keeps the time; a multi-day item moves `end_date` by the same span; on `id@date` it detaches that one occurrence (no scope dialog). One toast names the earliest linked block's day (the block stays). `Skip this one` only on a repeating occurrence: one EXDATE, no new row, that date's reminders removed with the action and restored by Undo (a relative one moves to the next occurrence). Undo restores dates / removes the EXDATE; offline postpone queues, Skip only toasts. Undated items hide Postpone.
- **Print week (v4 card 06, D-V4-07 / D-V4-18).** Desktop `/week`: `⋯` → `Print week` = `window.print()`; no entry on phone. Print hides the shell (header, phone tab bar, toolbar buttons, `TypeBar`, right rail, gesture/foot hints, toasts) and keeps the date-range title; white sheet, black ink, the type colour only as a 3 px left border (light and dark); the 7-column grid at any width (a phone-width print is not blank; the grid re-measures when print turns on and the default 07:00–24:00 rows shrink so the bar, day header and time grid fit one sheet; a long all-day list is not capped and can add a page); `@page { size: A4 landscape }`. No data change, no undo entry; an empty week prints as an empty grid.
- **Slipped (v4 card 04, D-V4-05 / D-V4-17, O-1 / O-4).** Overdue one-off items, so nothing is lost: own, live, top-level, `COALESCE(end_date, date)` before today, todo/doing, hidden types out (untyped = `None`); a normal repeat never slips (from-completion series join with card 09). Collapsible **Slipped · N** strip at the top of the Home planner column and the top of `/today`: header count is the true total, rows show the original date as `Mon 18 Nov 2026`, 50 rows then an `N more` count label (not a button). Expanded everywhere, collapsed on phone landscape only (O-4). Row: tap = item sheet, `⋯` = the card 03 reschedule list in the shared ActionSheet (no `Skip this one`), phone swipe right = done / left = delete with Undo. `Move all to today` = one request, one undo batch over every matching row (all N), time kept and a multi-day span moved; a refused one shows the server message, offline only toasts (nothing queued). Empty = the strip is not rendered. On phone a toast with a bottom sheet open sits 8 px above it, clamped so it stays on screen (the desktop sheet keeps the toast at the bottom; O-10).
- **Repeat from completion (v4 card 09, O-9 / O-11, D-V4-10 / D-V4-27).** The item sheet's Repeat box gets `Next one counts from` → `Scheduled date` (default) / `When I finish it`, only for a `DAILY` or `MONTHLY` rule with no `BYDAY`, no `UNTIL` and no `COUNT` (a weekly rule always carries BYDAY; O-9). Choosing it is a normal PATCH under the undo journal; a rule that stops qualifying clears the flag in the same edit; the whole row is edited with no this/following/all dialog. The summary line reads "Daily, counted from when you finish" / "Every 3 days, counted from when you finish". The series shows exactly once, at its stored date, in every view (Month, Week, Today, due chips, `/month`, widgets), and `id@date` is valid only for that date; old EXDATEs stay stored and dormant. Finishing it (row tick, item sheet, reminder Done) files a done copy dated today (title, type, private flag, time, notes, span; no rule/UID/EXDATEs/flag) and moves the series to today + the interval (month end clamped, `end_date` shifted by the same delta), back at `todo` (O-11) — one undo entry restores the old date and deletes the copy. Relative reminders recalculate (`recalcOwner` on PATCH and `/cycle`), a fired one is recreated for the new date, exact-time ones stay at their instant and `advanceRepeating` does nothing for these series. A completion cancels the finished occurrence's reminders — every exact/snoozed row (scheduled, processing or already fired), the relative rows already fired, and the acting row whatever its kind — in the same undo entry, so a later Done is a 404 and files no second copy; scheduled relative rules are standing rules and move with the date. An overdue series slips (card 04); the ICS feed writes one VEVENT at its date, no RRULE/EXDATE (card 07). A normal repeat's series resets to `todo` when one occurrence is finished (O-11).
- **Calendar feed (v4 card 07, O-1 item 4, D-V4-08 / D-V4-25 / D-V4-37).** Settings › Calendar feed (Planner group, every user): one read-only ICS URL, returned once by the form action (`form.url`) with Copy / Rotate / Turn off; only the token's SHA-256 is stored in `users.ics_token_hash` (no migration), a reload only says a feed exists, Rotate kills the old link and Turn off deletes the feed. `GET /cal/<token>.ics` is public (no session, exempt from the same-origin CORP header), rate-limited per client IP (120 per 15 minutes, every request counts) and answers every failure — unknown, malformed, rotated or internal — with the same `404 {}` (no token in any log). Range today −30 … today +365 (`agenda` `maxDays: 400`), own default-calendar items only with `hidden_types` applied, no planner blocks, no shared or partner items. One VEVENT per series: all-day `VALUE=DATE` (`DTEND` = end + 1 day on a span), timed UTC `...Z` (60 minutes or the earliest linked block's length), `RRULE` FREQ/INTERVAL/BYDAY/BYMONTHDAY/UNTIL/COUNT with `UNTIL` as `YYYYMMDD` all-day and a UTC instant timed, one `EXDATE` per stored date in the same encoding, `UID` = series id, private items `SUMMARY:Busy` with no DESCRIPTION, public notes as DESCRIPTION (one batched lookup), TEXT escaped, lines folded at 75 octets. No undo entry (the journal excludes users): Rotate/Turn off are the reversals; a failed action shows its message inline with Retry. The service worker never caches `/cal/` and a disabled account (`password_hash` null) gets the same `404`; disabling also clears the stored hash.
- **ICS file import (v4 card 11, D-V4-12 / D-V4-29 / D-V4-37).** Settings › Import (admin-only; always the signed-in admin's own default calendar) gets `Calendar file (.ics)`: a timetable or Google/Outlook export up to 1 000 000 bytes. The client refuses a bigger File inline ("The file is over 1 MB.", an `.alert` in the preview area, never a toast) before any request; the server re-checks the posted file part and the app's 1 048 576-byte body cap is the backstop, so nothing is written. The preview is an inline panel (not `Dialog.svelte`): big line "N events · M repeating · K skipped" (N = importable), `Put them in type` (default = the first type in position order with `Month calendar` off, else None), `Skipped (K)` with one plain-words reason per event — duplicate UID, no ID, unknown (Windows) time zone, repeats by week number/set position/… — `Already imported: X will be updated`, the shortened-title count, and `Cancel` / `Import N`. Loading = "Reading file…"; no VEVENT = "No events in this file." with Import disabled; errors = inline `.alert` + `Choose another file`; offline (`navigator.onLine` read by the page) disables the input and Import with "You're offline". The browser keeps the File and posts it again with the chosen type on Import (no server-side copy). Our own parser (no dependency) unfolds folded lines, decodes `\\ \\, \\; \\n`, reads only the VEVENT's own UID/SUMMARY/DTSTART/DTEND/RRULE/EXDATE (TZID, VALUE=DATE, UTC) and skips VTIMEZONE/VALARM/VTODO/VJOURNAL: a VEVENT without UID is skipped "no ID", the first UID wins (later copies "duplicate UID"), an empty title is "Untitled", over 300 characters is cut to 300 by code points. `DTSTART` lands in the user's zone through `TZDate` (UTC and IANA TZID convert, floating stays local, Windows names are skipped "unknown time zone — not supported"); all-day `DTEND` sets `end_date = DTEND − 1 day`, a timed one only a later local day. `RRULE` only through `parseRRule` (FREQ/INTERVAL/BYDAY/BYMONTHDAY/UNTIL/COUNT), a UTC `UNTIL` converted to the local date first (an invalid date such as Feb 30 is skipped, never normalised), an `UNTIL` before DTSTART skipped; anything else (BYSETPOS, HOURLY/MINUTELY, BYWEEKNO, BYMONTH, WKST, out-of-range) skips that event with a reason, never a partial rule. EXDATEs become the item's local `exdates` (unparseable values ignored). Over 2 000 VEVENTs refuses with the count; `ROW_CAP` is checked for the whole batch before writing. One event = one ordinary item: chosen type (validated by `mustHave`), `source = NULL`, `ics_uid`, `repeat_from_completion = 0`, status todo, no reminders, never another user's calendar or a client-supplied owner id. Re-import matches live `ics_uid` rows in my default calendar only (a trashed row never matches, so a fresh row is inserted) and updates title/time/rule/exdates but not date; a UID missing from the new file is untouched (no silent delete); restoring or undoing the delete of the old trashed row clears its `ics_uid` when a live twin already owns the UID (it becomes an ordinary item; no unique-index crash). The whole import is one undo entry ("Imported N events", its button says Undo): Undo removes every inserted row and restores every updated row.
- **Undo (CORE).**
  - Ctrl+Z / Cmd+Z when focus not in input/textarea/contenteditable/editor/drawing canvas. In those, native/editor undo wins.
  - Covers: planner create/edit/move/resize/dup/delete, reschedule (postpone) + skip one occurrence of a series · Keep create/edit/reorder/binder move/pin/archive/trash/checklist · Pages page create/rename/move, block create/edit/reorder/dup/delete, DB record + safe property edits.
  - Newest first. One UI operation = one undo unit (item + its blocks). Restores order, dates, props, links. All-or-nothing; fail → error, state unchanged.
  - Refuse if target changed since (later edit/collaborator) → "can't undo safely".
  - Scope = this session (server journal with expiry, see DESIGN §11). Not version history. No redo. New action after undo starts new branch.
  - Toast after undo: centre of viewport, icon + "Undid: <action> '<title>'" + Ctrl+Z hint, 5 s, newest replaces old, doesn't block clicks, not over mobile nav.
  - Existing per-action Undo buttons route through same journal.
  - Tests: create→undo removes · move→undo restores date/time · delete item+blocks→one undo restores all · typing Ctrl+Z = text undo · two actions undo in reverse · permanent delete never "undone".
- **Alt-drag duplicate (CORE).** Alt held before/during drag, valid drop → new object (new id, new audit) at drop target; source untouched; copy selected; one undo. Invalid drop = nothing. Date/time/position from target. Never copies shares, reminders, private-flag changes, calendar membership beyond D-09 map. Until D-09: plain planner blocks only. Windows: swallow Alt keyup so Firefox/Edge menu bar doesn't grab focus.

## 3b. Item types (M1)

- **Type bar** (top of Month and Week cards): one chip per type = swatch + name. Click toggles show/hide (aria-pressed, hidden = struck-through name); filter saved per user. Ends with dashed **+**, "Neina (shared)" key, and "n / 10 types".
- **+ popover:** Name, colour (curated swatches, partner teal blocked), live chip preview, quick-add slug auto from name (`/sideproject`, editable), contrast check shown, "n slots left", Add type. Link "Manage all types in Settings". At 10: + disabled, tooltip says delete one first.
- **Settings › Item types:** table with reorder (drag + ↑↓), colour button, inline name, slug, usage count, "share titles by default" checkbox (pre-fills new share codes), Delete. Usage meter 7/10. Defaults: rename/recolour/reorder only. "No type" fixed, not counted.
- **Delete custom type:** dialog shows how many items + blocks use it, pick a type to move them to (default No type), "Delete and move", undo 5 s.
- **Type flags:** Counts down (checkbox; countdown badge on month chips, due list, phone Today). New-type popover has the Counts down box too.
- **Month calendar switch (v4 card 10, O-1 items 2–3, D-V4-11, D-V4-28):** one per-type switch in Settings › Types, on by default (old behaviour, migration 0011's `item_types.on_calendar = 1`), saved at once with no Save button and no undo (the switch is its own reversal). Off hides **my own** items of that type on the desktop Month grid and the phone Month page (dots + selected-day agenda) only; Week, the day planner, Today, due chips, Slipped, widgets, digest, reminders, ICS, search and the item page are unchanged. Partner/shared rows and `No type` are never filtered, planner blocks keep their dots, and a day whose only item is hidden looks empty (no "+N hidden"). Helper line: "Off = hidden on Month, still on Week, Today and reminders." `PATCH /api/item-types/[id]` takes `onCalendar` (boolean, strict) beside the other fields; missing/`undefined` counts as on. The phone Month server load applies the same rule, so no hidden item flashes before hydration. Phone: the types table hides the Order and Used columns — Colour, Name, Quick add, Month calendar and Delete fit 412 px at 48 dp with no sideways scroll, and Counts down / Share by default move to a stacked row under each type (also 48 dp).
- **Starter presets (v4 card 14, O-1 item 6, D-V4-11, D-V4-21):** Settings › Types has `+ Add a preset ▾` under the list: Class · Errand · Health · Chore · Study (colour dot + name), one tap each. A preset fills one free slot, after the last type, with that name, slug and colour; Class is the only one with Month calendar off, and each is otherwise a normal custom type (counts down off, share by default off), created in one `POST /api/item-types/presets` transaction, no undo entry (the type's Delete keeps its own). At 10/10 types the button is disabled and the helper reads "Remove a type to add more"; a preset whose name is already on the account is greyed with "(have it)". A slug already taken (e.g. a type with `/health`) creates nothing and shows the existing `bad_slug` error, "/health is used by <name>"; a failed or offline create shows the usual error toast and nothing is queued. `createSchema` takes `onCalendar` (boolean, default true), so the preset Class stores `on_calendar = 0`. The new type is usable at once: its chip shows on Home/Week after the refresh and `/class` (or `/errand`, `/health`, `/chore`, `/study`) fills the quick-add Type chip on desktop and in the phone Add sheet. Phone: the button and every sheet row are 48 dp, the menu is the shared `BottomSheet`, and Back closes it before the page.
- **Quick add:** each type's slug works in N palette, phone Add chips, and `/` menu. Old aliases kept (`/exam` → Deadline). Slug can't clash with `calendar cal both planner plan timeline block remind` or another type.
- **Sharing:** share-code type list shows all types incl. custom; new types default to hidden-as-Busy unless "share by default".
- Tests: add 10th ok, 11th blocked · rename keeps items · delete moves items + undo restores · slug clash rejected · hidden type disappears from month/week/planner only for that user · partner sees custom type as Busy unless code shows it · five presets fill 5→10 once with no undo entry, a taken slug creates nothing, a preset Class is off the Month and `/class` works.

## 4. Theme, timezone, planner defaults

- **Planner defaults card (Preferences):** Region style · Quick add goes to · Default block length. Line under it: "Visible hours now follow you to every device."
  - Region style sets week start (FullCalendar `firstDay`, Week map, phone strip), clock (24 h / 12 h everywhere incl. slots + quick add slots) and typed-date order (`16/11` D/M vs `11/16` M/D; the other order still accepted when it can't be valid).
  - Quick add goes to: default destination when no `/calendar` `/both` `/planner`; month double-click still defaults to Calendar.
  - Default block length: single typed time, chip/item dropped on timeline, Schedule button. Snap stays 15.
- Phone Settings mirrors all three as rows.

- Settings > Preferences: mode Light/Dark/Auto · light start · dark start · timezone (IANA picker, default "Malaysia (Kuala Lumpur, UTC+08:00)"). Show plain-text preview: "Light 07:00–16:59, Dark 17:00–06:59".
- Auto: light iff local time in [light start, dark start) — handles wrap when light start > dark start. Equal starts = D-08 (rec reject with message).
- Header sun/moon: click = set fixed Light/Dark (leaves Auto). Show which mode is saved.
- Change tz or schedule in Auto → recalculates immediately. Manual mode: schedule saves, theme doesn't move.
- Theme switch never changes view/selected date.

| Test | Setup | Expect |
|---|---|---|
| TH-01..04 | Auto, KL, 06:59 / 07:00 / 16:59 / 17:00 | Dark / Light / Light / Dark |
| TH-05/06 | Fixed Light 22:00 · Fixed Dark 10:00 | Light · Dark |
| TH-07/08 | Auto, change tz · change start | recalculated now |
| TH-09 | Switch while on Home | same view + date |
| TH-10 | Light 20:00, Dark 06:00 at 23:00 | Light (wrap) |

## 5. Keep

Layout: title · search · New note · binder nav · label filter · Pinned (if any) · notes · Archive + Trash links. Grid/list toggle EXT. Empty states: no notes (Create) · empty binder (add/create) · no match (show query, Clear) · empty Archive/Trash (info only, no Create).

| ID | Tag | Behaviour |
|---|---|---|
| K-NOTE | CORE | New note opens editable instantly. Title + body optional. Autosave on debounce + blur, no Save button. Totally empty note discarded on exit (tested). Save fail keeps text + retry. Android app only (card 13): a 48 dp mic in a text note turns speech into text at the caret (Android's own service, `RECORD_AUDIO` asked on the first tap after a short rationale); text only, nothing recorded, stored or sent; the web has no mic. |
| K-CHECK | CORE | Add (last empty row/Add), inline edit, check/uncheck one item only, reorder (drag + menu/keyboard), delete, nest (max D-10, never flatten silently), collapse. Completed stay visible (hide = optional filter). |
| K-IMG | CORE | Pick/paste image, progress, thumb, lightbox, remove ref (file kept if used elsewhere). Bad type/too big (limits from server, D-12) → readable error. Upload fail → note kept, retry. Broken preview → filename card. |
| K-DRAW | EXT | Canvas, strokes, canvas undo (wins over app undo while focused), clear (confirm/undoable), save, reopen + edit (vector data, not just PNG), remove. Palette/width/eraser/export spec before build. |
| K-LINK | EXT | URL auto-link, opens new tab, safe schemes only. Preview (D-23) never blocks save, never sends note text out; fail → plain link. |
| K-FILE | EXT | Attach, name + type icon, open/download if allowed, remove ref, protected by note access. No fake "previews for all". |
| K-LABEL | CORE | Create/rename/delete/apply/remove, many per note, filter by one or more. Delete label keeps notes. Long names wrap/truncate with full name accessible. |
| K-BINDER | CORE | Create/rename/delete/open/reorder, note in many binders, reorder notes inside. Remove from one ≠ remove from other. Delete binder keeps notes. No binder = general list. |
| K-COLOUR | EXT | Palette colour (look only). Background images = D-11. All text legible on all. |
| K-PIN | CORE | Pinned area, unpin returns to place, reorder active + binder lists. Trash never in pinned area. Pinned still searchable. |
| K-ARCHIVE | CORE | Out of default list, searchable with scope, open, restore. Keeps labels/binders. Reminders = D-16. |
| K-TRASH | CORE | Delete → Trash (gone from active + archive). Restore → active. Permanent = explicit second step. Shared file not deleted with note. Retention = D-17 (don't copy planner 30 d blindly). |
| K-SEARCH | CORE basic / EXT filters | Title, body, checklist text, labels, binders, type, has-attachment, scope (active/pinned/archive/trash). Debounced, query + filters visible, Clear. Order stated (no fake relevance). Opens exact note. Access-filtered. |
| K-REMIND | M6 | Add/edit/remove, many per note (no overwrite), show next on note, notification opens note. Relative needs a reference time; absolute date/time otherwise. |
| K-SHARE | LATER M7 | Registered user, view/edit, change, revoke, "shared" marker. Co-edit = D-05. |
| K-OFFLINE | LATER M8 | Cached notes viewable; queued edits shown pending; never "synced" offline; conflicts per D-06. |
| K-IMPORT | LATER M7 | Takeout: validate, preview counts, explicit start, never overwrite, keeps content/checklists/images/labels/colours/dates where mappable, report imported/skipped/failed. Export portable format, lists anything lost. |
| K-BACKUP | M1 infra | Server backup includes Keep rows + uploads (backup.sh must change, DESIGN §15). Per-user export ≠ admin backup. |

Tests KEEP-001..020: title+body persists · body-only valid · edit+leave persists · save fail keeps text · check one item only · nested child persists · 2 labels + 2 binders in both filters · delete binder keeps notes · delete label keeps notes · pin then archive → not in pinned · archive→restore · trash→restore · permanent needs confirm, gone · search finds checklist text · bad file rejected · image uploads + reopens · reminder shows + registered · bad Takeout fails safe, data unchanged · user A gets denied on B's note, no content in body · revoked share denied next request.

v4 (BREAKDOWN PR 1, D-V4-02): Restore from Trash works.

## 6. Pages

Layout: left tree (collapsible) + editor. Page header: title, menu, pin, copy link, share (M7), breadcrumbs.

| ID | Tag | Behaviour |
|---|---|---|
| PG-CREATE | CORE | New page (root/child/tree group) opens in editor. Empty title shows "Untitled" placeholder, never random title. |
| PG-ICON | CORE (v4, card 16) | One emoji per page from a curated 40 (no search, no full set). Desktop: 56 px button left of the title (`Add icon` when empty) opens a 320 px popover, 8 × 5 of 36 px cells, arrows/Enter/Esc, `Remove` top-right. Phone: page ⋯ row `Add icon` opens the shared BottomSheet, 6 columns of 48 dp; the icon draws at 44 px. The icon shows on the page, in the sidebar tree and on the graph label; `pages.findByTitle` returns it. One undo entry that keeps `pages.revision` (D-V4-22). View-only: icon shows, no picker; their PATCH is 403. |
| PG-ARCHIVE | CORE | Page ⋯ menu → Archive (also multi-select in Archive view). Leaves sidebar, pins (pin removed, say so in toast) and default search (search has "Include archived" toggle). Subpages archived with it, one undo unit. Opening an archived page (link, graph, search) shows top bar "Archived · Restore"; editing allowed. Internal links to it render normally with a small archived marker, never "unavailable". Archive view: search, sort (archived date, last opened, most linked), Restore per row, "Was in" path; restore returns to old parent, or root if parent gone/archived. Suggestions: pages not opened 90+ days, shown as a dismissible card with checkboxes; nothing archived without a click. Phone: All pages → Archive row. Never purged. |
| PG-TREE | CORE | Expand/collapse, open, child, move, reorder siblings, rename, menu, delete per D-18 (never destroy on one ambiguous click). Reject: self-parent, under descendant, into non-editable parent. Id stable, links survive. |
| PG-EDIT | CORE | Ordered blocks, insert before/after, empty page shows first-block prompt, save state visible, failed save keeps content. |
| PG-BLOCKS | CORE | paragraph · H1–H3 · bullet (Enter = next, empty Enter = exit, nest) · numbered · to-do (state persists) · divider · simple table · image (alt text required) · file · external link (safe URL) · internal page link · database. |
| PG-SLASH | CORE | `/` at start of empty block or insertion point → menu. Type filters, ↑↓, Enter inserts, Esc closes, click/tap, "no results". Not in URL/code/mid-word. Rule on cancel: slash + filter text stay as plain text (one rule, tested). |
| PG-MOVE | CORE | Menu: duplicate, delete, move up/down, convert (when valid), copy/cut/paste. Drag handle on hover/focus, drop line, bad drop = no change, touch uses menu. Multi-select EXT. |
| PG-INLINE | CORE | Bold, italic, underline, strike, inline code, link. Survives save/reopen/copy/move. |
| PG-TABLE | CORE | Grid, add/delete row/col, edit cells, keyboard cell nav, paste text, move/delete block. No sort/filter/types/relations/views/formulas. |
| PG-DB | CORE table / EXT views | Insert DB block or New database → default Title prop + table view. Props: title (empty = "Untitled"), text, number (must parse), date, checkbox, select (configured option), multi-select (configured, no dupes), url (safe scheme). Add/rename/reorder props; type change per D-19 (never silent corruption); delete prop with confirm if values lost. |
| PG-RECORDS | CORE | Add/edit/delete record, open as page (same identity, not copy), back to DB. Sort, filter, hide/show/reorder cols. |
| PG-VIEWS | EXT | Board (group by select, drag = change value) · Calendar (needs date prop; not the planner) · List · Gallery (cover source specced first). |
| PG-SORTFILTER | CORE | One sort rule (multi EXT) asc/desc, view only. Filters: prop + operator valid for type + value, visible AND/OR, clear one/all. Operator list written before build. |
| PG-REL | LATER | Relations (both ends navigable when reciprocal). Formulas/rollups not shown until specced. |
| PG-LINK | CORE | Search accessible pages, insert by id, shows current title, marked internal. Rename/move keeps working. Gone/denied → "unavailable", no cached content. |
| PG-SEARCH | CORE | Titles + text, shows where, opens page, permission-filtered (no titles/snippets leak). DB prop filtering = views, not search. |
| PG-GRAPH | CORE read-only (M5) / EXT filters | Nodes = accessible pages + page-backed records, titled (emoji icon + title when the page has one, card 16); click opens. **Archived pages included by default** (grey node, label ends "· archived"; legend swatch is dashed; italic only in the list view) with a "Archived pages (n)" toggle. Edges: parent-child, internal link; DB relation later. Pan, zoom, fit, select (title + context), drag = layout only. Filters: relation type, area, local graph (EXT). Inaccessible pages never drawn, no counts leak. Too big → local subset/filter. Keyboard-accessible node list. |
| PG-PIN | CORE | See §2. |
| PG-TEMPLATE | LATER | Templates = plain content. Workout tracker buildable by hand without them. |

Tests PAGE-001..022: create · child under parent · move under descendant rejected · rename linked page, link ok · `/` inserts paragraph + heading · cancel `/` consistent · reorder persists · duplicate independent · table add row/col persists · DB gets table view · number prop rejects text · records keep values · sort/filter correct · record opens as page · internal link opens · move target, link ok · graph shows accessible nodes/edges · node click opens · node drag no data change · 4th pin blocked · archive page → gone from sidebar + search, still in graph, link still opens · archive parent takes children, one undo restores all · restore returns to old parent · suggestions never auto-archive · workout tracker built from table/DB · A can't find B's private page (no title/snippet).

## 7. Files

- Pick file (paste/drop if reliable) → filename shown → progress → card. Never "attached" before upload + ref succeed. Fail → error + retry.
- Images inline preview; others name + type + size. Missing file → "unavailable", not dead link. Remove ref ≠ delete file.
- Every download checks access to a referencing note/page (or explicit grant). Knowing id/URL ≠ access.
- Shared page → its files readable while access lasts; revoke kills it. Sharing a page never shares linked pages, other pages, other notes, other files. Child inheritance D-01, DB records D-03.
- Last ref removed → cleanup after grace (D-12). Never delete file still referenced.
- Limits/types from server config (D-12), UI reads them, no hard-coded copy.

## 8. Page sharing (LATER M7)

- Share dialog names the page (not "workspace"): pick registered user, Can view / Can edit, list recipients, change, revoke. Public links = D-04.
- View: read page + allowed DB views/files, follow links only to independently accessible pages. No edits, no hierarchy/DB/permission changes.
- Edit: edit this page + allowed content. Never implies edit on linked pages.
- Revoke: gone from shared list, direct URL denied, search + graph drop it, its-only files denied, cache not treated as access.
- Live co-edit: others' saved changes appear without reload; conflict policy D-05 before build. Never silent overwrite.

## 9. Reminders (M6)

- Editor shows: source title, reference time, chosen offset/time, save, edit/remove.
- Commands exact: `/remind 1w|3d|2d|1d|2h` = before the item's date/time. Example: item 20 Nov 10:00 + `2h` → 20 Nov 08:00 user tz. Bad value → error, not guessed. Works in N quick add without changing existing grammar.
- Many per item, each listed, edit/remove each. Duplicate same item + same time → reject with message.
- Reschedule → relative ones recalc; old time never fires. Absolute ones stay unless user opts in.
- Push permission: explain first, ask only on user click, deny = app fine. Settings shows permission + subscription state. "Scheduled" ≠ "permission granted" ≠ "delivered".
- Notification: module, title, time context, opens item. Private details never to wrong account/device.
- All-day/past-due/quiet hours/archived = D-13..D-16. Don't pick midnight/09:00 silently.
- Daily agenda (v4 card 12, O-1 item 5): Settings › Notifications → `Daily agenda` Off / On + a time (default 07:30). One notification a day with that local day's own items and blocks: "4 items · 2 blocks · first 09:00" (first = the earliest timed item or block start; omitted when only all-day items are on; a zero count is left out). Nothing on, `notify_planner` off, or the time has not come yet = no notification; a day already sent to a live device is not sent again (the Android alarm covers app-only users). Web push title = the text, opens Today; the Settings preview is rendered once on the server, not live.

Tests NOTIF-001..011: each of 5 offsets correct · two reminders coexist · reschedule recalcs all · remove one only · deny permission, app ok, no "enabled" claim · notification opens item · after revoke, content stays hidden.

## 10. Mobile + PWA (Today screen M2, rest M8)

Purpose: phone = **glance + capture**. Not for planning the week. Planning = PC.

- **Breakpoint:** < 700 px wide → phone layout. Desktop layout never squeezed onto phone.
- **Bottom bar (fixed, thumb zone, 5 slots):** Today · Calendar · **+ Add** (true centre, 56 px) · Keep · Pages (#88). Labels + icons, active = pill + filled icon. A screen outside the tabs keeps the last tab lit. Safe-area padding.
- **Today (default route on phone):**
  - Header: date, ‹ › day step, "Today" jump. Swipe left/right = day step.
  - **Now card:** current block (title, type colour, time left) or "Free until HH:MM".
  - No "To do today" list (removed, owner 2026-11-16). Hold a timeline row ~0.5 s = delete with Undo.
  - **Timeline wheel:** fixed-height scroll area, snap per block, opens centred on now; scroll up = earlier, down = later. Rows shrink slightly away from centre. No "Back to now" chip (removed 2026-11-14), no "Show past" link.
  - Partner overlap: shown only if overlap on; striped + badge, read-only.
  - Empty: "Nothing planned. + Add something" button.
- **+ Add:** opens N quick add as full-width bottom sheet. Same grammar + the N palette's live slots (Type · Title · Goes to · Day · Time · Remind); `/` list opens upward above the keyboard. Keyboard up on open. Batch add stays.
- **Keep tab:** opens the note list (search, binder chips, + Note). Fastest new note = + Add → Quick note tab, or + Note on the list.
- **Undo on phone:** snackbar above the bar ("Note archived · Undo"), 5 s. Swipe left on a note = archive; same action also in the note's menu.
- **Item tap:** bottom sheet (title, time, status, notes, open full). Edit allowed, kept simple.
- **Account sheet** (avatar, #88; was the More tab): Settings, Shared with me, Keep archive, Trash, Help + tour, Sign out. Week + Month live in the Calendar tab (Week | Month switch; a month day shows its agenda below the grid, #95), pins in Pages. Theme toggle: Settings only on phone. `/more` still loads (old links).
- Moving/resizing blocks on phone: sheet with time pickers + "+15 / −15 min" buttons. No drag needed.
- Touch: tap/menu alternative for move/resize/reorder; big targets; long-press never the only way; scrolling never triggers destructive drag.
- PWA: manifest, icons, standalone; works un-installed too.
- Offline: cached shell ≠ cached data. Offline badge. Server actions don't fake success. Keep per §5.
- Push only where supported; else in-app + honest state.
- **Daily agenda (v4 card 12):** the app reads `digest: { at, text } | null` from `/api/native` and sets one exact alarm for the next digest time on the existing reminders channel (no Done/Snooze/Tomorrow; tap opens Today), re-added on every 15-minute sync and after a reboot. Off, nothing on the day, or a date the web push already sent = no alarm.

Tests MOB-001..010: phone opens on Today · now card correct at 3 times (in block / gap / after last) · + Add creates block from bottom sheet · Keep tap → new note, typing saves · status square cycles by tap · item sheet edits time without drag · More reaches Week/Month/Pages · no horizontal overflow at 360 px · installs standalone · offline visible, no fake success, push state accurate.

## 11. Onboarding (M8)

- Auto once (not done/skipped), state per user server-side.
- Steps: welcome · Home · planner blocks · quick add · Keep · Pages · finish. Skip steps for unavailable features.
- Spotlight one target, text beside not over, progress, Next/Back/Skip/Finish, target interactive only when step asks, resize → reposition or skip, never freeze.
- Settings > Help: restart tour, guides (Home/Week, Keep, Pages, reminders, mobile when shipped). Only shipped features.
Tests ONB-001..007: shows first login · skip saved · finish saved · no replay · restart works · resize safe · no unusable step.

## 12. Search across modules

Per-module first (Keep, Pages; planner search later). Results name their module. Unified search later with module filter + per-module access.

## 13. Deletion summary

| Thing | Rule |
|---|---|
| Planner item/block | existing soft delete, 30 d trash |
| Keep note | trash → restore / explicit permanent; retention D-17 |
| Binder / label | delete thing only, notes stay |
| Checklist item | remove, undoable |
| Page | Archive (reversible, never purged) or trash per D-18; never destroyed by one ambiguous action |
| Page block | delete block, keep file if referenced elsewhere |
| DB record | recoverable or confirmed, defined before release |
| DB property | warn if values lost; D-19 |
| File | ref removal ≠ file delete; shared refs protected |
| Page share | revoke ≠ delete page |

## 14. A11y

Keyboard everywhere (menus, dialogs, `/`, DB menus, Esc). Visible focus both themes. Icon buttons named; delete names target. Theme mode + notification state in text. Graph nodes reachable by keyboard / list. Colour never alone. AA contrast. Reduced motion respected; animation never needed to understand result.

## 15. Cross-module

- Keep → planner item: explicit action, user picks copy vs link. Not implicit. Not specced yet.
- Keep → Pages: later explicit "Create page from note"; copy/move + files rule specced first.
- Pages ↔ planner: later. No implicit duplication of calendar rows into DBs.
- Theme + tz: one setting for all modules incl. login, dialogs.

## 16. Screens

| ID | Screen | M |
|---|---|---|
| UI-001 | Header + pins | M1 |
| UI-002..005 | Home, Week, item peek, planner trash | KEEP |
| UI-006 | Settings > Preferences (theme, schedule, tz) | M1 |
| UI-007..013 | Keep list, note editor, checklist, binders, labels, archive, trash | M2 |
| UI-014 | Keep reminder editor | M6 |
| UI-015 | Keep image/file (M2), drawing (M2 EXT) | M2 |
| UI-016..019 | Pages workspace, editor, `/` menu, table | M3 |
| UI-020..021 | DB table view, record page | M4 |
| UI-022 | Graph | M5 |
| UI-023 | Page share dialog | M7 |
| UI-024 | Attachment card/viewer | M2 |
| UI-025 | Phone Today + bottom bar + Add sheet + item sheet | M2 |
| UI-026..028 | Phone Week/Month (read-first), Keep list, Pages | M8 |
| UI-029..030 | Tour, Settings > Help | M8 |

## 17. Regression + test data

Keep green: setup, login/remember/lockout, month chips, planner drag/resize/overnight, chip→block, N palette + live timeline, week drag/Not scheduled/heatmap/roll, peek, sign-up + share codes + overlap, theme, plan-ahead, reset-password.
New: header widths, pin cap, theme bounds + tz, undo focus rules, Alt-drag, Keep autosave fail, binder/label non-destructive, archive≠trash, file access, page move cycles, block persistence, table≠DB, prop validation, link stability, graph access, share revoke, reminder recalc, touch alternatives, tour state.
Fixtures: 2 users · private page · view-shared page · edit-shared page · private + shared file · nested pages + cross-links · DB with all prop types · note in 2 binders + 2 labels · notes in active/pinned/archive/trash · reminders in 2+ modules. Fresh DB per e2e. Never owner's real data.

## 18. Ready gates

Build when: PRD req known · behaviour + result defined · validation + failures listed · permissions defined · tests planned · its D-xx closed · deps ready.
Ship when: its tests + all regressions pass · keyboard + touch done · loading/empty/error/denied present · migration keeps data · backup/restore covers new data + files · access checks verified · docs describe only shipped stuff.

## FIX LOG (v1.0 → rev 1.1)

1. Header missing **Pages** link (2.3 vs PRD 5.2, vs own mobile 10.1) → added.
2. Priority labels P0–P3 clashed with repo phases P1–P3 → KEEP/CORE/EXT/LATER.
3. Own D-01..D-20 renumbered to PRD §12 single list (e.g. old FS D-05 Alt-drag = PRD D-09; old FS D-08 depth = D-10; old D-17 equal times = D-08).
4. Milestones aligned to PRD M0–M8 (screen table had sharing M6 vs PRD Release 6/TDD Phase 7; reminders "M2" vs TDD Phase 6).
5. Undo: "session only" vs TDD server journal → clarified: server journal, session scope, expiry.
6. Auto theme rule only covered default times → general wrap rule + test TH-10.
7. Keep search listed note type "attachment" that doesn't exist in schema → "has attachment" filter.
8. Keep backup listed as EXT; but uploads must be in backups the day files ship → M1 infra.
9. Slash-cancel rule left open → one rule set (text stays).
10. Alt-drag on Windows: Alt keyup steals focus to menu bar → swallow it.
11. Reminder duplicate behaviour was "define before build" → reject same item + same time.
12. Mobile reshaped: Today-first glance + capture, bottom bar Today · Keep · + Add · More; Today screen pulled to M2.
