# Card 23 · feat: DB board view

- Source: BREAKDOWN PR 23 (lines 165–171) · PLAN §1b (line 31), §2 (line 61: `view_type` already allows `board`; needs UI and queries only), §3E item 7 (line 144), §8 PR 23 (line 287), §8 line 299 (23–25 share `DatabaseView.svelte`: land 23 first) · DESIGN §2.7 (lines 113–116; boards D-DB1 `wireframes/v4/index.html:335`, M-DB1 `:352`, D-DB4 `:389`), §0 (lines 9–13), §3 (lines 157–166) · `docs/v2/FEATURES.md` PG-VIEWS line 122, PG-SORTFILTER line 123 · decisions — (none; no migration)
- Needs: — · Size: M · Branch: `v4/23-db-board-view`

## What

A database gets a second kind of view: Board. It groups records into one column per option of a select property, with a last "No value" column, cards showing the title plus two chosen properties, and a `+ New` at the bottom of every column. A card moves between columns by dragging **and** by `Card ⋯ → Move to ▸ <column>`, both writing the same select value with an undo. This card also builds the view-type tabs and the ⚙ view settings that cards 24 and 25 reuse.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 The view tab row shows every view of the database with its name (the view's type decides the layout), and `+` opens a picker of `Table · Board` plus a name field — calendar and gallery join it in cards 24/25 (D-V4-35); the chosen type is stored in `database_views.view_type` and survives a reload (`POST /api/databases/:id/views` gains `type`, `repo/databases.ts:306-312`, `api/databases/[id]/views/+server.ts:6`). `board` needs no migration: the Drizzle enum keeps accepting `calendar`/`gallery` for cards 24/25 and there is no SQL CHECK on the column (`schema.ts:637, 643-646`). DESIGN line 114.
- C2 ⚙ at the right of the tabs opens the view settings. For a board: `Group by` (only `select` properties — `PROP_TYPES`, `dbvalues.ts:4-13`) and `Card shows` (two property pickers); both are saved in `config_json` through `PATCH /api/database-views/:id` and the strict `viewConfigSchema` (`repo/databases.ts:288-318`) gains exactly the keys the three view cards use (DESIGN line 115; schemas are `.strict()`).
- C3 Board columns: one per option of the grouped select in the property's option order, then a last column `No value`. Header = option colour dot + name + the number of cards in it; columns 260 px wide with horizontal scrolling and no visible scrollbar. (DESIGN line 116; board D-DB1.)
- C4 A card shows the record's title plus the two `Card shows` properties as chips (`asText`, `dbvalues.ts:66-73`), and its ⋯ menu holds `Open` · `Move to ▸ <columns>` · `Delete` (DESIGN line 116). `Open` uses the existing record-to-page path (`POST /api/database-records/:id/page`, `DatabaseView.svelte:197-201`); `Delete` keeps the table's confirm and Trash behaviour (`DatabaseView.svelte:202-211`).
- C5 `+ New` at a column's bottom creates a record with that column's option set (the last column leaves the property empty), and the new card appears in that column without a reload (`POST /api/databases/:id/records` already takes `values`, `api/databases/[id]/records/+server.ts:7-11`).
- C6 Moving a card with `Card ⋯ → Move to ▸ <column>` writes the grouped select value through `PATCH /api/database-records/:id {values}` (`repo/databases.ts:207-233`): the card leaves its column, both headers' counts change, and the toast reads `Moved to <column>` (DESIGN line 116). This is the keyboard path the e2e uses.
- C7 Dragging a card onto another column performs the same write and shows the same toast; drag is never the only path (BREAKDOWN line 167; DESIGN line 116). On phone a long press picks a card up and carries it to another column (DESIGN line 117, §0 line 12).
- C8 Undo: a move shows Undo, and Undo puts the old value back so the card returns to its column and the counts restore; `+ New` shows Undo and Undo removes the created card (BREAKDOWN line 169 "Undo: old value"; CLAUDE.md undo rule; DESIGN line 13). The mechanism is D-V4-35: toast Undo writes the previous value back and Ctrl+Z is not part of it (`lib/client/undo.svelte.ts:41-46`).
- C9 The view's existing filter and sort still decide which records the board shows — the same `dbs.get()` path the table uses — so a filtered-out record gets no card and every column count equals its visible cards (`repo/databases.ts:104-120`; FEATURES PG-SORTFILTER line 123 "view only").
- C10 Row loading never lies: the board asks for up to the existing 500-row cap and, when the filtered set is larger, shows `Showing N of M` like the table (`repo/databases.ts:121-123`; `DatabaseView.svelte:518-523`; D-V4-35).
- C11 Phone: one column at a time, a chips row on top (`Backlog 3 · Doing 1 · …`), swipe left/right between columns (peers only, never tabs), long press = pick up, card ⋯ → `Move to`; chips, cards and the ⋯ are ≥ 48 dp; no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN line 117; board M-DB1).
- C12 States (DESIGN §3): loading — `Loading database…` (`DatabaseView.svelte:217-218`); empty — a database with no records shows the columns with count 0 and `+ New`; no select property — `Board groups cards by a select property.` + an `Add a select property` button that opens the existing `+ Property` flow (D-V4-35; DESIGN line 118, board D-DB4); error — `This database is unavailable.` for a missing database (`DatabaseView.svelte:215-216`), other failures via `showError`; offline — `+ New`, drag and `Move to` are disabled with the "You're offline" helper (DESIGN line 164); read-only share — no drag, no `+ New`, no `Move to`, settings read-only (D-V4-35: the page access is threaded through the node view).
- C13 Both themes: every colour from a token, screenshots in light and dark for the board (DESIGN §3 line 166 names D-DB1 explicitly).
- C14 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-VIEWS row and the tests line).

