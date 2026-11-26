# Card 27 · feat: Markdown import

- Source: BREAKDOWN PR 27 (lines 187–193) · PLAN §1b (line 32), §3E item 8 (lines 145–146), §7 item 7 (line 239: `#` = child page), §8 PR 27 (line 291) · DESIGN §2.11 (lines 141–147, board D-P9 `wireframes/v4/index.html:455`), §2.6 (line 109 `Import Markdown…`), §0 (lines 9–15), §3 (lines 157–166) · BREAKDOWN line 137 (unknown-node safety) · `docs/v2/FEATURES.md` PG-CREATE line 111, PG-TREE line 113, PG-BLOCKS line 115 · decisions O-1 item 7, D-V4-24, D-V4-43, D-V4-49
- Needs: 18 (callout/toggle nodes and their validation) · Size: M · Branch: `v4/27-markdown-import`

## What

Page ⋯ → `Import Markdown…` takes a `.md` file (an LLM answer, an Obsidian or Notion export) and turns it into a page tree under one root page titled from the file name: each `#` heading becomes a child page, `##`–`###` become headings inside it, and text before the first `#` becomes the root page's body. A preview shows the tree and how many `[[links]]` will connect before anything is written. Import is one transaction with one Undo, and it uses the `marked` lexer that is already a dependency (`app/package.json:47`) — no new package (`BREAKDOWN` line 192).

Owner decisions that apply: **O-1** item 7 (`#` = child page under one parent); **D-V4-24** — this card owns the callout/toggle Markdown mapping in the import direction (card 28 owns the export direction).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Page ⋯ gets `Import Markdown…` (BREAKDOWN line 188; the menu's last group, before the archive/trash rows). It opens a file picker accepting `.md`; a file over 1 000 000 bytes (Decided; BREAKDOWN line 188 and DESIGN line 142 say 2 MB) is refused before upload with an inline message, and the server re-checks the posted file's size. The New page ▾ row of DESIGN line 109 is not shipped (Decided).
- C2 A valid file opens a preview: desktop a dialog (DESIGN §2.11, board D-P9), phone a full-screen `BottomSheet`; it shows the big line `Will create N pages`, the tree (one `📄 <title>` line per page to be created, indented one level for the child pages), a `Put under` page picker whose default is the page the import started from (top level when there is none), the link note `X links will connect to existing pages · Y stay as text`, and `Cancel` / `Import N pages` (DESIGN lines 142–146; D-P9). N is the number of pages that will be created, not the number of headings.
- C3 Tree mapping (O-1 item 7; BREAKDOWN lines 189–190): exactly one root page is always created under `Put under`, titled from the file name without `.md`, trimmed to 300 characters (`Imported page` when that is empty); every `#` heading becomes one child page of that root; `##` and `###` become H2/H3 blocks inside that child; text before the first `#` becomes the root page's body. All `#` pages are siblings — DESIGN's D-P9 draws a third indent level, but BREAKDOWN line 189 and O-1 item 7 make every `#` a sibling, so the tree never nests deeper than one level. A file with no `#` is that single root page with the whole file as its body (C12 excludes a zero-content file).
- C4 Inline mapping (BREAKDOWN line 189; `docs/v2/FEATURES.md` PG-BLOCKS line 115 is the block set): paragraphs, `##`/`###` headings, `-` and `1.` lists including nesting, `- [ ]` / `- [x]` to-dos with their checked state, `>` quotes, callouts from Obsidian admonitions with the exact tone map of D-V4-49: `[!note]` → Grey, `[!tip]` / `[!info]` → Blue, `[!warning]` / `[!caution]` → Yellow, `[!danger]` → Red; `<details><summary>…</summary>` → a toggle (D-V4-49), fenced code blocks with their language, horizontal rules, and simple pipe tables. `[[Title]]` becomes a page link when it resolves (C5), else literal text. Images and links from the file stay as links — the importer never fetches a URL and never creates an `image` node (a page image must be an uploaded attachment, `repo/pages.ts:140-143`).
- C5 Link resolution: after every page exists, each `[[Title]]` resolves by exact title (trimmed, case-sensitive) to a live page of mine, or to a page created by this same import; the resolved ones are written as the existing `pageLink` node, so `page_links` and the graph pick them up unchanged (`repo/pages.ts:170-176, 250-258`). An unresolved `[[Title]]` stays as the text `[[Title]]`. Duplicate titles resolve to an existing page first, else to the first page this import created with that title (Decided).
- C6 Every produced document passes `pages.check` (`repo/pages.ts:98-168`): only known node types and attributes, image and pageLink ids well-formed, and every `link` mark's `href` matching `SAFE_HREF` (`repo/pages.ts:128`) — a link Markdown gives that the schema refuses is imported as plain text, so a bad link never fails the whole import. Raw HTML in the file is dropped as markup and its text kept; nothing is ever rendered with `{@html}` (no HTML node exists in the page schema).
- C7 Nothing is half-imported: the whole tree is written in one transaction (page rows, `page_blocks`, `page_links`, the search index), so a failure at any point leaves no page behind; each created page respects the 1 MB `MAX_DOC_BYTES` cap (`repo/pages.ts:17`); a file whose single page would exceed it is refused in the preview with a plain-words reason (Decided).
- C8 Permission: the import runs as the signed-in user and writes only their pages; `Put under` lists only pages I own, because `pages.create` requires the parent to be mine (`repo/pages.ts:209-214`) — a page shared with me is not offered as a parent, and no client-supplied owner id is accepted. Importing onto a page I can only view is impossible by construction.
- C9 Undo: the toast reads `Imported N pages · Undo`, and Undo moves every page the import created to Trash in one batch (BREAKDOWN line 191), restorable from Trash; the batch spans several roots, so `pages.trash` is extended to take a list of roots (Decided). Nothing else is altered: the `Put under` page's own body and blocks are not rewritten by the import.
- C10 After the import the `Put under` page opens (or reloads) with the new child tree visible, and each created page shows its mapped content on first open (DESIGN line 147).
- C11 Phone: the preview is a full-screen sheet with `Put under`, both buttons and every tree row at ≥ 48 dp, Back closes the sheet before the page, and no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN §0 lines 11, 15).
- C12 States (DESIGN §3): loading — `Reading file…` in the preview area, no spinner over 300 ms; empty — a zero-content file (only whitespace, or nothing the parser can turn into a page) is refused in the preview with `No pages found — nothing to import` and `Import` disabled, so C3's one-page rule applies only to a file that has content; error — an inline `.alert` with the server message plus `Choose another file`, never a toast; offline — the page and the file input are disabled with "You're offline" and nothing is queued (the offline queue covers Keep and quick add only, DESIGN line 164).
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-CREATE/PG-TREE/PG-BLOCKS area and the tests line).

