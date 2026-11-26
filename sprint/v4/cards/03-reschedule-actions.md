# Card 03 · feat: reschedule action set + Postpone / Skip

- Source: BREAKDOWN PR 3 (lines 21–28) · PLAN §3A, §5 items 5–7, §8 PR 3 · DESIGN §0 (every mutation has undo) · decisions D-V4-04, D-V4-16 · no board (`wireframes/v4/index.html` covers v3.3 + v4.0 only)
- Needs: **02** (both cards edit `ItemView.svelte`: 02 changes its Close/keyboard-hint copy, 03 adds `Postpone ▾` beside the Date field; build 02 first and rebase this card on it)
- Size: S · Branch: `v4/03-reschedule-actions`

## What

One reschedule list, built once and reused: `Today · Tomorrow · Next weekday · +1 week · Pick date…`, plus `Skip this one` on a repeating occurrence. It lives in ItemView (the item sheet, desktop and phone) and in the existing Today row `⋯` sheet; card 04 (Slipped) reuses the same list. Postpone moves the date (or detaches the shown occurrence of a repeating item); Skip removes one occurrence of a series. Undated items hide Postpone; offline postpone queues and Skip shows the offline toast.

Owner decisions that apply: none directly. O-9 / O-11 (repeat rules) belong to card 09; nothing here changes repeat behaviour.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `app/src/lib/client/reschedule.ts` exposes `targetDate(kind, today)` — pure, returns the owner-local `YYYY-MM-DD` for `today | tomorrow | nextWeekday | plusWeek`, built with `addDays` / `weekdayOf` from `app/src/lib/time.ts`, no `tz` argument (D-V4-04) — and `reschedule(row, kind, refresh)`, which applies it through the existing row-mutation path in `app/src/lib/client/rowOps.ts` (`change()`, lines 21–38: one PATCH, one undo entry, toast, offline queue; export the helper if it stays private).
- C2 Next weekday: Mon–Thu → the next day; Fri, Sat, Sun → Monday. Fixture dates: Fri 2026-01-30 → Mon 2026-02-02 (month rollover), Fri 2027-12-31 → Mon 2028-01-03 (year rollover), Sat 2026-11-28 → Mon 2026-11-30, Sun 2026-11-29 → Mon 2026-11-30.
- C3 Item sheet (`ItemView`, desktop and phone): a `Postpone ▾` control sits beside the existing Date field (`.props` row, `ItemView.svelte:595-602`) and offers exactly five items in this order: Today · Tomorrow · Next weekday · +1 week · Pick date…. On a repeating occurrence a sixth item, `Skip this one`, follows `Pick date…` (C8). Choosing one PATCHes `{date}` (and `endDate` for a multi-day item) and moves the item.
- C4 Postpone keeps the time, and a multi-day item's `endDate` moves by the same span (existing PATCH rule).
- C5 Undo: each postpone is one undo entry; the toast says the item moved and offers Undo; Undo (or `Ctrl+Z`) restores the old date and end date. If Undo removes the row that is open (a detached occurrence), the sheet closes instead of showing a row that no longer exists (`ItemView.svelte:152` already falls back from a deleted row; D-V4-16).
- C6 Occurrence: postponing `id@date` detaches that one occurrence — PATCH `{date}` on the occurrence id adds one EXDATE and creates a standalone row, the series keeps its other dates and no scope dialog appears (D-V4-16). The open sheet follows the detached row, as it does today for a date edit.
- C7 Linked block: postponing an item that has a planner block leaves the block where it is; the one toast (D-V4-04) says the item moved and names the block's day as `prettyDate(block day)` (e.g. `Mon 30 Nov 2026`). With several linked blocks the earliest by start is named (the D-V4-08 rule). An item with no block gets the plain moved toast.
- C8 `Skip this one` appears only on a repeating occurrence (`id@date` with an `rrule`), in the same list, after `Pick date…`, and is hidden on a non-repeating item. It calls `POST /api/items/<id@date>/skip` (new route, pattern `app/src/routes/api/items/[id]/cycle/+server.ts`), which adds exactly one EXDATE for that date (no new row, series unchanged otherwise) and returns an undo ref.
- C9 Skip undo: one undo entry; Undo removes that EXDATE and the occurrence is back.
- C10 Skip reminders: after Skip nothing fires for the skipped date; a relative reminder on the series is due at the next occurrence (the existing `recalc` path), and an absolute reminder due inside the skipped occurrence no longer fires (D-V4-04).
- C11 Permission: the item sheet only ever shows an item the viewer owns (`app/src/lib/server/itemview.ts` uses `mustOwn`; a foreign id is 404), so there is no shared read-only sheet to check and no Postpone/Skip on partner or shared rows. The server PATCH/skip still calls `mustOwn` and returns 404 for a foreign id (asserted at API level).
- C12 Phone path: the set is in ItemView (both platforms) and in the existing Today row `⋯` sheet, which opens the shared `ActionSheet` with the same list (incl. `Skip this one` where it applies). No new Week/Month row menus (D-V4-04); rows ≥ 48 dp; Back closes the sheet first; no key hints.
- C13 States: a refused save (400/404; an item PATCH has no 409) shows the server message in an error toast and leaves the date unchanged; the list has no loading state (it appears immediately, the toast follows the response).
- C14 Undated item: `date === null` hides `Postpone ▾` (nothing to move; D-V4-04).
- C15 Offline: a postpone is queued like other item PATCHes (`rowOps.change` → "Waiting to sync" toast) and applied when back online; Skip shows the offline toast and changes nothing — no queue (D-V4-04).

