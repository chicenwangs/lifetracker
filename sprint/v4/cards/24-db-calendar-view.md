# Card 24 · feat: DB calendar view

- Source: BREAKDOWN PR 24 (lines 173–176) · PLAN §1b (line 31), §2 (line 61), §3E item 7 (line 144), §8 PR 24 (line 288), §8 line 299 (23–25 share `DatabaseView.svelte`: land 23 first) · DESIGN §2.7 (lines 113–119; boards D-DB2 `wireframes/v4/index.html:364`, M-DB1 `:352`), §0 (lines 9, 11, 13), §3 (lines 157–166) · `docs/v2/FEATURES.md` PG-VIEWS line 122 ("Calendar (needs date prop; not the planner)") · decisions — (none; no migration)
- Needs: 23 (view tabs + ⚙ settings pattern) · Size: M · Branch: `v4/24-db-calendar-view`

## What

A database gets a Calendar view: a month grid shaped like the planner's Month view, fed by one date property of the database. A record shows as a chip on its date, clicking an empty day creates a record dated that day, and records with no date sit in a "No date" rail. Database records never appear on the planner calendar — the two systems stay apart.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Card 24 adds `Calendar` to the `+` picker built in card 23 (`DatabaseView.svelte`), so a view with `view_type = 'calendar'` is created through it and survives a reload (D-V4-35 left this row to this card; the column already accepts `calendar`, `schema.ts:637`). The view shows its settings in ⚙: only `Date property`, offering only properties of type `date` (`PROP_TYPES`, `dbvalues.ts:4-13`); the choice is saved in `config_json` and survives a reload (DESIGN line 115; `viewConfigSchema`, `repo/databases.ts:288`). With no date property it offers `Add a date property` (D-V4-36; C11).
- C2 The month grid borrows the MonthCalendar *look*, not its FullCalendar data code (`app/src/lib/components/MonthCalendar.svelte`): seven columns, a weekday header row, the month title (`monthLabel`, `time.ts:205`) with `‹ Today ›`, and the current month on open. DESIGN line 119; BREAKDOWN line 174.
- C3 A record whose date property has a value shows as a chip with its title on that day; nothing shows for a record dated in another month. Dates are the stored `YYYY-MM-DD` strings (`checkValue`, `dbvalues.ts:37, 51-52`) compared as strings — no `new Date('YYYY-MM-DD')` (`CLAUDE.md`), and "today"/the current month come from `todayLocal(page.data.user?.timezone)` (`time.ts:87`).
- C4 Clicking an empty day creates a record with the view's date property set to that day (`POST /api/databases/:id/records` with `values`, `api/databases/[id]/records/+server.ts:7-11`) and the new chip appears on that day and stays there; the record is not opened (D-V4-36). BREAKDOWN line 174.
- C5 A right rail lists `No date (n)`, n = records with no value for the chosen date property; each row opens the record page (D-V4-36). The rail is 220 px (D-V4-36); the phone form is C10. DESIGN line 119.
- C6 `‹ Today ›` steps one month back or forward and returns to the current month, and the chips re-render for the shown month; a record added with a date in a shown month appears there after the create. Board D-DB2.
- C7 Records never leak into the planner: `/month`, `/week`, `/today`, the widgets, the daily digest and `/api/native` are unchanged by this view, and no chip gets an item type or a planner colour (BREAKDOWN line 175; PLAN line 144; FEATURES PG-VIEWS line 122).
- C8 The view's filter and sort still decide which records the calendar shows (the same `dbs.get()` path as the table, `repo/databases.ts:104-120`): a filtered-out record gets no chip and is not counted in `No date (n)`. FEATURES PG-SORTFILTER line 123.
- C9 Undo: clicking a day shows `Created · Undo`; Undo deletes the created record through card 23's `+ New` path, so its chip disappears and the count returns (D-V4-36; CLAUDE.md undo rule; DESIGN line 13). A double click creates one record. A record's date is not edited from this view (Out of scope), so this card adds no date-change undo.
- C10 Phone: the grid shows dots instead of chips, tapping a day lists that day's records under the grid, and `No date` is a chip at the bottom; day cells, day rows and the chip are ≥ 48 dp, Back leaves the view as before, no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN line 119; §0 lines 11, 15).
- C11 States (DESIGN §3): loading — `Loading database…` (`DatabaseView.svelte:217-218`); empty — a month with no chips plus `No date (0)`; no date property — `Add a date property` plus the existing `+ Property` flow (D-V4-36); stale date property (deleted or retyped) — the empty state saying the property is gone (D-V4-36); error — `This database is unavailable.` for a missing database (`DatabaseView.svelte:215-216`), other failures via `showError`; offline — day clicks disabled with the "You're offline" helper (DESIGN line 164); read-only share — no day-click create, chips open only (DESIGN line 165; D-V4-35: the page access is threaded through the node view).
- C12 Both themes: every colour from a token, with a light and a dark screenshot of the calendar view (DESIGN §3 line 166).
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-VIEWS row and the tests line).