## Out of scope

- Markdown export and its callout/toggle direction (card 28).
- Importing into a database, Keep, or the planner; importing attachments or downloading remote images.
- A watched folder, API import, LLM call, or pasting Markdown into a dialog (file only, BREAKDOWN line 188).
- Re-import matching by title or UID: a second import creates a second tree and the preview says so (Decided); a Markdown file stores no UID.
- Footnote/definition-list syntax, raw HTML rendering, or front-matter handling.

## Files likely touched

- `app/src/routes/pages/[id]/+page.svelte` (Page ⋯ menu 204–238, dialog mount)
- `app/src/lib/components/MarkdownImport.svelte` (new: file pick, preview, `Put under`, Import)
- `app/src/lib/server/markdown-import.ts` (new: `marked.lexer` tokens → page tree + Tiptap JSON, link pass)
- `app/src/routes/api/pages/import/+server.ts` (new: preview + apply, multipart file)
- `app/src/lib/server/repo/pages.ts` (`create` 209–223, `update` 225–275, `check`/`NODES` 98–168, `subtree` 48–54, `trash` 345–361)
- `app/src/lib/server/undo.ts` (`undoable` 38–56 — only if Decided picks the journal)
- `app/src/hooks.server.ts` (body cap lines 56–66 — only if Decided raises the limit for this route)
- `app/src/lib/components/Dialog.svelte` / `BottomSheet.svelte` (read-only: preview surfaces)
- `app/src/lib/components/NewPageMenu.svelte`, `MobileAdd.svelte` (only if Decided adds the second entry point; components from card 22)
- `app/src/lib/types.ts` (`PageDTO` 157–170, read-only)
- `app/tests/unit/pages.test.ts`, `app/tests/unit/v4-27-markdown-import.test.ts` (new)
- `app/tests/e2e/v4/27-markdown-import.spec.ts` (new), `app/tests/e2e/phone/v4-27-markdown-import.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit fixtures — an LLM outline (`#` pages, `##` headings, lists, to-dos), an Obsidian note with `[!note]`, `[!tip]`, `[!warning]` and `[!danger]` callouts, a `<details>` toggle, `[[wikilinks]]` and a code fence, a file whose text precedes the first `#` (root page body), a file with no `#` (one root page, whole file), a zero-content file refused, a bad `href` that becomes text, a 1 MB-plus single page refused, the preview counts — in `app/tests/unit/v4-27-markdown-import.test.ts`; desktop e2e `Import Markdown…` → preview tree + count → `Put under` → Import → tree appears → Undo → gone — `app/tests/e2e/v4/27-markdown-import.spec.ts`; phone sheet, 48 dp, Back, offline — `app/tests/e2e/phone/v4-27-markdown-import.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-27-blind.test.ts`, `app/tests/e2e/v4/27-blind.spec.ts`, `app/tests/e2e/phone/v4-27-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages).

## Decided

- Decided: D-V4-43 — 1 000 000 bytes; page ⋯ only (the current page is the Put under default); root title = file name without `.md` (300 max, "Imported page" if empty); one batch trash for all roots; `[[Title]]` resolves to an existing page first, else the first created with that title; a second import creates a second tree and the preview says so.
- Decided: D-V4-49 — callout tone map: `[!note]` → Grey; `[!tip]` / `[!info]` → Blue; `[!warning]` / `[!caution]` → Yellow; `[!danger]` → Red; `<details>` → toggle.