## Out of scope

- The calendar and gallery views (cards 24, 25); starter templates that use them (card 26).
- Grouping by a multi-select, a checkbox or a date; swimlanes, collapsing a column, reordering columns or options by drag.
- Inline card editing (chips are display only), card covers, card size, or a per-view property list beyond the two `Card shows` picks.
- Bulk moving several cards, keyboard DnD (Alt+↑/↓), or a board inside a template.

## Files likely touched

- `app/src/lib/database/DatabaseView.svelte` (tabs 232–246, `addView` 85–92, toolbar 248–292, table 402–517, phone CSS 763–798)
- `app/src/lib/database/BoardView.svelte` (new)
- `app/src/lib/dbvalues.ts` (`ViewConfig` 80–86, `asText` 66–73)
- `app/src/lib/server/repo/databases.ts` (`get` 80–124, `setValues` 207–233, `viewConfigSchema` 288, `addView` 306–312, `patchView` 313–318)
- `app/src/routes/api/databases/[id]/views/+server.ts` (schema line 6)
- `app/src/routes/api/database-views/[id]/+server.ts` (5–9, read-only)
- `app/src/lib/server/schema.ts` (`databaseViews` 629–647, read-only)
- `app/src/lib/types.ts` (`DbView` 179–184, `DatabaseDTO` 193–202)
- `app/src/lib/server/undo.ts` (read-only: D-V4-35 keeps `database_values` out of the journal, `TABLES` 12)
- `app/src/lib/components/UndoToast.svelte` (read-only: toast Undo)
- `app/tests/unit/databases.test.ts`, `app/tests/unit/v4-23-board.test.ts` (new)
- `app/tests/e2e/v4/23-board.spec.ts` (new), `app/tests/e2e/phone/v4-23-board.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — grouping (option order, `No value` last, counts after filters), `view_type` `board` round trip through `addView`, the new config keys accepted and unknown keys still refused — in `app/tests/unit/v4-23-board.test.ts`; desktop e2e create a Board view, group by a select, drag a card, move one with ⋯, undo both, `+ New`, empty state without a select property — `app/tests/e2e/v4/23-board.spec.ts`; phone one-column chips, swipe, long press, 48 dp, Back — `app/tests/e2e/phone/v4-23-board.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-23-blind.test.ts`, `app/tests/e2e/v4/23-blind.spec.ts`, `app/tests/e2e/phone/v4-23-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-VIEWS).

## Decided

- Decided: D-V4-35 — DESIGN copy "Board groups cards by a select property." + Add a select property; toast Undo writes the previous value back (no Ctrl+Z); request 500 and show "Showing N of M" when larger; thread the page access through the node view to hide write controls; only Table and Board for now, the picker grows in 24/25; clicking the card body opens the record page; Card shows defaults to the first two non-title properties.
