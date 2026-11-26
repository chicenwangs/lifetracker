# Card 26 · feat: starter templates

- Source: BREAKDOWN PR 26 (lines 183–185) · PLAN §1b (line 30), §3E item 6 (line 142: seeded on demand, not at signup), §8 PR 26 (line 290: needs 22, 23, 25) · DESIGN §2.6 (lines 105–111; boards D-P5 `wireframes/v4/index.html:286`, M-P5 `:307`), §2.12 (lines 149–153; board D-DB3 `:379` for the gallery card), §0 (lines 9–15), §3 (lines 157–166) · `docs/v2/FEATURES.md` PG-TEMPLATE line 129, PG-DB line 120, PG-VIEWS line 122 · decisions O-3, D-V4-34, D-V4-35, D-V4-48
- Needs: 22 (New page ▾ / phone Add sheet Page tab, template flag), 23 (board), 25 (gallery) · Size: S · Branch: `v4/26-starter-templates`

## What

The New page menu gets a third source of pages: three starter templates, each a ready-made database on a new page. The three definitions live in code, not as saved pages, so every tap creates one normal page (and its database) from the definition. Watch list opens as a gallery, Workout log as a table with a calendar view, Dev tracker as a board grouped by status. Nothing is seeded at signup or on sign-in, and nothing a starter creates shows up as a template.

Owner decisions that apply: **D-V4-48** (amends D-V4-42) — the starters are code-defined; each tap creates one normal page from the definition, never a hidden template page, so nothing appears in `From template ▸`, `findByTitle` or search; **O-3** (a page made from a template copies database schema only, no records); **D-V4-34** (desktop `New page ▾`, phone Add sheet › Page tab; `Put under` placement); **D-V4-35** (board/gallery view settings and the click-a-card-opens-the-record rule the starters use).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Desktop: `New page ▾` (card 22) lists `Starter templates ▸` after `From template ▸`, and the submenu holds exactly `Watch list`, `Workout log`, `Dev tracker`, each with a one-line description naming its view(s) (`gallery`, `table + calendar`, `board`; board D-P5 lines 300–303; DESIGN line 108). Phone: the same three rows live in the Add sheet's Page tab (D-V4-34; DESIGN line 108). Every row is a tap target of ≥ 24 px desktop / ≥ 48 dp phone.
- C2 Tapping `Watch list` creates and opens a page titled `Watch list` holding a database whose title property keeps the default name, plus `Status` (select: Want / Watching / Done), `Rating`, `Type` (select: Film / Series / Anime / Book), and a Gallery view (card 25) that is the selected view when the page opens; the gallery's `Card shows` are `Status` and `Rating` (the card-23 default of the first two non-title properties; DESIGN lines 150, 120; board D-DB3 shows `Watching` + stars).
- C3 Tapping `Workout log` creates and opens a page titled `Workout log` with a table view and a calendar view (card 24) whose `Date property` is the `Date` property; the columns are `Exercise` (the title property, Decided), `Date` (date), `Sets` (number), `Reps` (number) and `Weight kg` (number); the table is the selected view and the calendar shows a record once one is dated (DESIGN line 151; BREAKDOWN line 183).
- C4 Tapping `Dev tracker` creates and opens a page titled `Dev tracker` with a Board view (card 23) grouped by `Status` whose options are Backlog / Doing / Review / Done, plus `Priority` (select: Low / Med / High) and `Link` (url); the board is the selected view, so it opens with the four columns and `+ New` per column (DESIGN line 152; BREAKDOWN line 183).
- C5 Creation is all-or-nothing and never half-made: one server call builds that one page, its database block, its properties, its views and the view config in one transaction, so a failure leaves no page, no `page_databases` row, no properties and no views; the definition itself is code, not a page, so nothing else is created (BREAKDOWN line 184; `repo/databases.ts:57-76`; D-V4-48).
- C6 Nothing is seeded: on a fresh setup no starter page exists until a row is tapped; the `Starter templates ▸` rows are always listed (they are menu entries, not saved pages), and tapping the same starter twice makes two independent pages (BREAKDOWN line 184 "Not seeded at signup"; D-V4-48).
- C7 The created page opens with a one-time hint line at the top: `This is a template copy. Rename it and start adding.` It is visible immediately after creation and is not shown on a later visit or reload of the same page (DESIGN line 153); it is not stored in the page title or body.
- C8 Reuse: later taps create independent normal pages with their own ids; because the definitions are code only, the definitions never appear under `From template ▸`, in `findByTitle`, in the page tree or in search — only the pages a tap created do — and editing one created page never changes another (D-V4-48).
- C9 Undo: after creation a toast `Created <name> · Undo` appears, and its Undo moves the page (or pages, if the tap created more than one row) to Trash in one batch, restorable from Trash, with no journal row (D-V4-48; card 17/22 precedent, D-V4-23).
- C10 Phone: the three rows open from the Add sheet's Page tab, every row and the sheet's close are ≥ 48 dp, Back closes the sheet before the page, and no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN §0 lines 11, 15; board M-P5).
- C11 States (DESIGN §3): loading — the tapped row is disabled while the request runs so a double tap makes one page; empty — the submenu always lists the three starters; error — `showError` with the server message and nothing created (C5); offline — the usual offline toast and nothing queued; a read-only page is not involved (the menu is only on the New page surfaces).
- C12 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-TEMPLATE row, PG-VIEWS, the tests line).

