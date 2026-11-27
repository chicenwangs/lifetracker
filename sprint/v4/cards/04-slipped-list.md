# Card 04 · feat: Slipped list

- Source: BREAKDOWN PR 4 (lines 30–37) · PLAN §3A, §5 items 2, 3, 5–7, §7 item 1, §8 PR 4 · DESIGN §4 question 2 (answered by O-4) · decisions O-1, O-4, O-10, D-V4-05, D-V4-17 · no board
- Needs: 03 · Size: M · Branch: `v4/04-slipped-list`

## What

A strip of overdue one-off items so nothing is lost: `itemsRepo.slipped(me, today)`, a collapsible "Slipped · N" strip at the top of the planner column on Home and at the top of Today, a reschedule action per row (the card 03 list), and "Move all to today" in one undo batch. Repeats never slip.

Owner decisions that apply: **O-1** (Slipped = one-off items only, plus from-completion series later; normal repeats never slip), **O-4** (starts collapsed in phone landscape only, expanded elsewhere), **O-10** (a toast never covers an open sheet's button row).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `itemsRepo.slipped(meId, today)` returns `{ items, total }`: top-level, live, own-calendar items with `COALESCE(end_date, date) < today`, `status` `todo` or `doing`, and no `rrule`; newest date first; `items` is capped at 50 rows and `total` is the true count of every matching row (not just the 50 shown).
- C2 The query excludes: done items, items dated today or later, steps (`parent_id`), every repeating item, trashed rows, items on a calendar someone shared with me, and items whose type is in `me.hiddenTypes` (untyped = `'None'`; D-V4-05).
- C3 Home (`app/src/routes/+page.server.ts`): the strip renders at the top of the planner column (`aside.right`, above `DayPlanner`), starting expanded, with header `Slipped · N` (N = total, not just the shown rows). It uses the real owner-local today, not the planner's `?d=` day.
- C4 Row: title (or "Untitled"), original date as full `prettyDate` (`Mon 18 Nov 2026`, `app/src/lib/time.ts:192-195`), clicking the row opens ItemView. The row `⋯` opens the shared `ActionSheet` (`app/src/lib/components/ActionSheet.svelte`, the same component Today rows use) with the card 03 list (Today · Tomorrow · Next weekday · +1 week · Pick date…; no `Skip this one` — a slipped row never repeats) and applies it to that item. No new menu component.
- C5 `Move all to today` keeps each item's time and multi-day span (same rule as card 03 `Today`) and is **one** request to **one** endpoint (`app/src/routes/api/items/move-all/+server.ts`, new, pattern `api/items/[id]/cycle/+server.ts`) that moves every matching row — all N, not just the 50 shown — in one `undoable()` batch; Undo restores every old date.
- C6 Empty: the strip is not rendered at all (no "nothing slipped" line, no header).
- C7 Phone: the same strip sits at the top of `/today`; tap = item sheet; swipe right = done, swipe left = delete (with Undo on the toast, phone rules); `⋯` = the shared `ActionSheet`; every control ≥ 48 dp; Back closes the sheet first; no key hints.
- C8 Collapse: on phone landscape the strip starts collapsed on **both** Home and `/today` (header with the count and chevron); desktop and phone portrait start expanded. Expanding/collapsing does not reload the page or change data.
- C9 Toast vs sheet: the toast is global (`UndoToast.svelte`, `.wrap` z-index 100) and, while a `BottomSheet` is open (`BottomSheet.svelte:182`, z-index 80), it sits 8 px above the sheet's top edge when that fits (portrait); in phone landscape the lift clamps so the toast stays fully on-screen, never over its button row (O-10, D-V4-17, D-V4-50).
- C10 States: empty → hidden (C6); loading → the strip comes with the server-rendered page, so no skeleton or spinner is added (D-V4-05); error in a bulk move → the server message shows in the usual row-mutation toast and every date is unchanged.
- C11 Permission/sharing: partner items and shared items never appear and have no row actions (own calendars only, C2). The bulk move only ever writes items the caller owns.
- C12 More than 50: the strip shows 50 rows plus "N more" as a count label (not a button) with the real remaining count; the total in the header matches.
- C13 Offline: `Move all to today` shows the usual offline toast and changes nothing — it is not queued (D-V4-17).

## Out of scope

- Repeating items slipping, including from-completion series (arrives with card 09 / migration 0011; BREAKDOWN line 31).
- A Slipped count in the daily digest or on the badge (O-1 item 5: digest counts today only, no slipped count).
- Planner blocks slipping (PLAN §3A: a past block is history, not a debt).
- Reminder/digest notification actions.
- Queueing the bulk move offline (D-V4-17: toast only).

## Files likely touched

- `app/src/lib/server/repo/items.ts` (`myCalendarIds` at 34, `dueOn` at 626 as the query pattern; add `slipped` returning `{ items, total }`)
- `app/src/routes/+page.server.ts` (load, line 7+)
- `app/src/routes/+page.svelte` (`aside.right` at 154, `<DayPlanner>` and its `top()` snippet at 155–180)
- `app/src/routes/today/+page.server.ts` (load)
- `app/src/routes/today/+page.svelte` (top of the day view)
- `app/src/lib/components/DueTodayChips.svelte` (row/label style reference)
- `app/src/lib/components/ActionSheet.svelte`, `app/src/lib/components/BottomSheet.svelte`, `app/src/lib/components/UndoToast.svelte`
- `app/src/lib/client/rowOps.ts` (`toggleDone`, `deleteRow`, `change`)
- `app/src/lib/client/rowGestures.ts` (phone swipe)
- `app/src/lib/client/reschedule.ts` (card 03 list)
- `app/src/lib/server/undo.ts` (`undoable` with N `targets` = one batch)
- `app/src/lib/time.ts` (`prettyDate`, `addDays`, `todayLocal`)
- `app/src/routes/api/items/move-all/+server.ts` (new endpoint)
- `app/tests/unit/helpers.ts` (`freshDb` + seed pattern), `app/tests/unit/v4-04-slipped.test.ts` (new), `app/tests/e2e/v4/04-slipped.spec.ts` (new; `app/tests/e2e/v4/` is a new directory), `app/tests/e2e/phone/v4-04-slipped.spec.ts` (new)

## Tests

- Builder: unit query (repeat excluded, done excluded, `hidden_types`, `end_date` span, own calendars, cap + `total`) in `app/tests/unit/v4-04-slipped.test.ts` with the `tests/unit/helpers.ts` fixture; desktop strip + bulk move + undo in `app/tests/e2e/v4/04-slipped.spec.ts`; phone strip + swipe + bulk move in `app/tests/e2e/phone/v4-04-slipped.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-04-blind.test.ts`, `app/tests/e2e/v4/04-blind.spec.ts`, `app/tests/e2e/phone/v4-04-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (planner, FR-H12 area).

## Decided

- Decided: D-V4-05 — Slipped respects `hidden_types` (untyped = `'None'`); one server endpoint with one `undoable()` batch for the bulk move; "N more" is a count label; errors use the toast like other row mutations; strip at the top of the planner column on Home and top of Today; no skeleton (server-rendered).
- Decided: D-V4-17 — the query returns `{ items, total }` with a 50-row cap; the bulk move moves all N matching rows; offline = toast, no queue; O-10's toast lift is a global 8 px rule in `UndoToast.svelte`; landscape collapse applies to both `/` and `/today`.
