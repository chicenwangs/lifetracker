# Card 19 · feat: `[[` mention + recent 10

- Source: BREAKDOWN PR 19 (lines 140–146) · PLAN §1b (line 24), §2 (line 62: the old link dialog has no arrows; `[[` on Suggestion fixes it for free), §3E item 3 (line 139), §5 item 7 (line 183, phone paths), §8 PR 19 (line 283), §8 line 299 (16–20 all touch `PageEditor.svelte` / `extensions.svelte.ts`: merge one at a time) · DESIGN §2.4 (lines 81–88; boards D-P4 / M-P4, `wireframes/v4/index.html:242, 257`), §0 (lines 11, 15), §3 (lines 157–166) · decisions — (none)
- Needs: — (`findByTitle` gains `icon` here, D-V4-31; PLAN §8 line 283 lists "—") · Size: S–M · Branch: `v4/19-wiki-mention`

## What

Typing `[[` in a page opens the page picker at the caret: empty query = the 10 most recently opened pages, typing searches titles, ↑↓/Enter/Esc work, and the last row creates a page from the text and links it. The "Link to page" slash item opens the same picker, so the separate picker dialog with no arrow keys goes away. The inserted node is the existing `pageLink`, so `page_links`, backlinks and the graph pick it up unchanged.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Typing `[[` in a paragraph, heading, list or to-do opens the picker at the caret; it does not open inside a code block (the same `allow` guard the `/` menu uses, `extensions.svelte.ts:137`). Esc closes it and leaves `[[` plus the typed text as plain text (the `/` cancel rule, `docs/v2/FEATURES.md` PG-SLASH line 116); deleting back below `[[` also closes it.
- C2 Empty query shows header `Recent` and up to 10 rows from `pages.recent(me, 10)` (`repo/pages.ts:41-45`; the default stays 5 for the phone All pages list), last opened first, each row = icon + title + the parent page's title in `--faint` (nothing at top level). `recent()` gains `icon` and the parent title, and the picker asks for 10 (BREAKDOWN line 141; DESIGN line 83).
- C3 Typing filters through the existing `findByTitle` / `GET /api/pages/find` (`repo/pages.ts:408-413`, `app/src/routes/api/pages/find/+server.ts`): header `Pages`, up to 10 rows, the matched part of the title bolded; the page being edited is not listed (`PageEditor.svelte:81`); an archived match keeps its `archived` marker (BREAKDOWN line 141; DESIGN line 84).
- C4 No match shows one line `No page called that` plus the create row (DESIGN line 85).
- C5 The last row is `+ Create page "<query>"`, hidden while the query is empty; choosing it creates a page titled with the trimmed query (300-character cap, `schema.ts:482`) and inserts a `pageLink` to it, so after the page's next save `page_links` holds the new (source block, target) row. The new page is a child of the page being edited (D-V4-31; BREAKDOWN line 144).
- C6 ↑ / ↓ move the highlight, Enter picks it, Esc closes: the same Suggestion renderer and key handling as the `/` menu (`extensions.svelte.ts:140-171`). The footer hint `↑↓ move · Enter link · Esc cancel` shows on desktop only (DESIGN lines 86, 88).
- C7 The inserted link is the existing `pageLink` node: the chip shows the target's icon + title (DESIGN line 87) and opens `/pages/<id>`; `PageDTO['links']` (`types.ts:166`) and its resolver (`repo/pages.ts:73-79`) gain an `icon`, so old and new links render alike, and a gone / trashed / not-mine target still renders "Unavailable page".
- C8 "Link to page" in the slash menu inserts `[[` at the caret and opens the same picker on its empty (Recent) query; the old separate dialog is gone (`picker` state and markup `PageEditor.svelte:39-43, 360-389`, `findPages` 76-85, `insertLink` 86-101) — no click path opens it any more (BREAKDOWN line 143; PLAN line 62).
- C9 Link targets: both queries are caller-scoped (`pages.recent` / `findByTitle` filter on the signed-in user's id, `repo/pages.ts:41-45, 408-413`), so the picker always offers **the signed-in user's** live pages — there is no owner parameter — and another user's page id never appears. On a page shared with me it lists my pages and the create row is hidden (D-V4-31). A target trashed after insertion renders "Unavailable page" (`repo/pages.ts:73-79`).
- C10 Phone: the picker opens above the on-screen keyboard as a sheet-like list, rows ≥ 48 dp, at most 5 rows visible, no footer hint; Back closes the picker before the page; tapping a row inserts and closes; no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN §0 lines 11, 15; §2.4 line 88; board M-P4). The surface is the fixed suggestion popover styled like the slash menu, not `BottomSheet.svelte` (D-V4-31).
- C11 Undo: inserting a link is a normal editor transaction — the page's own undo (Ctrl+Z / toolbar) removes it before or after the save, and no server journal entry is written for it (`PageEditor.svelte:200-213`). The create row's new page is removed by the toast Undo, which trashes it and removes the inserted link node (D-V4-31). On a page opened with `access === 'view'` neither path exists.
- C12 States (DESIGN §3): loading — the header shows and no rows until the response, no blocking spinner; empty — `No pages yet. Type a title to create one.` (D-V4-31); error — the existing error toast via `showError` (`lib/client/toast.svelte.ts:45-47`), no inline alert or `Retry` in the picker, and the rows stay as they were; offline — one line "You're offline", search does not fire (DESIGN line 164).
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-LINK and PG-SLASH rows, the tests line).