## Out of scope

- Seeding starters at signup, in the seed script or on first page open (BREAKDOWN line 184 says the opposite).
- A starter editor (users edit the page they created), starter-specific fields, sample records, or cover images.
- The user's own templates and `From template ▸` itself (card 22), Markdown import (card 27), and the views themselves (cards 23–25).
- Star glyphs for `Rating`, preset type colours beyond the property colours card 23 assigns, or an icon for each starter page.

## Files likely touched

- `app/src/lib/components/NewPageMenu.svelte` (card 22's component: the `Starter templates ▸` submenu)
- `app/src/lib/components/MobileAdd.svelte` (Page tab from card 22, the three rows)
- `app/src/routes/api/pages/starter/+server.ts` (new: `{kind}` → created page)
- `app/src/lib/server/starters.ts` (new: the three definitions + one transaction)
- `app/src/lib/server/repo/pages.ts` (`create` 209–223, `get` 58–95, `trash` 345–361 read-only)
- `app/src/lib/server/repo/databases.ts` (`create` 57–76, `addProp` 130–139, `addView`/`patchView` 306–318, `viewConfigSchema` 288)
- `app/src/routes/pages/[id]/+page.svelte` (one-time hint banner, new-page opening)
- `app/src/lib/types.ts` (`PageDTO` 157–170, `DbView` 179–184)
- `app/tests/unit/v4-26-starters.test.ts` (new), `app/tests/unit/databases.test.ts`
- `app/tests/e2e/v4/26-starters.spec.ts` (new), `app/tests/e2e/phone/v4-26-starters.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — each definition creates exactly one page + database with the named properties, select options, views and config, a failed run leaves no rows, two taps make two independent pages with different ids, nothing is created without a tap, and a tap leaves exactly one visible page (no hidden template page) with `From template ▸` unchanged — in `app/tests/unit/v4-26-starters.test.ts`; desktop e2e create each starter, assert the named view is selected and its structure exists (columns / calendar property / cards), the hint shows once, undo trashes the page — `app/tests/e2e/v4/26-starters.spec.ts`; phone: Add sheet › Page tab, three 48 dp rows, create one, Back — `app/tests/e2e/phone/v4-26-starters.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-26-blind.test.ts`, `app/tests/e2e/v4/26-blind.spec.ts`, `app/tests/e2e/phone/v4-26-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-TEMPLATE, PG-VIEWS).

## Decided

- Decided: D-V4-42 — Rating = number 1–5 not enforced; Workout title = Exercise, others Date/Sets/Reps/Weight kg; extend `pages.trash` to several roots in one batch.
- Decided: D-V4-48 (amends D-V4-42) — starter definitions are code only: each tap creates one normal page from the definition, with no hidden template page, so nothing leaks into `From template ▸`, `findByTitle` or search; later taps create independent pages; Undo trashes what the tap created in one batch.
