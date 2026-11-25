# PR 5 — refactor: agenda() query

- User-visible: none (no behaviour change).
- `lib/server/agenda.ts` is new and owns the range query used by the Android sync: `agenda(me, from, to)` returns own-calendar items + blocks, repeats expanded via `itemsRepo.inRange`, hidden types dropped, `private` flag kept. `rowsOn` moved there from `native.ts`.
- `/api/native` calls `agenda()` for the 7-day week; countdowns keep the unfiltered 60-day calendar range (hidden types stay visible there, as before).
- Files: `app/src/lib/server/agenda.ts` (new) · `app/src/lib/server/native.ts` · `app/tests/unit/agenda.test.ts` (new).
- Tests: unit.
- Doc line that must change: none.
