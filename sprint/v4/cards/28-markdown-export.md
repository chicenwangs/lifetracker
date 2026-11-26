# Card 28 · feat: Markdown export

- Source: BREAKDOWN PR 28 (lines 195–198) · PLAN §1b (line 33), §3E item 8 (line 146), §5 item 4 (line 180: data portability), §8 PR 28 (line 292) · DESIGN §2.6 (lines 96–103: `Export Markdown` is the third menu group, line 100; boards D-P5 `wireframes/v4/index.html:286`, M-P5 `:307`), §0 (lines 9–15), §3 (line 165: read-only actions include Export) · BREAKDOWN line 137 (unknown-node safety) · `docs/v2/FEATURES.md` PG-LINK line 125, PG-SEARCH line 126, PG-VIEWS line 122 · decisions D-V4-24
- Needs: 18 (callout/toggle nodes to map), 27 (the tone map this card mirrors, D-V4-49) · Size: S–M · Branch: `v4/28-markdown-export`

## What

Any page — mine or shared with me — can be exported as Markdown: Page ⋯ → `Export Markdown` downloads one `.md` file built from the page's blocks, with internal links as `[[Title]]`, callouts as `> [!note]` blockquotes, toggles as `<details>` and each database block as a Markdown table snapshot. A page with children can export its subtree in one file. Export writes nothing, so it is offered on a read-only share and has no Undo.

Owner decisions that apply: **D-V4-24** — card 27 owns the import direction of the callout/toggle mapping; this card owns the export direction and must use the same keywords card 27 settles.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Page ⋯ gets `Export Markdown` in the third menu group, before Archive — after the `Duplicate` / template / `Local graph` group (DESIGN line 100, board D-P5); with children the row reads `Export with sub-pages (.md)` (Decided). On phone it is a row in the page actions sheet (DESIGN line 103, board M-P5). It is offered on a view-only share and on an archived page (DESIGN line 165); a page id I cannot open is 404.
- C2 Choosing it for a page with no children downloads one file named `<page title>.md` (characters illegal in a file name replaced, empty title → `Untitled.md`) with `Content-Type: text/markdown; charset=utf-8` and `Content-Disposition: attachment`; the body is the block mapping of C3, and the page title is not written as a `#` line — the file name carries it (Decided; BREAKDOWN line 196).
- C3 Block mapping (BREAKDOWN line 196; `docs/v2/FEATURES.md` PG-BLOCKS line 115 is the block set): paragraphs, H1–H3, bullet and numbered lists (nesting kept), task lists as `- [ ]` / `- [x]`, blockquotes, fenced code with the stored language, horizontal rules, simple tables, and bold/italic/strike/inline-code marks. A `pageLink` becomes `[[Title]]` only when the exporting viewer can open the target (`PageDTO.links`, `repo/pages.ts:58-79`: a null entry is a page they cannot see); otherwise it becomes the text `Unavailable page`, never the hidden title (`docs/v2/FEATURES.md` PG-SEARCH line 126 "no titles/snippets leak"). A page `image` node exports as `![alt](/api/attachments/<id>)` (Decided). Callout → `> [!note]` with the keyword of card 27's tone map for its tone; toggle → the `<details><summary>…</summary>` form, with its `open` state not represented (a toggle exports closed). Any node type the exporter does not know is written as its plain text, never as raw JSON (BREAKDOWN line 137).
- C4 A `database` block becomes a Markdown snapshot: a heading with the database's title, then a GFM table of the database's properties and up to the existing 500-record cap (`repo/databases.ts:121-123`), every cell rendered with `asText` (`dbvalues.ts:66-73`); when the set is larger the table ends with a `Showing N of M` line. The snapshot uses every property in position order (title first) and the records of the database's first view by position — the server has no notion of a selected view on this path, so the export calls `databases.get` without a `viewId` — with that view's filters and sort applied (Decided; `repo/databases.ts:80-124`).
- C5 A page with children exports the subtree as one concatenated `.md` (Decided: no zip dependency, so the menu says `Export with sub-pages (.md)`), each page a `#`-style section in parent-before-child order (`BREAKDOWN` line 197's fallback); the source page is the first section and every descendant the exporter cannot open is left out.
- C6 Access: the export runs as the signed-in user (`need('page', uid, id)`, `shares.ts:40-46`), reads pages with `pages.get(owner, id, false, viewer)` so `last_opened_at` is not touched, and never includes a page or link title the viewer cannot open — a shared page exports its own content plus only independently accessible linked/child pages (`docs/v2/FEATURES.md` PG-SHARING line 145, DESIGN line 165).
- C7 Nothing is written: no journal entry, no toast, no `revision` change, no search re-index, no `last_opened_at` write. Ctrl+Z after an export undoes the previous mutation, not the export.
- C8 Errors: an unknown or inaccessible page is a 404; a server failure answers with the existing JSON error body and the page shows `showError`; a partial file is never produced (the body is built before the response starts).
- C9 Phone: the row is in the page actions sheet at ≥ 48 dp; tapping it opens a `BottomSheet` holding the Markdown with a `Copy` button (desktop downloads the file, Decided). Back closes the sheet before the page and no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN §0 lines 11, 15).
- C10 States (DESIGN §3): loading — the row is disabled while the file is built, one tap makes one download; empty — an empty page still exports a file with an empty body (no title line, Decided), no error; error — `showError` and no file; offline — the row is disabled with the "You're offline" helper (`DESIGN` line 164); read-only — works (C1, C6).
- C11 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-VIEWS/PG-LINK area and the tests line).

