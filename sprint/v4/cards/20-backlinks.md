# Card 20 · feat: backlinks panel

- Source: BREAKDOWN PR 20 (lines 148–152) · PLAN §1b (line 25), §3E item 4 (line 140: `SELECT source pages WHERE target = this`, filter every source through `level()`), §5 item 2 (line 178, privacy), §8 PR 20 (line 284), §8 line 299 (16–20 merge one at a time) · DESIGN §2.1 item 7 (line 64), §2.5 (lines 90–94; boards D-P1 `wireframes/v4/index.html:195`, M-P1 `:220`), §0 (lines 13, 14), §3 (lines 157–166) · decisions — (none)
- Needs: — · Size: S–M · Branch: `v4/20-backlinks`

## What

Under the editor each page shows "Linked from (n)": the pages that link to it, one row per source with its icon, its title as a link and a one-line snippet of the linking block. The list is filtered per viewer, so a shared page never reveals the titles of pages the viewer cannot open, and the whole panel disappears at zero links.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 The server returns the panel's rows for one page: sources from `page_links` joined to `pages` on `source_page_id`, with `deleted_at IS NULL`, and each source then checked with `level(viewer, 'page', id)`; a source the viewer cannot open is dropped completely — no title, icon, snippet or count leaked (BREAKDOWN line 150; PLAN line 140; `shares.ts:22-35`).
- C2 The panel renders after the last block, separated by a `--rule` line: heading `Linked from (n)` with a chevron, n = the rows the viewer can see; open by default at 1–5 rows, closed above 5, and the whole panel not rendered at 0 (DESIGN lines 64, 91, 94).
- C3 A row = source icon · source title as a link to `/pages/<id>` · one line of the linking block with an ellipsis when it overflows; the link text is bold. A source with no icon shows the title with no glyph. The server returns the block's plain text and the client bolds the target title (D-V4-32; DESIGN line 92).
- C4 An archived source is greyed and its title is followed by `· archived`; clicking it still opens the page (BREAKDOWN line 150; DESIGN line 93). Archived does not hide the row.
- C5 A trashed source is not listed; trashing a source and reopening the target drops its row. A source page saved again keeps its row (the projection is rebuilt with the new block ids on every save, `repo/pages.ts:246-258`).
- C6 Permissions: opening the panel needs only view access to the page (`need('page', uid, id)`, `app/src/routes/pages/[id]/+page.server.ts:10-17`), so a view-only share sees it and can follow only the rows it may open; the partner's private page that links to a page shared with me is never shown (BREAKDOWN line 152). A page id I cannot see stays a 404 and the panel never becomes an oracle for it (DESIGN §3 line 165).
- C7 The rows come with the page load in `app/src/routes/pages/[id]/+page.server.ts` (no client fetch), so they are painted with the page; an editor autosave refreshes them through `$lib/client/refresh` (D-V4-32).
- C8 Phone: rows are ≥ 48 dp tall and the chevron is ≥ 48 dp; the panel is inline (no new sheet or history entry), Back still leaves the page; no "Ctrl"/"Click" copy; `expectTargets48` and `noDesktopHints` pass on a page with a long snippet (DESIGN §0 lines 11, 15; board M-P1).
- C9 Undo: the panel performs no mutation — opening or collapsing it writes no row, no journal entry and no toast (CLAUDE.md undo rule is about mutations; DESIGN line 13).
- C10 States (DESIGN §3): loading — server-rendered with the page, no skeleton; empty — 0 links hides the whole panel (DESIGN line 94); error — a failing load is the page's own 404/error page as today, never a half-rendered panel; offline — the panel renders from the loaded data and links still navigate; view-only share — panel visible, rows open pages the viewer may open.
- C11 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-LINK row and the tests line).

## Out of scope

- The local graph (card 21), the `[[` picker (card 19), link editing or unlinking from the panel.
- A "Linked from" count on the sidebar/tree, badges on the page header, or keyboard shortcuts inside the panel.
- Snippets with highlighted ranges, multi-line snippets, or showing the whole linking block on hover.
- Templates (`is_template`, card 22) and record pages are not special-cased: the panel shows on every page that has links (D-V4-32).

## Files likely touched

- `app/src/lib/server/repo/pages.ts` (new `backlinks()` near `findByTitle` 394–413; `get` 58–95 read-only; projection 246–258 read-only)
- `app/src/routes/pages/[id]/+page.server.ts` (load 8–23)
- `app/src/routes/pages/[id]/+page.svelte` (after the editor 288–290, styles 298–468)
- `app/src/lib/server/search.ts` (`textOf` 71–76, read-only or reused for the snippet)
- `app/src/lib/server/repo/shares.ts` (`level` 22–35, read-only)
- `app/src/lib/server/schema.ts` (`page_links` 510–528, `page_blocks` 487–506, read-only)
- `app/src/lib/types.ts` (`PageDTO` 157–170 or a new backlink row type)
- `app/tests/unit/pages.test.ts`, `app/tests/unit/v4-20-backlinks.test.ts` (new)
- `app/tests/e2e/v4/20-backlinks.spec.ts` (new), `app/tests/e2e/phone/v4-20-backlinks.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — link A → B then `backlinks(owner, B, owner)` shows A; a viewer without access to A gets none; archived A is flagged; trashed A is gone; a page linking B twice gives one row for that page (D-V4-32) — in `app/tests/unit/v4-20-backlinks.test.ts`; desktop e2e link A → B, open B, see A, click it — `app/tests/e2e/v4/20-backlinks.spec.ts`; phone 48 dp rows and collapse — `app/tests/e2e/phone/v4-20-backlinks.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-20-blind.test.ts`, `app/tests/e2e/v4/20-blind.spec.ts`, `app/tests/e2e/phone/v4-20-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages).

## Decided

- Decided: D-V4-32 — one row per source page (first linking block for the snippet, n = source pages); the server returns the block's plain text and the client bolds the target title; newest link first (`page_links.created_at`); refresh on editor autosave via `$lib/client/refresh`; show on every page with links (record, archived, templates included).