## Out of scope

- The Slipped list itself (card 04) and "Move all to today" (card 04).
- Reminder edits from the action list, digest notification actions (`PLAN` §3A "digest notification (later)").
- Any repeat rule change (`PLAN` §7 item 1, O-9/O-11, D-V4-10, card 09).
- Queueing Skip offline (D-V4-04: toast only).
- New Week/Month row `⋯` menus (D-V4-04).

## Files likely touched

- `app/src/lib/client/reschedule.ts` (new)
- `app/src/lib/components/ItemView.svelte` (date field at 595–602; save/follow/toast helpers)
- `app/src/lib/components/ActionSheet.svelte` (shared phone sheet)
- `app/src/routes/today/+page.svelte` (`actionsFor` at 138, `ActionSheet` at 331)
- `app/src/routes/api/items/[id]/skip/+server.ts` (new; pattern: `app/src/routes/api/items/[id]/cycle/+server.ts`)
- `app/src/lib/server/repo/items.ts` (`patch` at 350, `addExdate` at 316, `detachOccurrence` at 325 — export a `skip()`)
- `app/src/lib/server/undo.ts` (`undoable`; the series row snapshot restores its `exdates`)
- `app/src/lib/server/reminders.ts` (`recalc` at 167; cancel an absolute reminder due inside the skipped occurrence)
- `app/src/lib/client/rowOps.ts` (`change()` toast + undo + offline queue, lines 21–38)
- `app/src/lib/rrule.ts` (`splitOccId` at 44, `parseExdates` at 54)
- `app/src/lib/time.ts` (`addDays`, `weekdayOf`, `prettyDate`)
- `app/tests/unit/v4-03-reschedule.test.ts` (new), `app/tests/e2e/v4/03-reschedule.spec.ts` (new; `app/tests/e2e/v4/` is a new directory), `app/tests/e2e/phone/v4-03-reschedule.spec.ts` (new)

## Tests

- Builder: unit `targetDate` (C2 fixtures, month end, year end) and "skip writes one EXDATE" (C8) plus an absolute-reminder fixture due on the skipped date (C10) in `app/tests/unit/v4-03-reschedule.test.ts`; desktop postpone + undo + Skip (C3–C7, C9) in `app/tests/e2e/v4/03-reschedule.spec.ts`; Today row sheet (C12) in `app/tests/e2e/phone/v4-03-reschedule.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-03-blind.test.ts`, `app/tests/e2e/v4/03-blind.spec.ts`, `app/tests/e2e/phone/v4-03-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (planner actions, undo coverage).

## Decided

- Decided: D-V4-04 — drop `tz` from `targetDate`; Skip cancels any reminder due inside the skipped occurrence (relative and absolute); undated items hide Postpone; postpone queues offline, Skip shows the offline toast; the shared set lives in ItemView + the existing Today row sheet (no new Week/Month row menus); one combined toast when a linked block stays.
- Decided: D-V4-16 — Postpone on a repeating row detaches the shown occurrence with no scope dialog; the set is in ItemView on both platforms plus the Today row sheet; after Undo the sheet closes if the row is gone; `Needs: 02` because both cards edit `ItemView.svelte`.
