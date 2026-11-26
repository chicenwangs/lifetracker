# Card 16 · feat: page emoji icon

- Source: BREAKDOWN PR 16 (lines 121–125) · PLAN §1b (line 22), §3E item 1 (line 137), §5 item 5 (line 181), §8 PR 16 (line 280) · PLAN §8 line 299 (16–20 all touch `PageEditor.svelte`/`extensions.svelte.ts`: merge one at a time) · DESIGN §2.1 items 3–4 (lines 60–61), §2.2 (lines 68–72, board D-P2; the phone twin M-P2 named there is not in `wireframes/v4/index.html`) · decisions — (none)
- Needs: — · Size: S · Branch: `v4/16-page-icon`

## What

Every page can carry one emoji from a small curated set. A button beside the page title shows the icon or a faint "Add icon" and opens the picker; the icon then shows on the page, in the sidebar and in the graph, and the page API carries it for the `[[` picker. `pages.icon` and `PATCH /api/pages/:id { icon }` already exist, so this is the picker plus the places the icon was not shown.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 On a page I own or can edit, a button beside the title (desktop) shows the page's icon at 56 px, or a faint "Add icon" when it has none; the button is ≥ 24 px and its accessible name contains the visible text ("Add icon" / "Page icon"). On phone the entry is the page ⋯ sheet row `Add icon` (D-V4-22) and the icon itself is 44 px. On a page opened with `pg.access === 'view'` the entry and picker are not rendered, while an icon that already exists still displays (DESIGN §2.1 lines 60–61, 66; §0 line 10; §3 line 165).
- C2 Desktop click opens a popover 320 px wide with the 40 curated emoji of DESIGN line 72 in an 8 × 5 grid of 36 px cells, a title "Icon" and a `Remove` link top-right; arrow keys move the highlight, Enter picks, Esc closes, and focus returns to the icon button (DESIGN §2.2 lines 69–70, board D-P2).
- C3 Picking an emoji sends `PATCH /api/pages/:id { icon }` (strict `pages.patchSchema`, `icon` max 8 / nullable, `repo/pages.ts:182-191`) and the icon survives a reload; `Remove` sends `icon: null` and the button returns to "Add icon". The picker has no search and no full emoji set (BREAKDOWN line 122).
- C4 The icon shows in three places: the page itself; the desktop sidebar tree (already `n.icon`, `pages/+layout.svelte:127`); the graph node label (`GraphDTO.nodes` gains `icon`, `graph.ts:13-36`, label = icon + title at `pages/graph/+page.svelte:87`, archived/record marking unchanged). The page API carries it for the later list surfaces: `pages.findByTitle` gains `icon` (`repo/pages.ts:408-413`) for card 19's `[[` picker; that picker's row rendering is card 19's, not this card's.
- C5 An icon change is independent of the editor: it does not rewrite `page_blocks`, does not touch `page_links`, and a page with unsaved text keeps that text through the icon change (the editor's `revision` still lines up, `PageEditor.svelte:139-163`).
- C6 Phone: the picker opens in `BottomSheet.svelte` with 6 columns and 48 dp cells, Back closes it before the page, and no "Click"/"Ctrl"/Esc hint is visible or read out; `expectTargets48` and `noDesktopHints` pass with the picker open (DESIGN §0 lines 11, 15; §2.2 line 71).
- C7 Permission: a page id I cannot see is 404 on the icon PATCH (existing `need('page', …, 'edit')`, `api/pages/[id]/+server.ts:14-22`), a view-only share gets 403, and a partner's icon change never appears on my page (each write is scoped to the owner).
- C8 Undo: setting or removing an icon shows an undo toast whose Undo puts the previous icon (or none) back, and the page's `revision` still matches the editor so the next text save is not a 409 (CLAUDE "every mutation gets an undo entry"; DESIGN §0 line 13; mechanism: D-V4-22 — journal the `pages` row but do not roll `revision` back).
- C9 States (DESIGN §3): loading = the picker opens without a request; empty = no icon → "Add icon", picker still offers all 40; error = a failed PATCH keeps the old icon, shows the existing `showError`, and re-reads the page; a view-only page shows the icon read-only and no picker, with no error.
- C10 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-CREATE/PG-BLOCKS area gets the icon row, PG-GRAPH label).

## Out of scope

- The `[[` mention picker (card 19) and the backlinks panel (card 20): they draw the icon when they exist; this card only makes the data available (`findByTitle`, tree, graph, `PageDTO`).
- Covers (`pages.cover_attachment_id`, card 31) and the hover row that pairs "Add icon" with "Add cover".
- An icon in the header pin bar, Keep notes, item types, the page title text itself, or the tab title.
- Custom emoji upload, recents, search, or storing more than one icon per page.

## Files likely touched

- `app/src/routes/pages/[id]/+page.svelte` (title block 240–254, `.title` styles 381–394)
- `app/src/lib/components/IconPicker.svelte` (new; shared with card 18 per D-V4-22)
- `app/src/routes/pages/+layout.svelte` (sidebar icon 127, read-only)
- `app/src/lib/server/repo/pages.ts` (`findByTitle` 408–413; `patchSchema` 182–191 read-only)
- `app/src/lib/server/undo.ts` (`TABLES` line 12, `undo()` 59–93 — the D-V4-22 special case that keeps `pages.revision` on undo)
- `app/src/lib/server/graph.ts` (query 11–23, node map 36)
- `app/src/lib/types.ts` (`GraphDTO` 205–210)
- `app/src/routes/pages/graph/+page.svelte` (label line 87)
- `app/src/routes/api/pages/[id]/+server.ts` (read-only: PATCH already accepts `icon`)
- `app/tests/unit/graph.test.ts`, `app/tests/unit/v4-16-icon.test.ts` (new)
- `app/tests/e2e/v4/16-page-icon.spec.ts` (new), `app/tests/e2e/phone/v4-16-page-icon.spec.ts` (new)

## Tests

- Builder: unit `GraphDTO`/`findByTitle` carry the icon (null when unset) and undo restores the icon without rolling `pages.revision` back, in `app/tests/unit/v4-16-icon.test.ts`; desktop e2e set → sidebar shows it → Remove → undo in `app/tests/e2e/v4/16-page-icon.spec.ts`; phone ⋯ row + picker sheet + 48 dp in `app/tests/e2e/phone/v4-16-page-icon.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-16-blind.test.ts`, `app/tests/e2e/v4/16-blind.spec.ts`, `app/tests/e2e/phone/v4-16-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6).

## Decided

- Decided: D-V4-22 — icon button left of the title on desktop; phone entry is the page ⋯ sheet row "Add icon" (DESIGN §2.1); journal the pages row but undo must not roll `revision` back (special case in `undo.ts`); card 16 ships `IconPicker.svelte` and card 18 needs 16; the icon is drawn above the title now.
