# Card 10 · feat: `on_calendar` type flag

- Source: BREAKDOWN PR 10 (lines 75–81) · PLAN §3C (lines 99–119), §7 items 2–3 (lines 234–235), §8 PR 10 (line 267) · DESIGN §1.2 (lines 28–30, board D-T1) · decisions O-1 items 2–3, D-V4-11, D-V4-28
- Needs: 08 · Size: M · Branch: `v4/10-on-calendar-flag`

## What

A per-type switch, `Month calendar` (default on), so a Class type can stay off the month grid while still filling Week, Today, widgets, reminders, digest and the ICS feed. It is a per-type setting, not a per-item flag: `item_types.on_calendar = 0` hides the type only on the desktop month grid and the phone Month page, and only my own rows. Existing types and every new type start on (old behaviour).

Owner decisions that apply: **O-1** item 2 (`on_calendar = 0` hidden on Month, shown on Week), item 3 (visibility is per type; no per-item flag); **D-V4-28** (phone table columns, helper scope, items-only filter, label, search unchanged).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `ItemTypeDTO` gains `onCalendar: boolean`; `/api/item-types/[id]` `PATCH` accepts `{ onCalendar }` (strict zod, boolean) beside name/colour/slug/flags, and `/api/item-types` returns it. `defaultTypes()` (`app/src/lib/itemtypes.ts:58-59`) and all five `BUILTIN_TYPES` rows give `onCalendar: true` so a fresh account and the client fallback match the migration default 1.
- C2 Settings › Types gives every type row a `Month calendar` switch, on by default, as one new column in the existing table (D-V4-11), toggled through the page's existing `save(t, { onCalendar })` path (`settings/types/+page.svelte:14-22`); a reload shows the stored value, and there is no separate Save button. Below the list: "Off = hidden on Month, still on Week, Today and reminders." (DESIGN §1.2 line 29).
- C3 Desktop month grid (`MonthCalendar.svelte`, fed by `/+page.svelte:27-31`): items whose type has `onCalendar = false` are not rendered as chips; all other items render exactly as today. The filter reads `typesState` on the client and makes no new request.
- C4 Phone Month (`/month`, the page's own grid at `app/src/routes/month/+page.svelte:26-38`): the same items (own dots and the selected-day agenda list) are hidden, while **blocks keep their dots unchanged** — the shared `shownOnMonth` helper beside `shown` in `app/src/lib/client/itemtypes.svelte.ts` (D-V4-11) takes items only and never sees a `block`, even though `BlockDTO` carries a `type` too (`app/src/lib/types.ts:63-71`). One helper for both month screens, so they cannot drift.
- C5 Shown everywhere else, unchanged: Week (`/week`), the day planner, Today, due-today chips, widgets (`/api/native`), Slipped, the digest, the ICS feed, planner-item search (`/api/search`, untouched by this card) and the item page. Reminders still fire for the type.
- C6 Shared/partner rows on my month grid are **not** filtered by my type switches: a row with `theirs` (or otherwise not mine) renders as today even when its type key matches one of my off types; only my own items are filtered.
- C7 No "+N hidden" hint, counter or empty-day marker: a day whose only item is hidden looks like an empty day on both month grids (BREAKDOWN line 80).
- C8 Round trip: switch a type off → its items leave Month, stay on Week and Today; switch it back on → they return on Month. No `items` or `blocks` row is written, and the type's name/colour/slug/use count are unchanged.
- C9 Phone path: at phone width the Settings › Types table hides the `Order` and `Used` columns and keeps Colour, Name, Quick add and `Month calendar`, with no horizontal scrollbar (D-V4-28); the switch's label hit area is ≥ 48 dp (the existing phone rule on the types page labels, `settings/types/+page.svelte:246-253`), there is no "Click"/"Ctrl"/key-hint copy, and Back returns to the Settings list. On the phone Month grid the type is simply absent (no disabled chip).
- C10 Undo: the switch writes only `item_types.on_calendar` and is not journalled, matching every existing type setting (the PATCH route calls `itemTypes.patch` directly, `app/src/routes/api/item-types/[id]/+server.ts:9-12`); there is no undo toast, and the switch itself is the reversal (D-V4-11).
- C11 States (DESIGN §3): the types page is server-rendered, so no skeleton; a failed PATCH uses the page's existing `showError` and `invalidateAll` path and the switch returns to the stored value; empty is impossible (five built-ins always exist), and `No type` has no switch (items with `type: null` are never filtered).
- C12 Permission: the PATCH stays scoped by `own()` (`repo/itemtypes.ts:106-111`) — another user's type id is 404, and the switch never changes a partner's grid because it writes only the caller's `item_types` row.
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§3b item types, §3 planner).

