# Card 09 · feat: repeat from completion

- Source: BREAKDOWN PR 9 (lines 66–73) · PLAN §3A (lines 78–82), §7 item 1 (line 233), §8 PR 9 (line 266) · DESIGN §1.1 (lines 21–26, board D-R1) · decisions O-9, O-11, O-1 item 1, D-V4-10, D-V4-27
- Needs: 04, 07, 08 · Size: M · Branch: `v4/09-repeat-from-completion`

## What

An optional counting rule for daily and monthly repeats: "Every 3 days, counted from when you finish". A from-completion series shows only its next date everywhere (one row, no future ghosts); marking it done files a done copy dated today and moves the series to today + interval. The option is shown only for a `DAILY` or `MONTHLY` rule with no BYDAY, no UNTIL and no COUNT, and never for yearly — a `WEEKLY` rule always carries BYDAY, so it can never qualify (D-V4-27). Card 04's Slipped list picks the series up when it is overdue; card 07's ICS export writes it as a single event.

Owner decisions that apply: **O-9** (hidden for rules with UNTIL or COUNT), **O-11** (finishing one occurrence resets the series status to `todo`, normal repeats and from-completion alike), **O-1** item 1 (only one-off items and from-completion series can slip).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 In `ItemView.svelte`'s Repeat box, below the frequency row, show `Next one counts from` with two radios: `Scheduled date` (selected by default) and `When I finish it`. The row is shown only when the item has an `rrule` with `FREQ` `DAILY` or `MONTHLY`, no `BYDAY`, no `UNTIL` and no `COUNT` (O-9, D-V4-27); it is hidden for `YEARLY`, for `WEEKLY` (the builder always sets BYDAY, `ItemView.svelte:296-297`) and for any BYDAY rule, and a PATCH whose rule stops qualifying clears `repeat_from_completion` to 0 in the same edit.
- C2 Choosing `When I finish it` saves `repeatFromCompletion: true` through the existing `save()` → `PATCH /api/items/:id`; choosing `Scheduled date` saves `false`. The flag survives a reload of the item sheet, the PATCH writes one undo entry (the existing journal, `app/src/routes/api/items/[id]/+server.ts:22-37`), and editing a from-completion series never opens the this/following/all dialog — the whole row is edited (D-V4-10).
- C3 The Repeat box shows the summary line "Daily, counted from when you finish" for interval 1 and "Every 3 days, counted from when you finish" for interval N (same shape for months; `describeRRule` wording may be extended, not replaced) and the existing Repeat select/end controls still work for the same rule.
- C4 Display rule: a from-completion series appears exactly once in every view — Month, Week, Today, the planner's due chips, `/month`, `/api/native` (widgets) and item rows — at its stored `date`, with no occurrences on later dates; `id@date` is only valid for that one date, and any other `@date` is 404 (`app/src/lib/server/itemview.ts:15-23`, `itemsRepo.isOccurrence`). The rule lives in `itemsRepo.inRange` (which `filterItem` and `calendar.ts:40` then serve unchanged), so a shared calendar shows the same single row. Old `exdates` stay stored but dormant while the flag is 1 (D-V4-10).
- C5 Marking it done (a row tick, the item sheet, or a reminder's `Done` action — all reach `items.patch`/`items.cycle`) creates a done copy with status `done`, `completed_at` = now, date = **today in the owner's timezone**, the series' title, type, private flag, time and notes, `end_date` = today + the series' span (none when the series has none), and **no** `rrule`, `ics_uid` or `exdates`, `repeat_from_completion` 0 (history). It happens only when the resulting status is `done`; a todo→doing tick moves nothing.
- C6 The same action moves the series' `date` to today + the rule's interval: daily + N days, monthly + N months clamped to the last day of the target month; an existing `end_date` shifts by the same delta so `end_date >= date` always holds; the series' status becomes `todo` and its `completed_at` is cleared (O-11). Examples to test: daily every 3 days done on the due day → +3; done 2 days early → +3 from the completion day; monthly on 31 Jan done 31 Jan → 28/29 Feb.
- C7 A from-completion series that is overdue (`COALESCE(end_date, date) < today`, not done) appears in `itemsRepo.slipped` (card 04) as one row; a normal repeating item still never slips (O-1 item 1), and done items do not.
- C8 Reminders: after the completion, an open relative reminder on the series has `due_at` recalculated from the moved date (new date - offset) and never stays on the old occurrence; `recalcOwner` after the PATCH is the path, and `POST /api/items/:id/cycle` (`cycle/+server.ts`, which has none today) also calls `recalcOwner`, so a status-square tick moves them too. A reminder that already fired cannot be recalculated: the completion recreates the next one from the fired row's rule for the new date. `advanceRepeating` does nothing for a from-completion series - one reminder per scheduled date, moved only on completion (D-V4-10) - and an exact-time reminder stays at its chosen instant. A completion cancels the finished occurrence's reminders - every exact/snoozed row (scheduled, processing, sent or missed), the relative rows already fired, and the acting row whatever its kind - in the same undo entry, so Done on a cancelled one is a 404 and files no second copy; scheduled relative rules are standing rules and move with the date. A reminder Done always names the live series date, so that cancellation, not a date comparison, blocks a repeat Done.
- C9 Undo: the completion is one undo entry that restores the series' old `date` and `status` and deletes the done copy (BREAKDOWN line 72). The copy is a second new row, so `items.patch` reports its id and the route passes it to `undoable` as a created target (`app/src/routes/api/items/[id]/cycle/+server.ts:14` does this for the split copy today); the sheet and the response's `item` stay on the series row, not the copy. Undo also recalculates the series' next relative reminder from the restored date, so no reminder is left on the new date.
- C10 ICS export (card 07 `app/src/lib/server/ics.ts`): a from-completion series exports one VEVENT at its `date`, with no `RRULE` and no `EXDATE` (BREAKDOWN line 71); the VEVENT is absent when the date is outside the feed's −30…+365 range.
- C11 Phone path: the two radios are rows in the phone item sheet with a label hit area ≥ 48 dp, Back closes the sheet first (`use:backCloses` on the sheet), no "Ctrl/Click/Esc" copy, and the summary line wraps inside the sheet without horizontal scrolling. The sheet stays open after the change, like the other repeat fields.
- C12 States (DESIGN §3): no new screen. Empty = no repeat rule → the whole Repeat block (C1) is absent; unsupported rule (YEARLY, WEEKLY, BYDAY, UNTIL, COUNT) → the radio row is hidden and the stored flag is cleared (C1, D-V4-10); error = a failed PATCH uses the item sheet's existing error surface and the radio returns to the stored value; loading = the sheet's data is already loaded.
- C13 Permission/sharing: a partner viewing the shared calendar sees the same single row, never the future ghost occurrences; only the owner can set the flag (PATCH is owner-scoped), and a partner's copy of the item is not modified by it.
- C14 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§3 planner, repeating items), and `docs/v4/DESIGN.md` §1.1 — drop the item-row `↻✓` glyph line (D-V4-10/D-V4-27: the state shows in the item sheet summary only) and keep the radios and the summary copy. PRD D-xx wording is card R1's job.
- C15 O-11 on normal repeats: finishing one occurrence of a scheduled-date (`repeat_from_completion = 0`) series leaves the series row at `status = 'todo'` with `completed_at = NULL` while the detached done copy keeps `done`; a series row that was `done` is reset the same way. Covers both the row tick and `/cycle`.

