# Card 29 · feat: block drag handles + multi-select

- Source: BREAKDOWN PR 29 (lines 200–204) · PLAN §1b (line 36, the v2.1 backlog item), §3E (line 223: phase 12 "Editor depth (backlog)"), §5 item 7 (line 183), §8 PR 29 (line 293), §8 line 299 (16–20 all touch `PageEditor.svelte` / `extensions.svelte.ts`: merge one at a time) · DESIGN §2.8 (lines 122–128; boards D-P6 `wireframes/v4/index.html:400`, M-P6 `:416`), §2.1 item 6 (line 63: the gutter `+` and `⋮⋮`), §0 (lines 9–15), §3 (lines 157–166) · `docs/v2/FEATURES.md` PG-MOVE line 117 ("Drag handle on hover/focus, drop line, bad drop = no change, touch uses menu. Multi-select EXT.") · decisions D-V4-24
- Needs: 18 (`Callout`/`Toggle` for `Turn into ▸` and `Colour ▸`) · Size: L · Branch: `v4/29-block-handles`

## What

Every top-level block gets a handle in the left gutter on hover: drag it to move the block, or click it for Delete / Duplicate / Turn into / Colour (callouts). Shift+click selects a range, Alt+↑/↓ moves the focused block, and a floating bar acts on several blocks at once. On phone, long press selects a block and a bottom action bar replaces the mouse paths. `Move to page…` is deferred (Decided). The page editor's existing `blockOps` (`extensions.svelte.ts:85-108`) already moves, duplicates and deletes one block — this card reuses it and adds the selection.

Owner decisions that apply: **D-V4-24** — `Colour ▸` lives in today's block actions until this card, so this card moves it into the `⋮⋮` menu; a toggle still starts closed and a callout keeps the default Yellow + 💡.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Desktop: hovering a top-level block shows its gutter handle `⋮⋮` (24 × 24 px, `--faint`, `--ink` on hover/focus); the handle is a real focusable button with a name (`Move or edit <block first words>`), and it never appears on phone or inside a table cell (DESIGN §2.8 line 123, §2.1 line 63). Whether the `+` insert-below handle of DESIGN line 63 also ships is Decided.
- C2 Clicking `⋮⋮` opens a menu with exactly `Delete` · `Duplicate` · `Turn into ▸` (Text, H1, H2, H3, Bullet list, Numbered list, To-do list, Quote, Callout, Toggle) · `Colour ▸` (only on a callout: Grey / Blue / Yellow / Red); `Move to page…` is deferred, so the menu has no such row (Decided). Esc closes it and focus returns to the handle; arrow keys and Enter work (DESIGN lines 125, 128; D-V4-24; board D-P6).
- C3 Dragging `⋮⋮` moves the block: a 2 px `--accent` drop line shows between blocks while dragging, dropping inserts the block at that spot, Esc cancels with no change, and the new order survives the page save and a reload (ADR-003 replaces all blocks on save; DESIGN line 124; PG-MOVE line 117 "bad drop = no change").
- C4 Keyboard: Alt+↑ / Alt+↓ moves the focused block one position with the existing `blockOps.move` (`extensions.svelte.ts:99-107`, bound in `BlockKeys` 111–119), no-op at the first and last block, and the move does not merge into the previous typing undo group (`closeHistory`, line 76). With several blocks selected it moves the whole selection as one group (Decided).
- C5 Shift+click on a block extends the selection from the anchor to that block; when there is no selection yet, the first Shift+click anchors on the block holding the caret and selects that block together with the clicked block (Decided). Every selected block gets the `--pill-card` background; a floating bar at the bottom of the editor reads `N blocks` with `Delete` · `Duplicate`; Esc or a click outside clears the selection (DESIGN line 127 minus the deferred `Move to page…`, Decided; board D-P6). Shift+↑/↓ extends the selection only when a block selection already exists (Decided).
- C6 Acting on a selection: `Delete` removes every selected block in one operation (never leaving an empty document — the last block becomes an empty paragraph as `blockOps.remove` already does), and `Duplicate` copies every selected block in document order immediately after the selection; after a save the page reloads with the change and the selection is cleared (DESIGN line 127).
- C7 `Turn into ▸` converts the target block in place to the chosen type (paragraph ↔ heading ↔ list ↔ quote ↔ callout ↔ toggle) using Tiptap's node conversion, keeps its text, and on a callout `Colour ▸` writes card 18's tone values only (exactly Grey / Blue / Yellow / Red) and the tone survives a reload (BREAKDOWN line 201; DESIGN line 125; D-V4-24).
- C8 The handles and the `⋮⋮` menu act on top-level blocks only: a paragraph inside a list item, a callout or a toggle body is edited with the text tools as today; a `database` block is atomic (its inner table is not a block target) and can still be moved, duplicated and deleted like any block (DESIGN §2.1 line 63; PG-BLOCKS line 115).
- C9 Phone: long pressing a block selects it (`buzz('pickup')`, phone rule "long press = select"), tapping further blocks adds or removes them, and a bottom action bar of ≥ 48 dp shows `Delete` · `Duplicate` · `Done`; no drag on phone (Decided), Back clears the selection before it closes the page; no "Ctrl"/"Click"/Esc text is visible or read out (DESIGN lines 128, §0 lines 11–12, 15; board M-P6; `expectTargets48`, `noDesktopHints`).
- C10 Undo: every operation is reversible from the page editor's own history (Ctrl+Z and the page's undo), a multi-block delete comes back in one step, and the failure mode is "nothing changed" rather than a half move; no toast and no journal entry is added (Decided; AGENTS.md "Page editor keeps its own history"; card 18 C14 precedent; DESIGN §0 line 13).
- C11 States (DESIGN §3): loading — blocks render before the handles mount, so no handle flash on a read-only page; empty — an empty page shows the editor prompt and no handles; error — a failed save keeps the moved order on screen and shows the existing `Save failed · Retry` (`pages/[id]/+page.svelte:171-180`), and the block is never lost; offline — operations apply in the editor and the existing save retries, nothing is queued (the offline queue covers Keep and quick add only, line 164); read-only share — no handle, no menu, no selection, and the keyboard shortcuts do nothing.
- C12 Both themes from tokens (`--accent`, `--pill-card`, `--faint`, `--ink`), the drop line and the selection are visible in light and dark, and each handle/menu row is ≥ 24 px desktop / ≥ 48 dp phone (DESIGN §0 lines 9–11; line 166).
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-MOVE row — multi-select moves off "EXT"), `docs/v2/UX-AUDIT.md` only if it names the old toolbar-only block actions.