## Out of scope

- Markdown import and its direction of the mapping (card 27).
- HTML export, PDF export, a whole-workspace export, or a scheduled/automatic backup export.
- Exporting attachments' bytes, Keep notes, planner items or databases that are not blocks on the exported page.
- Exporting comments, history, shares, pins or the page's emoji icon as a file.
- A preview of the file before download.

## Files likely touched

- `app/src/routes/pages/[id]/+page.svelte` (Page ⋯ menu 204–238, phone actions surface, `backCloses` rows)
- `app/src/routes/api/pages/[id]/export/+server.ts` (new: single page and subtree, `Content-Disposition`)
- `app/src/lib/server/markdown-export.ts` (new: Tiptap JSON → Markdown, DB snapshot, subtree order)
- `app/src/lib/server/repo/pages.ts` (`get` 58–95 incl. the `links` map, `subtree` 48–54 needs a public form, `archived`/`tree` read-only)
- `app/src/lib/server/repo/databases.ts` (`get` 80–124, read-only)
- `app/src/lib/dbvalues.ts` (`asText` 66–73, read-only)
- `app/src/lib/server/repo/shares.ts` (`need` 40–46, read-only)
- `app/src/lib/types.ts` (`PageDTO` 157–170, read-only)
- `app/src/lib/components/BottomSheet.svelte` (read-only: the phone sheet with `Copy`, Decided)
- `app/tests/unit/v4-28-markdown-export.test.ts` (new), `app/tests/unit/pages.test.ts`
- `app/tests/e2e/v4/28-markdown-export.spec.ts` (new), `app/tests/e2e/phone/v4-28-markdown-export.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — each block type exports once (headings, lists, to-dos, quote, code fence, table, hr), marks, a callout to its keyword, a toggle to `<details>`, a resolvable `pageLink` to `[[Title]]` and an inaccessible one to plain text, a DB snapshot through the database's first view by position with the 500 cap, a subtree in parent-first order, and the round-trip test (export → card 27 import gives the same page tree and block structure, BREAKDOWN line 198) — in `app/tests/unit/v4-28-markdown-export.test.ts`; desktop e2e export a page, read the downloaded file from Playwright's download event, assert the content, then export a page with a child — `app/tests/e2e/v4/28-markdown-export.spec.ts`; phone row + 48 dp + Back + no hints — `app/tests/e2e/phone/v4-28-markdown-export.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-28-blind.test.ts`, `app/tests/e2e/v4/28-blind.spec.ts`, `app/tests/e2e/phone/v4-28-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages).

## Decided

- Decided: D-V4-44 — one concatenated `.md`, menu row "Export with sub-pages (.md)" (no zip dependency); no `# Title` line (the file name carries it); images as `![alt](/api/attachments/<id>)`; underline exports as plain text; DB snapshot = every property in position order, title first, records in the selected view's order with filters/sort applied; phone shows a BottomSheet with Copy, desktop downloads the file.
- Note on D-V4-44: the export path has no selected view (that is client state), so "the selected view" is the database's first view by position — `databases.get` is called without a `viewId` and its filters/sort apply.
