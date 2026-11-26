# Card 06 · feat: print week

- Source: BREAKDOWN PR 6 (lines 44–47) · PLAN §3B ("Print a week"), §8 PR 6 · DESIGN — (no board; no screen spec for print) · decisions D-V4-07, D-V4-18
- Needs: — · Size: S · Branch: `v4/06-print-week`

## What

Print the week as a fridge plan: an `@media print` stylesheet for `/week` that hides the shell, nav and buttons, prints a white sheet with black ink, keeps a type colour only as a left border, and forces the 7-column desktop grid at any width. Reached from a new `⋯` in the desktop week bar with one item, "Print week", which calls `window.print()`; no entry on phone.

Owner decisions that apply: none. D-V4-07 (entry, what prints, CSS split, phone, assertion) and D-V4-18 (print at any width, test viewport) settle the questions.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Desktop `/week` bar (`app/src/routes/week/+page.svelte:233-271`, which has no `⋯` today) gets a new `⋯` trigger with exactly one item, `Print week`; choosing it calls `window.print()` (assert by stubbing `window.print` and recording the call).
- C2 On phone widths no `⋯`/`Print week` entry is rendered (the phone `<main class="phone">` bar at `week/+page.svelte:209-231` stays as it is) and the on-screen week is unchanged.
- C3 With `page.emulateMedia({ media: 'print' })` the app shell is gone: the header/banner (`AppHeader`), the phone bottom bar (`MobileBar`), the week toolbar buttons (prev/next, Today, `OverlapToggle`, Month/Week switch), `TypeBar`, the right rail (`aside`: `WeekMap` + `Not scheduled`) and the gesture/foot hints are not visible. The week's date-range title stays visible. Shell-hiding rules are global in `app/src/app.css`; week-layout rules are scoped to the week page.
- C4 The printed page (viewport set to 1123×794 = A4 landscape at 96 dpi before the print emulation) shows exactly 7 day columns, the all-day row and the time grid with the week's items and blocks; nothing overflows horizontally (`scrollWidth <= 1123`).
- C5 Type colour prints as a left border only: the inline event colours (`backgroundColor`, `borderColor`, `textColor` set at `WeekCalendar.svelte:180-182,203-205`) are overridden with `!important` to a white background and black text, the left border keeps the type colour at 3 px, and the other border sides are transparent. A dark-theme session prints the same black-on-white sheet.
- C6 The stylesheet declares `@page { size: A4 landscape; }` in `app/src/app.css` (it has no print block today), and at 1123 px the 7 columns fit (C4). Print forces the 7-column desktop grid at any width: hide `.phone`, show `.wrap` (the phone CSS hides `.wrap !important` at `week/+page.svelte:450-456`), so a phone-width print is never a blank page (D-V4-18).
- C7 Nothing else changes: no new data, request or mutation, so no undo entry is created. Outside print media the page looks and behaves as today (desktop and phone, light and dark); the only on-screen addition is the desktop `⋯` with one item.
- C8 States: print has no loading/empty/error state of its own; an empty week prints as an empty grid.
- C9 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (Week section), and `docs/SERVICE-HANDOFF.md` only if ops steps change (none expected).

## Out of scope

- Page (not Week) print tuning; PLAN §3B expects the same stylesheet to make a Page printable "for free", but no Page print spec is in BREAKDOWN PR 6.
- Print of Month, Today, Keep or a Keep note.
- Any server PDF/image generation, e-mail or share.

## Files likely touched

- `app/src/app.css` (global shell-hiding print rules + `@page`; no `@media print` / `@page` exists anywhere today)
- `app/src/routes/week/+page.svelte` (bar at 233–271, new `⋯`; `<main class="phone">` 210, `<main class="wrap">` 233, foot 293, `aside` 299; scoped print rules)
- `app/src/lib/components/WeekCalendar.svelte` (FullCalendar DOM; print overrides need `:global(.fc-…)` and `!important`)
- `app/src/lib/components/UndoToast.svelte` (the toast must not print)
- `app/src/routes/+layout.svelte` (read-only: shell wrapper the global print rules hide)
- `app/tests/e2e/v4/06-print.spec.ts` (new; `emulateMedia` pattern; `app/tests/e2e/v4/` is a new directory)

## Tests

- Builder: e2e `app/tests/e2e/v4/06-print.spec.ts` — C1 stubs and calls `window.print`; C2 at phone width; C3–C6 at 1123×794 with `emulateMedia({ media: 'print' })`, including the 7-column fit (BREAKDOWN line 47), the white/black/left-border overrides (light and dark), and the `@page` rule.
- Blind (tester, from Done when only): `app/tests/e2e/v4/06-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md`.

## Decided

- Decided: D-V4-07 — add `⋯` to the week bar with one item "Print week"; keep the week title, hide rail/stats/hints; shell-hiding rules global in `app.css`, week layout scoped; desktop only; assert `@page` + 7 columns fit 1123 px; `window.print()`.
- Decided: D-V4-18 — print forces the 7-column grid at any width (hide `.phone`, show `.wrap`); tests set 1123×794; no failed-print-dialog state.
