# Card 25 · feat: DB gallery view

- Source: BREAKDOWN PR 25 (lines 178–181) · PLAN §1b (line 31), §2 (line 61: `view_type` already allows `gallery`; needs UI and queries only), §3E item 7 (line 144), §8 PR 25 (line 289), §8 line 299 (23–25 share `DatabaseView.svelte`: land 23 first) · DESIGN §2.7 (lines 113–120; gallery line 120, boards D-DB3 `wireframes/v4/index.html:379`, M-DB1 `:352`), §0 (lines 9–15), §3 (lines 157–166) · `docs/v2/FEATURES.md` PG-VIEWS line 122 ("Gallery (cover source specced first)") · decisions D-V4-35
- Needs: 23 (view tabs + ⚙ settings pattern) · Size: M · Branch: `v4/25-db-gallery-view`

## What

A database gets a Gallery view: records as cards in a grid, each card a 16:9 cover, the record title and the two properties chosen in the view settings, at card size S / M / L. A card opens the record's page. No migration: `database_views.view_type` already allows `gallery` and the table has no SQL CHECK on that column (`schema.ts:637`, `drizzle/0006_v2_databases.sql:45-49`).

Owner decisions that apply: **D-V4-35** — the gallery reuses card 23's view switch and ⚙ settings, clicking the card body opens the record page, `Card shows` defaults to the first two non-title properties, a read-only share hides every write control, and the view loads up to 500 records with `Showing N of M`.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `Gallery` is offered by card 23's `+` view picker and the created view stores `view_type = 'gallery'`; its ⚙ settings show exactly `Card size` (S / M / L) and `Card shows` (two property pickers, default the first two non-title properties), saved in `config_json` through `PATCH /api/database-views/:id`, and `viewConfigSchema` (`repo/databases.ts:288`) gains only the keys the three view cards use; the chosen size and shows survive a reload (DESIGN §2.7 line 115; D-V4-35).
- C2 The view renders a grid of cards at base widths S 180 / M 240 / L 320 px with a 16:9 cover area; on phone the card width is `min(configured, (viewport − padding − gap) / 2)`, so two columns always fit inside the viewport and a 320 px card never overflows a 412 px screen; the grid scrolls without a visible scrollbar; every colour is a token (`--card`, `--ground`, `--rule`, `--ink`, `--pill`) (DESIGN line 120; CLAUDE.md "no visible scrollbars").
- C3 A card's cover is the record page's cover when one is set (`pages.cover_attachment_id` from card 15, filled by card 31; image URL `/api/attachments/<id>`), else `--ground` with the record page's icon, else a neutral glyph for a record that has no page yet. `DatabaseDTO.rows` gains the record page's `icon` (null when it has none) so the grid never fetches one page per card. The "first image attachment property" of BREAKDOWN line 179 has no property type today, so the cover stack is the Decided one (DESIGN line 120; `dbvalues.ts:4-13`).
- C4 A card shows the title (maximum two lines, ellipsis) plus the two `Card shows` properties as chips rendered with `asText` (`dbvalues.ts:66-73`); clicking the card body, or Enter on a focused card, opens the record's page through the existing record-to-page path (`DatabaseView.svelte:197-201`), and the card is a real focusable control with an accessible name containing the title (D-V4-35; DESIGN lines 116, 120).
- C5 The view's existing filter and sort still decide which records get a card (the same `dbs.get()` path the table uses, `repo/databases.ts:104-120`): a filtered-out record has no card; a sort orders the cards the same way it orders the table.
- C6 The gallery asks for up to the existing 500-row cap and, when the filtered set is larger, the footer says `Showing N of M` as the table does (`repo/databases.ts:121-123`, `DatabaseView.svelte:518-523`); no card is silently missing without that line (D-V4-35).
- C7 Empty: a database with no records shows `No records yet.` (Decided) plus the existing `New record` action from the toolbar; a database whose records are all filtered out shows the same line and keeps the existing filter pills so the filter can be changed (DESIGN §3 line 14).
- C8 Phone: exactly 2 columns at every card size (S, M and L — C2's width cap), so the phone spec asserts "2 columns" and not a pixel width; cover and title sit inside a ≥ 48 dp tap target, tapping a card opens the record, no drag and no swipe on cards, no "Ctrl"/"Click"/Esc text visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN line 120, §0 lines 11, 15).
- C9 States (DESIGN §3): loading — `Loading database…` (`DatabaseView.svelte:217-218`); error — `This database is unavailable.` for a missing database (`DatabaseView.svelte:215-216`), other failures via `showError`; offline — `New record` is disabled with the "You're offline" helper, the gallery itself still renders from the loaded data (line 164); read-only share — no `New record`, no settings write, cards open only (line 165; the access threaded by D-V4-35).
- C10 Both themes: every colour comes from a token pair and the gallery is checked in light and dark (DESIGN §0 line 9, §3 line 166).
- C11 Undo: nothing to undo — the gallery, the card size and `Card shows` only read or save view settings, which keep today's no-undo behaviour (like filters and sort, `DatabaseView.svelte:82`); no record value is written by this view.
- C12 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-VIEWS row and the tests line).

## Out of scope

- The board and calendar views (cards 23, 24), and starter templates that use them (card 26).
- An image/attachment property type, cover upload from the database, or a per-card cover override (page covers are card 31).
- Drag-reordering cards, resizing cards by drag, per-card menus, bulk select, or inline editing of chips.
- A `+ New` tile in the grid: new records use the existing toolbar button.
- Gallery inside a record page's properties or on the phone Cards layout of the table view.

## Files likely touched

- `app/src/lib/database/DatabaseView.svelte` (tabs 232–246, toolbar/panels 248–400, table area 402–517 that the gallery replaces, phone CSS 743–798)
- `app/src/lib/database/GalleryView.svelte` (new)
- `app/src/lib/dbvalues.ts` (`ViewConfig` 80–86, `asText` 66–73)
- `app/src/lib/server/repo/databases.ts` (`get` 80–124 incl. the row map 96–103, `viewConfigSchema` 288)
- `app/src/routes/api/database-views/[id]/+server.ts` (read-only: config PATCH)
- `app/src/lib/server/schema.ts` (`databaseViews` 629–647, read-only)
- `app/src/lib/types.ts` (`DbView` 179–184, `DbRow` 185–192, `DatabaseDTO` 193–202)
- `app/tests/unit/databases.test.ts`, `app/tests/unit/v4-25-gallery.test.ts` (new)
- `app/tests/e2e/v4/25-gallery.spec.ts` (new), `app/tests/e2e/phone/v4-25-gallery.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — `view_type` `gallery` round trip through card 23's `addView`, the new config keys accepted and unknown keys still refused, rows carry the record icon (null without a page), filter/sort decide the cards, the filtered-empty state — in `app/tests/unit/v4-25-gallery.test.ts`; desktop e2e create a Gallery view, cards render with title + two chips, change size S→L, click a card opens the record, empty state — `app/tests/e2e/v4/25-gallery.spec.ts`; phone 2 columns at S and at L (not a px width), 48 dp, tap opens — `app/tests/e2e/phone/v4-25-gallery.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-25-blind.test.ts`, `app/tests/e2e/v4/25-blind.spec.ts`, `app/tests/e2e/phone/v4-25-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-VIEWS).

## Decided

- Decided: D-V4-41 — cover = page cover, then `--ground` + record icon (no image property type); empty state "No records yet." + the existing New record button.
