# Card 14 · feat: type starter pack

- Source: BREAKDOWN PR 14 (lines 106–108) · PLAN §1b (line 50), §3D (line 129), §6 v3.3 (line 210), §7 item 6 (line 238), §8 PR 14 (line 271) · DESIGN §1.2 (lines 28–30, board D-T1; the phone twin M-T1 named there is not in `wireframes/v4/index.html`) · decisions O-1 item 6, D-V4-11
- Needs: 10 · Size: S · Branch: `v4/14-type-starter-pack`

## What

Settings › Types gets `+ Add a preset ▾` with five one-click types: Class (Month calendar off), Errand, Health, Chore, Study — each with a colour and a quick-add slug. The 10-type cap, the five built-ins and the delete rules do not change; a preset fills one free slot, never overwrites a type, and the button greys out when all 10 slots are used.

Owner decisions that apply: **O-1** item 6 (cap stays 10, built-ins stay undeletable, the starter pack fills free slots only and is greyed out when full) · **D-V4-11** (type settings keep their existing no-undo behaviour; the Delete path keeps its own undo).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `app/src/lib/itemtypes.ts` gains one shared, pure preset table beside `BUILTIN_TYPES`/`TYPE_SWATCHES` with exactly five entries in this order: `Class` (slug `class`, `onCalendar: false`), `Errand` (`errand`), `Health` (`health`), `Chore` (`chore`), `Study` (`study`); each has a `bg` from `TYPE_SWATCHES` (ink from `inkFor`), `countsDown: false`, `shareDefault: false`; `MAX_TYPES` stays 10, `BUILTIN_TYPES` and `RESERVED_SLUGS` are unchanged.
- C2 Settings › Types shows `+ Add a preset ▾` under the type list and the helper text of DESIGN line 29 stays as is. At `types.length === MAX_TYPES` the button is disabled and the helper reads "Remove a type to add more" (DESIGN line 30; BREAKDOWN line 107). With 9/10 types the button is enabled.
- C3 The menu lists the five presets in the C1 order, each with its colour dot and name. A preset whose name already exists on the account (the built-in `Event` renamed to `Class`, or a custom `Class`) renders disabled with "(have it)" (DESIGN line 30) and clicking it changes nothing.
- C4 Choosing a preset creates exactly one custom type owned by the caller, positioned after the last type: same name, slug and colour; `onCalendar = false` for Class and `true` for the other four (card 10's flag). No existing type is renamed, recoloured, reordered or deleted.
- C5 The server create path accepts the flag: `createSchema` (`repo/itemtypes.ts:84-92`) takes `onCalendar` (boolean, optional, default true) and `create()` writes `on_calendar` instead of relying on the DB default, so a preset Class ends up `on_calendar = 0`. Card 10 added `onCalendar` to `PATCH` only; `/api/item-types` GET already returns it.
- C6 The created type is usable at once: the chip appears on Home/Week after the page refreshes, and typing `/class` (or `/errand`, `/health`, `/chore`, `/study`) in quick add fills the Type chip of `QASlots.svelte` (`typeName(parsed.type)`, line 31–38) with the new type's name — on the desktop palette and in the phone Add sheet.
- C7 A slug clash is skipped and not silent: when another type already owns the preset's slug (e.g. a custom type with slug `health`), no type is created and the page says which type owns `/<slug>` — same wording rule as the existing `bad_slug` error ("/health is used by <name>") (BREAKDOWN line 107 "skipped with a note"; D-V4-21: the existing error toast with the `bad_slug` message).
- C8 Repeating the action never duplicates: adding presets one by one up to 10/10 creates five types with five distinct slugs and names; at 9/10 the rows already owned are disabled with "(have it)" and the last preset is still clickable, and at 10/10 the button is disabled with the cap helper (the menu cannot open then). Two rapid clicks on one preset create one type.
- C9 Server invariants unchanged: an 11th type (preset or manual) is refused with the existing `type_cap` message (`repo/itemtypes.ts:116`), every preset row is scoped to the caller's `owner_id`, a partner's type list is untouched, and built-ins stay undeletable.
- C10 Phone: on Settings › Types the preset button and every menu row are ≥ 48 dp, the menu is reached by tap (no hover), no "Click"/"Ctrl"/key-hint copy, and Back closes the open sheet before leaving Settings (DESIGN §0 lines 11, 15; phone presentation: the shared BottomSheet/ActionSheet list at 48 dp, D-V4-21).
- C11 Undo: adding a preset writes `item_types` rows like today's manual `+` (`TypeBar.svelte:61`) and, per D-V4-11, gets no undo toast and no journal entry; the reversal is the type's existing Delete, which keeps its own undo.
- C12 States (DESIGN §3): loading = server-rendered list, no skeleton; empty = impossible (five built-ins always exist), cap keeps the menu disabled with its helper; error = a failed create shows the existing `showError` and re-reads the list; nothing half-created is left behind (D-V4-21: one endpoint, one transaction); offline = the create fails with the usual error toast and is not queued.
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§3b "Settings › Item types" row + the tests line).

## Out of scope

- Raising the 10-type cap, making built-ins deletable, or moving items between types (D-24 / O-1 item 6).
- The `Month calendar` switch itself (card 10), quick add grammar (unchanged), the TypeBar `+` popover.
- Presets on signup / seed: the pack is on demand only (PLAN line 142 is about starter templates; PLAN §6 line 210 keeps the pack user-triggered).
- A per-preset editor (rename the preset before adding), localisation, icons.

## Files likely touched

- `app/src/lib/itemtypes.ts` (`BUILTIN_TYPES` 7–13, `RESERVED_SLUGS` 19, `TYPE_SWATCHES` 22, `slugMap` 50–56, new `TYPE_PRESETS`)
- `app/src/lib/server/repo/itemtypes.ts` (`createSchema` 84–92, `create` 113–140, `checkSlug` 98–104, `MAX_TYPES` import line 8)
- `app/src/routes/api/item-types/+server.ts` (POST; plus `presets` per D-V4-21)
- `app/src/routes/settings/types/+page.svelte` (table 77–171, helper text, new menu)
- `app/src/routes/settings/types/+page.server.ts` (types already loaded)
- `app/src/lib/components/TypeBar.svelte` (read-only: existing create path line 61, `slots left` line 149)
- `app/src/lib/components/QASlots.svelte` (read-only: the Type chip, lines 30–38)
- `app/src/lib/types.ts` (`ItemTypeDTO.onCalendar`, card 10)
- `app/tests/unit/itemtypes.test.ts`, `app/tests/unit/v4-14-presets.test.ts` (new)
- `app/tests/e2e/v4/14-presets.spec.ts` (new), `app/tests/e2e/phone/v4-14-presets.spec.ts` (new)

## Tests

- Builder: unit cap, slug clash, `onCalendar` default and the five preset rows in `app/tests/unit/v4-14-presets.test.ts`; desktop e2e "add Class → chip on Week, gone from Month, `/class` works" in `app/tests/e2e/v4/14-presets.spec.ts`; phone button/menu 48 dp in `app/tests/e2e/phone/v4-14-presets.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-14-blind.test.ts`, `app/tests/e2e/v4/14-blind.spec.ts`, `app/tests/e2e/phone/v4-14-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§3b).

## Decided

- Decided: D-V4-21 — one `POST /api/item-types/presets` endpoint; a slug clash uses the existing error toast with the `bad_slug` message; the phone menu is the shared BottomSheet/ActionSheet list at 48 dp; Study colour = next unused `TYPE_SWATCHES` entry (#C9DAE7 if free).
