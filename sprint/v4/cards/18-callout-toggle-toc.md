# Card 18 · feat: callout, toggle, table of contents

- Source: BREAKDOWN PR 18 (lines 133–138) · PLAN §3E item 5 (line 141), §5 item 7 (line 183), §8 PR 18 (line 282), §8 line 299 (merge order with 16–20) · DESIGN §2.3 (lines 74–79; board D-P1 lines 195–218 inline, board D-P3 named at line 74 is not in `wireframes/v4/index.html`), §3 (lines 157–166) · decisions — (none)
- Needs: 15, 16 (shared IconPicker, D-V4-24) · Size: M · Branch: `v4/18-callout-toggle-toc`

## What

Three new page blocks, stored as today's Tiptap JSON in `page_blocks`, so no migration. **Callout**: a coloured box with an emoji that holds paragraphs and lists, four tones that work in both themes. **Toggle**: a summary line with a collapsible body whose `open` state is saved in the JSON; Enter on the summary toggles it. **Table of contents**: a read-only live list of the page's H1–H3 that scrolls to a heading on click. The server's node allow-list, the search text and the page save must all accept them.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `/callout` inserts a callout block: rounded 10 px box, 3 px left bar in the tone ink, tone background, emoji top-left, holding paragraphs and lists; it starts Yellow with 💡 (D-V4-24; DESIGN line 75; BREAKDOWN line 134).
- C2 The four tones — Grey, Blue, Yellow, Red — render with the light/dark pairs of DESIGN line 76; the colours are new token pairs in `app/src/app.css` (`:root` light + `:root[data-theme='dark']`, beside the `--alert-*` block) and are listed in `docs/THEME.md`'s token table; the e2e checks both themes and no colour is hard-coded outside the pairs (DESIGN §0 line 9, §3 line 166).
- C3 Switching the tone saves and survives reload; only the four values are ever written. The control is a `Colour` select in the desktop `desk` toolbar group (the buttons shown on desktop only, `PageEditor.svelte:306-323`) and a `Colour` row in the phone Block `ActionSheet` (`PageEditor.svelte:347-359`); card 29 moves it into the gutter `⋮⋮` menu (D-V4-24).
- C4 Clicking the callout's emoji opens the icon picker (card 16's curated set); the picked emoji is stored in the node attrs and survives reload (DESIGN line 75).
- C5 `/toggle` inserts a summary line plus a collapsible body that starts closed (D-V4-24): `▸`/`▾` chevron (24 px desktop, 48 dp phone) + summary text, body indented 24 px, and an empty body shows "Empty toggle. Type or drop blocks inside." (DESIGN line 77; BREAKDOWN line 135).
- C6 The toggle's `open` state is saved in the node attrs, so a page reload restores exactly the open/closed state it was saved in; the state is per page content, not per viewer (PLAN line 141 "the same for every viewer: fine for a household").
- C7 Keyboard: Enter on the summary line toggles the body and does not split the summary line; the chevron is a real button with `aria-expanded` and a name ("Expand <summary>" / "Collapse <summary>") (BREAKDOWN line 135).
- C8 `/toc` inserts a table of contents: `--ground` fill, title "On this page", the page's H1–H3 indented 0 / 16 / 32 px; with no headings it shows "Add headings to fill this"; the list updates live as headings are typed, reordered or turned into headings; clicking a row scrolls that heading into view (BREAKDOWN line 136; DESIGN line 78).
- C9 Slash menu gains exactly three entries with their hint lines: `Callout — Highlight a note`, `Toggle — Hide details under a line`, `Table of contents — List this page's headings`; filtering, arrows, Enter, Esc and the phone 48 dp rows come from the existing `SlashMenu.svelte` (DESIGN line 79).
- C10 Server: `pages.update`'s doc check (`repo/pages.ts:98-168`) accepts `callout` with only `emoji`/`tone`, `toggle` with only `open` (boolean), and `toc` with no attrs; unknown node types and unknown attrs are still refused. Heading/paragraph/list content inside a callout or toggle is validated exactly like top level.
- C11 Search: the text inside a callout and inside an open or closed toggle is indexed and found (`search.ts textOf` recurses content); a word typed only in a callout or toggle is found by the header search after the page save.
- C12 Round trip: insert all three in one page (callout with text + a list, toggle with a body, TOC), save, reload — all three are present with tone, emoji and `open` intact; the page opens with no "unknown block" error and no dropped block.
- C13 Phone: the chevron, the callout emoji, the tone action and every TOC row are ≥ 48 dp; the picker/action surfaces use `BottomSheet.svelte` with `use:backCloses`; Back closes the open sheet before the page; no "Click"/"Ctrl"/Esc hint is visible or read out; `expectTargets48` and `noDesktopHints` pass on a page holding all three (DESIGN §0 lines 11, 15).
- C14 Undo: block insert/edit/delete is the page editor's own Tiptap history (Ctrl+Z on a page is the editor undo, `PageEditor.svelte:200-213`); no server journal entry and no undo toast is added for these blocks, and the doc save keeps the existing revision/409 behaviour.
- C15 States (DESIGN §3): loading = the blocks render with the page shell, the editor mounts on the client as today; empty = TOC "Add headings to fill this", empty toggle placeholder; error = a rejected save keeps the text and shows "Save failed · Retry" as today; offline = the existing page save state; on a view-only shared page all three render read-only (the toggle still expands, the emoji picker and tone action are not offered).
- C16 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-BLOCKS row + the tests line), `docs/THEME.md` (callout tone pairs, DESIGN §0 line 9).