## Out of scope

- The board and gallery views (cards 23, 25) and the planner's own Month/Week/Today screens.
- Week or agenda layouts inside a database, drag-to-reschedule a chip, multi-day spans, recurring records, or time-of-day values.
- Chips on the planner calendar for database records (explicitly the opposite of BREAKDOWN line 175).
- Editing the date inline on the calendar, month heat-maps, or printing the view.

## Files likely touched

- `app/src/lib/database/DatabaseView.svelte` (`addView` 85–92, tabs 232–246, toolbar/panels 248–400, table area 402–517 that the calendar replaces, phone CSS 763–798)
- `app/src/lib/database/CalendarView.svelte` (new)
- `app/src/lib/dbvalues.ts` (`ViewConfig` 80–86, `checkValue` date 37, 51–52, `asText` 66–73)
- `app/src/lib/server/repo/databases.ts` (`get` 80–124, `addRecord` 183–204, `setValues` 207–233; `viewConfigSchema` 288)
- `app/src/routes/api/databases/[id]/records/+server.ts` (read-only: accepts `values`)
- `app/src/routes/api/database-records/[id]/+server.ts` (read-only)
- `app/src/lib/components/MonthCalendar.svelte` (read-only look reference: FullCalendar dayGrid setup and chip markup, not its data code)
- `app/src/lib/time.ts` (`makeDate` 42, `todayLocal` 87, `prettyDate` 192, `monthLabel` 205)
- `app/src/lib/server/undo.ts` (read-only: D-V4-36 uses the toast Undo, no journal, `TABLES` 12)
- `app/src/lib/types.ts` (`DbView` 179–184, `DatabaseDTO` 193–202)
- `app/tests/unit/databases.test.ts`, `app/tests/unit/v4-24-calendar.test.ts` (new)
- `app/tests/e2e/v4/24-calendar.spec.ts` (new), `app/tests/e2e/phone/v4-24-calendar.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — a view created with `view_type='calendar'` round-trips through `addView`, records grouped onto their date strings, a record outside the month absent, `No date` count after filters, a non-date property never offered as `Date property`, `addRecord` with the day value lands on that day — in `app/tests/unit/v4-24-calendar.test.ts`; desktop e2e create a Calendar view through `+`, pick `Date`, a record appears on its date, click a day creates one there — `app/tests/e2e/v4/24-calendar.spec.ts`; phone dots, tap day → list, `No date` chip, 48 dp, Back — `app/tests/e2e/phone/v4-24-calendar.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-24-blind.test.ts`, `app/tests/e2e/v4/24-blind.spec.ts`, `app/tests/e2e/phone/v4-24-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-VIEWS).

## Decided

- Decided: D-V4-36 — "Add a date property" + the existing + Property flow; clicking a day creates the record and leaves it as a chip; a chip or No date row opens the record page; toast Undo deletes the created record or restores the old date (no Ctrl+Z); rail 220 px (DESIGN); a deleted/retyped property shows the empty state saying it is gone; load up to 500 and show "Showing N of M".