## Out of scope

- The backlinks panel (card 20) and the local graph (card 21).
- Templates in the picker (`is_template`, card 22) — card 22 decides whether they appear in a Recent list.
- Hover previews of a link target, renaming or creating sub-pages from a picker row other than the create row, drag-a-page-into-the-editor linking.
- "Move to page…" from a block menu (card 29) and `[[Title]]` in Markdown import/export (cards 27/28).
- Backlink snippets, link anchors/headings, or linking to a database record by value.

## Files likely touched

- `app/src/lib/editor/extensions.svelte.ts` (`Slash` 128–175; new `[[` Suggestion beside it; `PageLink` 12–47)
- `app/src/lib/editor/PageEditor.svelte` (`picker` 39–43, `ITEMS` 44–60, `findPages` 76–85, `insertLink` 86–101, extensions array 171–181, picker markup 360–389)
- `app/src/lib/editor/SlashMenu.svelte` (shared renderer 18–42, 48 dp rows 89–97) — or a new `app/src/lib/editor/LinkMenu.svelte` (D-V4-31 rules out `BottomSheet.svelte` here)
- `app/src/lib/server/repo/pages.ts` (`recent` 41–45, `findByTitle` 408–413, `get` links 73–79, `create` 209–223)
- `app/src/routes/api/pages/find/+server.ts` (existing, unchanged unless the recent branch lands here)
- `app/src/routes/api/pages/+server.ts` (today returns the tree only; the `recent` route is `GET /api/pages/recent?n=10`, D-V4-31)
- `app/src/routes/pages/+layout.server.ts` (`recent(id)` call, read-only)
- `app/src/lib/types.ts` (`PageDTO` 157–170: `links` gains the icon)
- `app/tests/unit/pages.test.ts`, `app/tests/unit/v4-19-mention.test.ts` (new)
- `app/tests/e2e/v4/19-mention.spec.ts` (new), `app/tests/e2e/phone/v4-19-mention.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only: `signIn`, `expectTargets48`, `noDesktopHints`)

## Tests

- Builder: unit — `recent(me, 10)` returns icon + parent title, order and exclusions (trashed, archived, record pages), `findByTitle` icon, a `[[`-inserted `pageLink` lands in `page_links` after `pages.update`, create-title cap — in `app/tests/unit/v4-19-mention.test.ts`; desktop e2e `[[` → ↓↓ Enter → chip inserted → reload still there, type-to-search, create row — `app/tests/e2e/v4/19-mention.spec.ts`; phone sheet list, 48 dp rows, Back closes the picker — `app/tests/e2e/phone/v4-19-mention.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-19-blind.test.ts`, `app/tests/e2e/v4/19-blind.spec.ts`, `app/tests/e2e/phone/v4-19-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages).

## Decided

- Decided: D-V4-31 — create is a child of the page being edited; the toast Undo trashes the new page and removes the inserted link node (D-V4-23 precedent, no journal); empty Recent = "No pages yet. Type a title to create one."; a failed search uses the existing error toast; on a shared page offer only the owner's pages and hide the create row; new `GET /api/pages/recent?n=10`; reuse the fixed suggestion popover positioned like `SlashMenu` (not `BottomSheet`, which freezes the editor); no `Needs: 16` — `findByTitle` gains `icon` here.