## Out of scope

- Markdown import/export mapping (blockquote / `<details>` / list): owned by cards 27 and 28 (D-V4-24; BREAKDOWN line 137).
- Block drag handles, the gutter `⋮⋮` menu and "Turn into…" (card 29); `Colour ▸` moving there later (D-V4-24).
- Callout nesting inside a callout (allowed by the node model only if the builder chooses; no requirement here), collapsible defaults, per-viewer toggle state.
- TOC levels beyond H1–H3, numbering, anchors in the URL, a TOC in Markdown.
- Any database, migration or server-side projection of these nodes.

## Files likely touched

- `app/src/lib/editor/extensions.svelte.ts` (new `Callout`, `Toggle`, `TableOfContents` nodes beside `PageLink`/`DatabaseBlock`)
- `app/src/lib/editor/PageEditor.svelte` (register the nodes in the `extensions` array 171–181, `ITEMS` 44–60, desktop `Colour` select in the `desk` group 306–323, phone Block `ActionSheet` 347–359, block styles 497–633)
- `app/src/lib/editor/SlashMenu.svelte` (read-only: `hint` rendering line 36, 48 dp rows 89–97)
- `app/src/lib/components/IconPicker.svelte` (card 16's component, shared — D-V4-22/D-V4-24)
- `app/src/lib/server/repo/pages.ts` (`NODES` 98–119, `check` 130–168)
- `app/src/lib/server/search.ts` (`textOf` 71–76, read-only unless C11 fails)
- `app/src/app.css` (`:root` light tokens 40–60, dark 140–160, beside `--alert-bg`/`--alert-ink`), `docs/THEME.md` (tokens table)
- `app/tests/unit/pages.test.ts`, `app/tests/unit/v4-18-blocks.test.ts` (new)
- `app/tests/e2e/v4/18-blocks.spec.ts` (new), `app/tests/e2e/phone/v4-18-blocks.spec.ts` (new)

## Tests

- Builder: unit doc round trip through `pages.update`/`pages.get` (save → load keeps `tone`/`emoji`/`open`), unknown attr still refused, `textOf` picks callout/toggle text — `app/tests/unit/v4-18-blocks.test.ts`; desktop e2e insert each via `/`, reload, still there, both themes for the callout — `app/tests/e2e/v4/18-blocks.spec.ts`; phone chevron/rows 48 dp and the sheet — `app/tests/e2e/phone/v4-18-blocks.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-18-blind.test.ts`, `app/tests/e2e/v4/18-blind.spec.ts`, `app/tests/e2e/phone/v4-18-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6), `docs/THEME.md` (callout tones).

## Decided

- Decided: D-V4-24 — the "unknown node" line means the Markdown mapping only; cards 27/28 own that mapping; Colour lives in today's block actions until card 29 moves it to ⋮⋮; card 18 `Needs: 16` for the shared picker; default Yellow + 💡; a new toggle starts closed; TOC lists every H1–H3 in document order.