## Out of scope

- Hiding on Week, Today, widgets, digest, ICS or search (the opposite: C5 keeps them).
- A per-item override, a date-range timetable, or hiding a type "everywhere" (that stays `users.hidden_types` / the TypeBar).
- Filtering planner blocks or hiding their dots: the month surfaces keep blocks as they are (C4).
- Changing `/api/search`, the 10-type cap or the built-in delete rules.

## Files likely touched

- `app/src/lib/types.ts` (`ItemTypeDTO`)
- `app/src/lib/itemtypes.ts` (`BUILTIN_TYPES`, `defaultTypes`)
- `app/src/lib/client/itemtypes.svelte.ts` (`typesState`, the shared `shownOnMonth` items-only helper beside `shown` at 32–39)
- `app/src/lib/server/repo/itemtypes.ts` (`toDTO` 13–25, `patchSchema` 93–96, `patch`)
- `app/src/routes/api/item-types/[id]/+server.ts` (PATCH; the list route returns the flag)
- `app/src/routes/settings/types/+page.svelte` (table head 78–84, switch column, helper text, phone media query 259–263)
- `app/src/routes/settings/types/+page.server.ts` (types source)
- `app/src/lib/components/MonthCalendar.svelte` (`toEvents` 76–103)
- `app/src/routes/+page.svelte` (`monthItems` 27–31)
- `app/src/routes/month/+page.svelte` (`cells` 26–38 item list only, `shown` import line 5)
- `app/src/lib/server/schema.ts` (`itemTypes.onCalendar`, card 08)
- `app/src/lib/server/undo.ts` (TABLES includes `item_types`; reference only for the no-undo note)
- `app/tests/unit/itemtypes.test.ts`
- `app/tests/unit/v4-10-on-calendar.test.ts` (new), `app/tests/e2e/v4/10-on-calendar.spec.ts` (new), `app/tests/e2e/phone/v4-10-on-calendar.spec.ts` (new)

## Tests

- Builder: unit filter in `app/tests/unit/v4-10-on-calendar.test.ts` — my item of an off type hidden while `hiddenTypes` is empty (the `shown()` early return is not the template), other types shown, a `theirs` row unchanged, `type: null` never hidden, and a block with an off type still returned (C4); desktop e2e: Settings › Types off for a type → item gone from Month, still on Week and Today → back on → returns in `app/tests/e2e/v4/10-on-calendar.spec.ts`; phone settings switch, the hidden Order/Used columns and phone Month in `app/tests/e2e/phone/v4-10-on-calendar.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-10-blind.test.ts`, `app/tests/e2e/v4/10-blind.spec.ts`, `app/tests/e2e/phone/v4-10-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§3b, §3).

## Decided

- Decided: D-V4-11 — never filter rows that are not mine; type settings keep their existing no-undo behaviour; one shared `shownOnMonth` helper used by `MonthCalendar` and the phone month page; add one column to the existing types table with a 48 dp label.
- Decided: D-V4-28 — phone hides the `Order` and `Used` columns with no horizontal scrollbar; `shownOnMonth` takes items only, so phone month cells keep their block dots; the filter runs whenever the `onCalendar = false` set is non-empty, independent of `hidden_types`; the label is "Month calendar" with DESIGN §1.2's helper line; `/api/search` is unchanged.
