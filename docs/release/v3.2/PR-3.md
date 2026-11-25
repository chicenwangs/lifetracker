# v3.2 PR 3 — reschedule action set + Postpone/Skip

## What changed for the user

- Item page/sheet: a **Postpone ▾** button beside the date opens `Today · Tomorrow · Next weekday · +1 week · Pick date…`.
- Phone: the same list sits at the top of a row's ⋯ sheet on Today, Week and Month.
- **Skip this one** (repeating occurrence only) drops that date from the series; it is not deleted.
- Every move and skip shows a toast with Undo. A postpone keeps the time and a multi-day span; a linked planner block stays where it is and the toast says which day.
- Next weekday = the next day, or Monday when today is Fri/Sat/Sun.
- Offline: a postpone waits in the existing offline queue; a skip says it was not saved.
- Limit: Undo of a Skip restores the date but does not bring back the exact-time reminder it cancelled (reminders are not in the undo journal).

## Files

- `app/src/lib/client/reschedule.ts` (new): pure `targetDate(kind, today, tz)`, `reschedule`, `skip`, `postpones` list.
- `app/src/lib/components/ItemView.svelte`: Postpone ▾ + shared ActionSheet; follows a detached occurrence; after a skip it stays on the series.
- `app/src/routes/today/+page.svelte`, `app/src/lib/components/PhoneWeek.svelte`, `app/src/routes/month/+page.svelte`: the list in the row ⋯ sheet.
- `app/src/lib/server/repo/items.ts`: `skipOccurrence` (one EXDATE, 404 on a made-up/already-skipped date, 400 on a non-repeat).
- `app/src/lib/server/reminders.ts`: `cancelOnDay` (an exact-time reminder of a skipped date is cancelled; relative ones recalc).
- `app/src/routes/api/items/[id]/skip/+server.ts` (new): `POST …/skip`, one undo entry.
- Tests: `app/tests/unit/reschedule.test.ts`, `app/tests/e2e/reschedule.spec.ts`, `app/tests/e2e/phone/reschedule.spec.ts`; `phone/rows.spec.ts` action list updated.

## Tests

- unit: 8 passed (targetDate Fri/Sat/Sun + month/year end, skip EXDATE, reminder move/cancel, multi-day span, detach).
- e2e: listed in the PR body.

## Doc lines that must change

- `FEATURES.md` planner section: add Postpone/Skip to the item actions.
- `BUILD-NOTES.md`: new "Reschedule actions" entry.
