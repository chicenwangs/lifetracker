# Card 30 · feat: reminders on page to-dos

- Source: BREAKDOWN PR 30 (lines 206–210) · PLAN §1b (line 36, the v2.1 backlog item), §3E (line 223: phase 12 "Editor depth (backlog)"), §8 PR 30 (line 294) · DESIGN §2.9 (lines 130–133; board D-P7 `wireframes/v4/index.html:429`), §2.1 item 6 (line 63: a to-do is a top-level block with the gutter menu), §0 (lines 9–15), §3 (lines 157–166) · `docs/v2/FEATURES.md` PG-BLOCKS line 115 · `docs/adr/003-block-storage.md:19-22` (replace-all saves, no stable block ids) · decisions — (none; card 15 adds the `page_todo` reminder source)
- Needs: 15 (`reminders.source_type` gains `page_todo`) · Size: M · Branch: `v4/30-page-todo-reminders`

## What

A to-do block on a page can carry a reminder, set from the block's ⋯ menu with the existing `Reminders.svelte` picker. The reminder shows as a 🔔 chip after the to-do text, fires like any other reminder (in-app, web push, Android exact alarm via `/api/native`), is cancelled when the to-do is ticked or the block is deleted, and respects `notify_pages`. One `reminders` row per reminder, source `page_todo`.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 A to-do block's ⋯ menu holds `Remind me…` — the `⋮⋮` menu when card 29 is merged, otherwise today's desktop block actions and the phone `Block` sheet (`PageEditor.svelte:305-333, 347-359`) — and the row is absent for every other block type; it opens the existing `Reminders.svelte` for that block (BREAKDOWN line 207; DESIGN lines 131, 63). The picker offers the exact-time rule only (`relative={false}`), because a page to-do has no date (Decided).
- C2 Adding a reminder writes one `reminders` row with `source_type = 'page_todo'` and `source_id` = the page id plus the to-do node's `id` attribute (Decided), owner = the signed-in user; the rule checks stay the existing ones (`reminders.addSchema`, past/duplicate/open-cap, `reminders.ts:114-153`), and `GET /api/reminders?source=page_todo&id=…` returns it (BREAKDOWN line 207).
- C3 The to-do with a scheduled reminder shows a 🔔 chip after its text with the local weekday and time (e.g. `🔔 Fri 09:00`, DESIGN line 132), rendered from the page load so it is there on first paint and after a reload; adding or removing a reminder updates the chip without a full page reload; clicking/tapping the chip opens the same picker (DESIGN line 132; board D-P7).
- C4 Ticking the to-do cancels every open reminder on it, strikes the chip through, and shows the toast `Reminder cancelled · Undo`; Undo recreates the same rules (same offsets/exact time) as `scheduled` reminders, so the reminder fires again (DESIGN line 133; board D-P7). The reminders table is not in the undo journal (`reminders.ts:184-186` says so), so this is a re-create, not a journal replay.
- C5 Deleting the to-do block (or the list that holds it) cancels its reminders on the next successful page save, by diffing the saved doc against the open `page_todo` reminders of that page: a reminder whose block identity is no longer present becomes `cancelled`, not deleted; undoing the page edit in the editor does not by itself resurrect the reminder (BREAKDOWN line 208 "projection diff").
- C6 Page lifecycle: a trashed page cancels its to-do reminders through the existing `sourceInfo(...).live` rule (`reminders.ts:25, 32-85, 167-179`); an archived page does not — archived pages keep their reminders firing, the same way archived Keep notes do (D-16, `reminders.ts:70`).
- C7 The source is a first-class reminder source: `sourceInfo` gains a `page_todo` branch (title = the to-do's text, route = `/pages/<pageId>`, kind `pages`), `REMINDER_SOURCES` (`schema.ts:650`) and the API enum (`api/reminders/+server.ts:7, 14`) include it, `upcoming()` (`reminders.ts:247-266`) lists it when `notify_pages` is on, and `/api/native` (`native.ts:118`) ships it to the Android exact alarms; the Java side passes `sourceType`/`sourceId` through unchanged (`mobile/.../Reminders.java:54, 69-84`), so no Android code change. `sourceId` must fit the API's `max(40)` (`api/reminders/+server.ts:14`).
- C8 Permission: reminders are owner-only — on a page shared with me (view or edit) no `Remind me…` row is offered, and the reminders API answers 404 for a page I do not own, because `sourceInfo` scopes every lookup to the reminder owner (`reminders.ts:32-85`); a reminder id that is not mine is 404 (`reminders.ts:161-164`). Whether a shared editor may keep their own reminder is Decided.
- C9 Several reminders on one to-do are allowed and listed by the existing picker (like every other source); removing one deletes only that row (`reminders.ts:161-164`); the existing 500-open cap and duplicate-instant rule still apply.
- C10 Phone: the row is ≥ 48 dp in the block action surface, the picker is the shared `BottomSheet` (its rows 48 dp), Back closes the sheet before the page, and no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN §0 lines 11, 15).
- C11 States (DESIGN §3): loading — the picker shows `None yet.` until its list arrives (no spinner); empty — a to-do with no reminder has no chip; error — the picker's inline `.alert` shows the server message (`Reminders.svelte:99`), and a failed page save keeps the chip as it was; offline — adding a reminder fails with the usual offline toast and nothing is queued (DESIGN line 164); read-only share — no row, no chip interaction (C8).
- C12 Undo: adding and removing a reminder keep today's immediate behaviour (no journal, no Ctrl+Z); the tick-cancel of C4 is the only new undo, and its Undo restores the cancelled reminders; the block delete of C5 has no separate undo beyond the editor's page undo (AGENTS.md "Page editor keeps its own history"; `undo.ts:12`).
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages PG-BLOCKS row and the tests line), `docs/SERVICE-HANDOFF.md` only if it lists reminder sources.