## Out of scope

- The `+` gutter insert handle (Decided), block colours beyond callout tones, or drag between pages.
- Drag on phone (no drag, Decided); swipe gestures on blocks.
- Nested-block selection (inside a list, callout or toggle), selecting across pages, or a block clipboard.
- Storing stable block ids (ADR-003 keeps replace-all saves; card 30's reminder identity is its own problem).
- Changing the `/` menu or the slash-implemented "Turn into" path.

## Files likely touched

- `app/src/lib/editor/extensions.svelte.ts` (`blockOps` 85–108, `BlockKeys` 111–119, a new multi-select/gutter plugin)
- `app/src/lib/editor/PageEditor.svelte` (toolbar block buttons 305–333, phone `ActionSheet` 347–359, styles 391–679, editor mount 167–220)
- `app/src/lib/editor/SlashMenu.svelte` (read-only: menu look the gutter menu follows)
- `app/src/lib/components/ActionSheet.svelte` (read-only: phone action bar/menu)
- `app/src/lib/client/haptics.ts` (`buzz` 15–20, read-only)
- `app/src/lib/client/layers.ts` (`backCloses` 76–113, read-only for the phone selection)
- `app/src/routes/pages/[id]/+page.svelte` (save state 171–180, read-only)
- `app/src/lib/server/repo/pages.ts` (`check`/`NODES` 98–168, read-only: no server change)
- `app/tests/unit/v4-29-block-handles.test.ts` (new), `app/tests/unit/pages.test.ts`
- `app/tests/e2e/v4/29-block-handles.spec.ts` (new), `app/tests/e2e/phone/v4-29-block-handles.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only: `longPress`, `expectTargets48`, `noDesktopHints`)

## Tests

- Builder: unit — the selection range (anchor → target) over `doc.content`, multi-delete leaves one empty paragraph when all blocks go, multi-duplicate order, `Turn into` paragraph/callout keeps text, callout tone values limited to the four — in `app/tests/unit/v4-29-block-handles.test.ts`; desktop e2e drag a block with the mouse, Alt+↑ move, put the caret in a block then Shift+click a later block → the whole range is selected → Delete → Ctrl+Z restores it, `Turn into` a callout and set a tone — `app/tests/e2e/v4/29-block-handles.spec.ts`; phone long press selects, tap adds, bottom bar 48 dp, Back clears — `app/tests/e2e/phone/v4-29-block-handles.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-29-blind.test.ts`, `app/tests/e2e/v4/29-blind.spec.ts`, `app/tests/e2e/phone/v4-29-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 PG-MOVE), `docs/v2/UX-AUDIT.md` only if it names the old toolbar-only block actions.

## Decided

- Decided: D-V4-45 — `⋮⋮` only (BREAKDOWN); defer "Move to page…" (menu without it); phone long press selects, no drag; Alt+↑↓ moves the whole selection as one group; editor history only, no toast; Shift+↑↓ extends only when a block selection already exists.
- Decided (clarification of D-V4-45) — with no block selection yet, the first Shift+click anchors on the block holding the caret and selects that block together with the clicked block; later Shift+clicks extend from that anchor.
