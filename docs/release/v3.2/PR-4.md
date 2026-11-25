# v3.2 PR 4 — Slipped list

## What changed for the user

- A **Slipped** strip shows one-off, top-level items whose last day is behind today: above the day planner on Home and at the top of Today. Normal repeats and done items never slip; steps/steps' parents and trashed rows are left out.
- Collapsible header "Slipped · N" (plus "N more" past the 50 shown); each row shows the title and its original date ("Mon 18 Nov").
- Row ⋯ = the PR 3 reschedule list (Today · Tomorrow · Next weekday · +1 week · Pick date… · Skip on an occurrence, though slipped rows never repeat) plus Done and Delete.
- **Move all to today** moves every slipped item to today in ONE undo batch; each item keeps its time and its multi-day span.
- Phone: the same strip; swipe right = done, left = delete (both with Undo), tap = the item sheet.
- Empty = no strip at all.

## Files

- `app/src/lib/server/repo/items.ts`: `slipped()` (cap 50 + `more`), `slippedIds()`, `moveSlippedToToday()` (keeps the span).
- `app/src/routes/api/items/slipped/+server.ts` (new): `POST` = move all, one `undoable()` entry; `today` comes from the session's tz.
- `app/src/lib/components/SlippedStrip.svelte` (new): strip, collapse, ⋯ sheet, swipe rows, bulk button.
- `app/src/routes/+page.server.ts`, `app/src/routes/today/+page.server.ts`: load `slipped`.
- `app/src/routes/+page.svelte`: strip above the planner. `app/src/routes/today/+page.svelte`: strip under the week strip.
- Tests: `app/tests/unit/slipped.test.ts`, `app/tests/e2e/slipped.spec.ts`, `app/tests/e2e/phone/slipped.spec.ts`; shared desktop sign-in `app/tests/e2e/signin.ts`.

## Tests

- unit: 4 passed (one-off/done/repeat/span/step/trash/other-user/order, cap 50 + more, bulk move span + one-entry undo).
- e2e: in the PR body.

## Doc lines that must change

- `FEATURES.md` planner section: Slipped strip on Home + Today, bulk move, repeats never slip.
- `BUILD-NOTES.md`: new "Slipped list" entry.
