# Card 17 · feat: duplicate page

- Source: BREAKDOWN PR 17 (lines 127–131) · PLAN §1b (line 23), §3E item 2 (line 138), §5 item 5 (line 181), §7 (none), §8 PR 17 (line 281), §8 line 299 (merge order with 16/18) · DESIGN §2.6 (lines 96–103, boards D-P5 / M-P5), §3 (line 165, read-only actions include Duplicate), §0 line 13 (toast) · decisions O-3
- Needs: — · Size: S · Branch: `v4/17-duplicate-page`

## What

Page ⋯ → `Duplicate` makes "Copy of <title>" directly below the original, under the same parent: same icon and same blocks with new block ids, internal links rebuilt for the copy, and a database block copied as **schema only** (properties + views, no records). Child pages and shares are not copied; the copy is mine even when the original is a page shared with me.

Owner decisions that apply: **O-3** (duplicate copies the database schema only, not records — DESIGN §4.1 default, kept).

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `POST /api/pages/:id/duplicate` creates and returns one page whose title is `Copy of <source title>` (source untitled → `Copy of Untitled`), truncated so the existing `length(title) <= 300` CHECK (`schema.ts:482`) and `patchSchema` limit still hold; `parentId` equals the source's parent and `position` places it directly below the source among its siblings (`pages.move(owner, id, parentId, before = next sibling)`, `repo/pages.ts:277-302`). **D-V4-55:** when the source is a page shared with me, the copy goes to my own root (`parentId = null`, last position), because its real parent is not in my tree.
- C2 Blocks: the copy's `page_blocks` hold the same top-level node types/JSON in the same order, each with a new `page_blocks.id`; opening the copy in the editor shows the same paragraphs, headings, lists, to-dos, tables, images and links. The source page is unchanged (same revision, same updatedAt).
- C3 Links: `page_links` rows exist for the copy as the source, one per unique (block, target) pair (BREAKDOWN line 128 "page_links rebuilt for the copy"); a `pageLink` inside the source that points at the source itself stays a link to the **source**, never to the copy.
- C4 Database block (O-3): the copy gets its own `page_databases` row on the new page with the same property names/types/positions and the same view names/types; it holds **zero** records; the `database` node in the copy's doc points at the new database id; the source database and its records are untouched (count and values identical before/after). View configs are remapped to the copy's property ids (D-V4-23).
- C5 Child pages are not copied (the copy has no children, `tree()` shows none under it); `page_shares` has no row for the copy even when the source is shared; pins and `last_opened_at` behave as a new page (no pin, opened now).
- C6 Shared page: on a page shared with me (view or edit) the `Duplicate` action is offered (DESIGN §3 line 165); the copy is created for the signed-in user (its `owner_id` is me, never the source owner) and appears in my sidebar; a page id I cannot see is 404.
- C7 Desktop: Page ⋯ menu gets `Duplicate` in the second group after `Move to…` (DESIGN §2.6 line 99); choosing it shows the toast "Duplicated · Undo" (DESIGN §0 line 13) and the sidebar tree shows the copy immediately below the original. The original stays open.
- C8 Undo: toast Undo trashes the copy via `DELETE /api/pages/:id` so it can be restored from Trash (BREAKDOWN line 130 "Undo = trash the copy"); no journal row is written (D-V4-23), so Ctrl+Z never touches a duplicate; Undo can never delete or alter the source.
- C9 Permission edge: duplicating twice makes two independent copies; a failed duplicate (bad parent, server error) creates nothing and shows the existing `showError`; no `page_databases`/properties/views are left behind by a failed run (all in one transaction).
- C10 Phone: `Duplicate` is a row in the page actions surface reachable by tap, its row is ≥ 48 dp, the copy opens from the phone Pages tree, Back works as before and no "Click"/"Ctrl" copy appears; `expectTargets48` passes on the open page menu (DESIGN §0 lines 11, 15; board M-P5 shows `⧉ Duplicate`).
- C11 States (DESIGN §3): loading = the Duplicate row is disabled while the request runs (a double tap makes one copy); empty = duplicating an empty page opens an empty copy with the editor prompt; error = `showError` and nothing created; offline = the usual error toast, nothing queued.
- C12 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-CREATE/PG-MOVE area + the tests line).

## Out of scope

- Child pages and their blocks, attachments other than the ones the duplicator owns (D-V4-23: only images the duplicator owns are copied), page shares, pins, comments.
- Templates (`is_template` is card 22) and "New from template" (card 22 reuses this logic).
- Record pages of a database (`database_records.page_id`) and archived/trashed originals: `Duplicate` is hidden there (D-V4-23).
- Moving or renaming the copy beyond what the button does, multi-page duplicate, or a duplicate inside Trash.

## Files likely touched

- `app/src/routes/api/pages/[id]/duplicate/+server.ts` (new)
- `app/src/lib/server/repo/pages.ts` (`create` 209–223, `update` 225–275 incl. link + attachment-ref rebuild, `move` 277–302, `get` 58–95)
- `app/src/lib/server/repo/databases.ts` (`create` 57–76, `addProp`/`addView` 130–149, 306–325)
- `app/src/lib/server/schema.ts` (`page_databases`/`database_properties`/`database_views` 550–647, read-only)
- `app/src/lib/server/attachments.ts` (`syncRefs` 154–185, read-only)
- `app/src/lib/server/undo.ts` (`undoable` 38–56, `TABLES` line 12 — read-only: D-V4-23 keeps no journal row)
- `app/src/routes/pages/[id]/+page.svelte` (page menu 204–236, toast)
- `app/src/lib/types.ts` (`PageDTO` 157–170, read-only)
- `app/tests/unit/pages.test.ts`, `app/tests/unit/v4-17-duplicate.test.ts` (new)
- `app/tests/e2e/v4/17-duplicate.spec.ts` (new), `app/tests/e2e/phone/v4-17-duplicate.spec.ts` (new)

## Tests

- Builder: unit — new block ids, links rebuilt, database schema copied with 0 records, self-link stays on the source, title truncation at 300, a shared page copied to me, the source row unchanged, two duplicates are independent — in `app/tests/unit/v4-17-duplicate.test.ts`; desktop e2e duplicate → copy below the original → open it → undo in `app/tests/e2e/v4/17-duplicate.spec.ts`; phone menu row + copy opens in `app/tests/e2e/phone/v4-17-duplicate.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-17-blind.test.ts`, `app/tests/e2e/v4/17-blind.spec.ts`, `app/tests/e2e/phone/v4-17-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6).

## Decided

- Decided: D-V4-23 — toast Undo trashes the copy via DELETE (BREAKDOWN line 130); no journal row (a journal undo would hard-delete the copy); a shared page copies only images the duplicator owns; view configs are remapped to the copy's property ids; Duplicate is hidden on database record pages and on archived/trashed pages.