## Out of scope

- A due date or "scheduled" field on a page to-do itself (Decided), repeating reminders on to-dos, or reminders on to-dos inside a callout/toggle.
- Planner reminders (cards 03/09), Keep reminders, database-record reminders, or the digest.
- Notifications on the phone for a page that is open in the editor; a reminder banner UI.
- Reminders inside an imported page (card 27) or a starter template (card 26).
- Changing the Android Java reminder code or the alarm channel.

## Files likely touched

- `app/src/lib/server/reminders.ts` (`Source` 14, `sourceInfo` 32–85, `add`/`list`/`remove` 124–164, `recalc` 167–179)
- `app/src/lib/server/schema.ts` (`REMINDER_SOURCES` 650, read-only: card 15 changed it)
- `app/src/routes/api/reminders/+server.ts` (`SOURCES` 7, schema 13–15)
- `app/src/routes/api/reminders/[id]/+server.ts` (read-only)
- `app/src/lib/components/Reminders.svelte` (source union 18, render 61–100)
- `app/src/lib/server/repo/pages.ts` (`update` 226–275: cancel orphaned `page_todo` reminders in the save transaction; `check`/`NODES` 98–168 if a block id attr is added)
- `app/src/lib/editor/PageEditor.svelte` (the to-do menu row, the taskItem chip/decorations, `onUpdate` tick detection 167–220)
- `app/src/lib/editor/extensions.svelte.ts` (a task-item extension/decoration for the 🔔 chip and the menu row; no new page node)
- `app/src/routes/pages/[id]/+page.server.ts` (open to-do reminders for the page in the load)
- `app/src/lib/types.ts` (`ReminderDTO` 213–220, `PageDTO` 157–170 for the chip data)
- `app/src/lib/server/native.ts` (`upcoming` call 118, read-only)
- `mobile/android/app/src/main/java/io/github/chicenwangs/lifetracker/Reminders.java` (read-only)
- `app/tests/unit/reminders.test.ts`, `app/tests/unit/pages.test.ts`, `app/tests/unit/v4-30-page-todo-reminders.test.ts` (new)
- `app/tests/e2e/v4/30-page-todo-reminders.spec.ts` (new), `app/tests/e2e/phone/v4-30-page-todo-reminders.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — `sourceInfo('page_todo')` for a live/trashed page and a present/deleted block, add/list/remove, tick cancels all open ones, the save diff cancels a deleted block's reminder and leaves an untouched one, `upcoming()` includes it only with `notify_pages` on, a route of `/pages/<id>` — in `app/tests/unit/v4-30-page-todo-reminders.test.ts`; desktop e2e add a reminder from a to-do's menu → chip `🔔 …` → reload → still there → tick → `Reminder cancelled · Undo` → Undo restores → delete the to-do → save → reminder cancelled — `app/tests/e2e/v4/30-page-todo-reminders.spec.ts`; phone menu row + sheet + 48 dp + Back — `app/tests/e2e/phone/v4-30-page-todo-reminders.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-30-blind.test.ts`, `app/tests/e2e/v4/30-blind.spec.ts`, `app/tests/e2e/phone/v4-30-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages; §9 Reminders source list if it names them).

## Decided

- Decided: D-V4-46 — add an `id` attribute to top-level block nodes and use `source_id = pageId:nodeId`; absolute reminders only (relative=false); unticking does not restore a cancelled reminder; owner only.