## Out of scope

- Quick-add grammar for from-completion (no syntax in BREAKDOWN PR 9; it is set in the item sheet only).
- Yearly from-completion, weekly from-completion and BYDAY combinations (hidden by C1).
- A "completion streak" / history screen; the done copies are ordinary done items.
- Changing normal (scheduled-date) repeat behaviour beyond O-11's status reset.
- Notifications copy for a moved series beyond C8.

## Files likely touched

- `app/src/lib/components/ItemView.svelte` (repeat state 259–334, Repeat box 623–753, sheet header 27–55)
- `app/src/lib/server/repo/items.ts` (`inRange` 108–164, `isOccurrence` 310–314, `patch` 350–476, `detachOccurrence` 325–348, `cycle` 479–482, `toDTO` 43–65, card 04's `slipped`)
- `app/src/lib/server/access.ts` (`filterItem` 26–45 — stays as is; the one-row rule is upstream in `inRange`)
- `app/src/lib/rrule.ts` (`parseRRule`, `formatRRule`, `expandRRule`; a pure `nextFromCompletion()` helper is fine here)
- `app/src/lib/server/reminders.ts` (`nextRepeatDue` 88–108, `advanceRepeating` 201–245, `recalcOwner` 344)
- `app/src/lib/server/itemview.ts` (occurrence check 14–24)
- `app/src/lib/server/native.ts` (`week`, `days`, `countdowns` read `getCalendar`)
- `app/src/lib/server/ics.ts` (new in card 07)
- `app/src/lib/types.ts` (`ItemDTO` gains `repeatFromCompletion`)
- `app/src/routes/api/items/[id]/+server.ts` (PATCH journal + `recalcOwner` line 35; the copy becomes a created target)
- `app/src/routes/api/items/[id]/cycle/+server.ts` (`created` copy line 14; add `recalcOwner`)
- `app/tests/e2e/phone/repeat.spec.ts` (existing repeat patterns)
- `app/tests/unit/repeat-rules.test.ts`, `app/tests/unit/rrule.test.ts`
- `app/tests/unit/v4-09-repeat-completion.test.ts` (new), `app/tests/e2e/v4/09-repeat-completion.spec.ts` (new), `app/tests/e2e/phone/v4-09-repeat-completion.spec.ts` (new)

## Tests

- Builder: unit next-date (done early, done late, month end, interval 1 and N, `end_date` shifted with the date) and the unsupported-rule matrix (weekly, yearly, BYDAY, UNTIL, COUNT) in `app/tests/unit/v4-09-repeat-completion.test.ts`; unit one-row display (also through a shared calendar), the full done-copy field list, one undo entry covering series + copy, the recreated reminder, and O-11 on a normal repeat in the same file; e2e "water plants every 3 days" done → shows +3 from today → Undo restores the old date in `app/tests/e2e/v4/09-repeat-completion.spec.ts`; phone radio + 48 dp in `app/tests/e2e/phone/v4-09-repeat-completion.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-09-blind.test.ts`, `app/tests/e2e/v4/09-blind.spec.ts`, `app/tests/e2e/phone/v4-09-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§3 planner), `docs/v4/DESIGN.md` §1.1 (drop the row glyph).

## Decided

- Decided: D-V4-10 — any daily/weekly/monthly rule with no BYDAY qualifies (interval 1 included); a PATCH that stops qualifying clears the flag; one reminder per scheduled date (`advanceRepeating` does nothing for from-completion; it moves on completion); no this/following dialog, edit the whole row; exdates stay dormant while the flag is 1; show the state in the item sheet summary only.
- Decided: D-V4-27 — daily and monthly only (a weekly rule always carries BYDAY); `end_date` shifts by the same delta; the completion journals the done copy and the sheet stays on the series; the cycle route gains `recalcOwner`; a fired reminder is recreated for the next date; O-11 covers normal repeats (C15); the copy's full field list (C5); the DESIGN labels and "Daily, counted from when you finish"; DESIGN §1.1 loses the row glyph; the one-occurrence rule lives in `inRange`/`filterItem` so shared calendars match.
