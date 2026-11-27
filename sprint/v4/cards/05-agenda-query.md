# Card 05 · refactor: `agenda()` query

- Source: BREAKDOWN PR 5 (lines 39–42) · PLAN §3B, §8 PR 5 · DESIGN — (no screen) · decisions D-V4-06 · no board
- Needs: — · Size: S · Branch: `v4/05-agenda`

## What

Lift the "what is on for this range" logic out of `native.ts` into one server module: `agenda(me, from, to)` returns items + blocks for a range with repeats expanded, type visibility applied and the private flag kept. `native.ts` calls it. Pure refactor: the Android payload must not change. Cards 07 (ICS export) and 12 (digest) reuse the same query later.

Owner decisions that apply: **O-1** items 4–5 (the later consumers, ICS export and digest, are own items only, no partner items). D-V4-06 settles the range, the cap and the return shape.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 New `app/src/lib/server/agenda.ts` exports `agenda(me, from, to)` returning `{ items, blocks }`: the caller's own calendar only (`calendarsRepo.defaultFor(me.id)`, the same own side `getCalendar` uses; no shared grants), live rows only, top-level items (`!parentId`), repeats expanded one row per occurrence in the range (as `itemsRepo.inRange`), blocks from `blocksRepo.inRange` with the range padded one day each side (`localToUtc(addDays(from,-1),0,tz)` … `localToUtc(addDays(to,1),0,tz)`, as `getCalendar` does) so midnight-crossing blocks show.
- C2 Type visibility is applied inside `agenda` with `me.hiddenTypes.includes(item.type ?? 'None')` (untyped = `'None'`, the native rule); each remaining item keeps its `private` flag and type key. An item of a hidden type is absent from `agenda`; a private item is present.
- C3 `nativeSync` builds its 7-day week from `agenda`; `ahead` (countdowns) still calls `getCalendar` (D-V4-06), so `/api/native` JSON is identical for the same fixture, and the existing `app/tests/unit/native.test.ts` assertions pass unchanged. New fixture: a `countsDown` type hidden in `hiddenTypes` still appears in `countdowns` (no behaviour change).
- C4 No other route changes behaviour: `/api/calendar` still uses `getCalendar` (not changed), and for a fixture with no hidden types `agenda(me, from, to)` equals `getCalendar(me, from, to, { shared: false })` field for field — three explicit fixtures: an overnight block crossing a range edge (the ±1-day padding), a repeating occurrence id (`id@date`), and an all-day item (`date`, `endDate` null). No migration, no new outbound call.
- C5 `agenda` is read-only: no writes, no reminder recalculation, no journal entry, safe to call twice with the same result.
- C6 Range: `agenda` accepts `YYYY-MM-DD` dates and rejects a bad date, `span <= 0` or `span > 62` with the same 400 as `getCalendar` (`range 1..62 days`); the cap stays here and is lifted later by card 07 (D-V4-06).
- C7 Unit: a repeating item appears once per occurrence inside the range and not outside it; a hidden type's items are dropped; another user's calendar items never appear even when `overlapOn` is on.
- C8 Phone path: none — no UI or client change in this card.
- C9 Undo: none — no mutation.
- C10 States: none — no screen, no loading/empty/error surface.
- C11 Docs: no user-visible change; no doc lists server modules, so nothing changes there.

## Out of scope

- Using `agenda` for ICS export (card 07), digest (card 12), print (card 06) or widgets beyond the 7-day week.
- Changing `getCalendar`, its 62-day limit (card 07 lifts it), shared-calendar overlap, or `nativeSync` output.
- Moving `todos` / `countdowns` / `notes` to a new query.

## Files likely touched

- `app/src/lib/server/agenda.ts` (new)
- `app/src/lib/server/native.ts` (`rowsOn` closure at 25–60, `week` at 62, `days` at 66–80, `ahead` at 90)
- `app/src/lib/server/calendar.ts` (`getCalendar`, 11–50; `defaultFor` use at 22, `localToUtc` padding at 25–26)
- `app/src/lib/server/repo/calendars.ts` (`defaultFor`)
- `app/src/lib/server/repo/items.ts` (`inRange`, 108–164)
- `app/src/lib/server/repo/blocks.ts` (`inRange`, 36–45)
- `app/src/routes/api/native/+server.ts`
- `app/tests/unit/native.test.ts`, `app/tests/unit/agenda.test.ts` (new)

## Tests

- Builder: new `app/tests/unit/agenda.test.ts` (C1, C2, C4's three fixtures, C5–C7); `app/tests/unit/native.test.ts` stays green and gains the hidden-countdown fixture (C3).
- Blind (tester, from Done when only): `app/tests/unit/v4-05-blind.test.ts`.

## Docs

- None user-visible. `docs/BUILD-NOTES.md` and `docs/v2/FEATURES.md` do not change (no behaviour change).

## Decided

- Decided: D-V4-06 — `ahead` keeps `getCalendar` for countdowns (no behaviour change); the 62-day cap stays and is lifted in card 07; `agenda` is own calendars only (`defaultFor`); it returns DTOs and `native` keeps its `rowsOn` mapping; `from`/`to` are owner-local dates.
