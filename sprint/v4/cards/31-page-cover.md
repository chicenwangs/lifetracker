# Card 31 · feat: page cover image

- Source: BREAKDOWN PR 31 (lines 212–216) · PLAN §1b (line 34), §3E item 9 (line 147: cosmetic, goes last), §5 item 10 (line 186), §8 PR 31 (line 295) · DESIGN §2.1 (lines 56–66: cover item 2 line 59, icon overlap line 60, hover row line 61, phone line 66; boards D-P1 `wireframes/v4/index.html:195`, M-P1 `:220`), §2.7 line 120 (gallery cover), §2.6 lines 103 (phone actions sheet), §3 (lines 157–166) · `docs/v2/DESIGN.md` line 68 (`pages.cover_attachment_id`) and line 88 (`attachment_refs.source_type` already lists `page_cover`) · `docs/SERVICE-HANDOFF.md` line 127 (backups already include `uploads/`) · decisions D-V4-22, D-V4-23
- Needs: 15 (`pages.cover_attachment_id` column) · Size: M · Branch: `v4/31-page-cover`

## What

A page can have a cover image: a full-width 180 px banner (120 px on phone) above the icon and title, set from an uploaded image. Desktop shows `Change cover` / `Remove` on hover, phone in the page actions sheet. The cover is an attachment referenced as `page_cover`, so the orphan purge keeps it and a shared viewer can load it.

Owner decisions that apply: **D-V4-22** — the icon button sits above the title (card 16) and the phone entries live in the page ⋯ sheet; a `pages` row change is journaled but Undo must not roll `revision` back. **D-V4-23** — a duplicate (and a page made from a template) copies only files the duplicator owns, which is why the cover copy rule is Decided.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Entry points: desktop `Add cover` sits beside card 16's icon button above the title (BREAKDOWN line 213; DESIGN line 61 is its empty-state form), and once a cover exists its hover controls are `Change cover` · `Remove` bottom-right (DESIGN line 59); phone adds `Add cover` / `Change cover` / `Remove` as rows in the page actions sheet (DESIGN lines 66, 103; D-V4-22), ≥ 24 px desktop / ≥ 48 dp phone. The entries are not rendered on a view-only share (C6).
- C2 Setting a cover uploads an image through the existing `POST /api/attachments` (limits from `GET /api/attachments`: `MAX_UPLOAD_BYTES`, `ALLOWED_EXT`), accepting every attachment kind whose `KINDS` entry has `inline: true` — png, jpg, jpeg, gif, webp (`attachments.ts:19-24`) — then saves the id with `PATCH /api/pages/:id { coverAttachmentId }`; upload only, no library picker (Decided). An over-limit, over-quota or wrong-type file is refused with the existing message, the old cover stays, and the banner area shows a placeholder while the upload runs (BREAKDOWN line 213; DESIGN line 59).
- C3 Display: when `coverAttachmentId` is set the page renders a 180 px full-width banner (120 px phone) above the icon and title, image `object-fit: cover`, and with a cover the icon (56 px desktop / 44 px phone) overlaps the banner's bottom edge by 28 px (DESIGN lines 59–60, 66); without a cover the icon stays where card 16 put it. The banner image is decorative (`alt=""`), and the cover controls carry the accessible name "Page cover" (Decided). Every colour is a token (`--ground` placeholder, `--card`, `--rule`) — no new colours (DESIGN §0 line 9).
- C4 `Change cover` replaces the image (same upload path, new id, old ref released) and `Remove` clears the column (`coverAttachmentId: null`), after which the banner is gone and the layout matches a page that never had one; the controls close/act in one step and focus returns to the cover area (DESIGN line 59).
- C5 References: the cover is stored in `attachment_refs` as `source_type = 'page_cover'`, `source_id = pageId` (the v2 schema already names this source, `docs/v2/DESIGN.md` line 88), so `attachments.gc()` never deletes a referenced file (`attachments.ts:188-211`); replacing or removing the cover releases the old ref, and `purgeTrash` drops the page's `page_cover` refs with it (`repo/pages.ts:382-392`). A plain page save (`pages.update`) rewrites only `page_block` refs and must not drop the `page_cover` ref.
- C6 Access: only the owner or an edit share can set/change/remove (`need('page', uid, id, 'edit')`, `shares.ts:40-46`); a view-only share sees the banner with no controls, and a page id I cannot see is 404/403 as today. A shared viewer can load the image because `attachments.readable()` resolves a `page_cover` ref through page access — `SOURCE_KIND` (`attachments.ts:148-152`) gains `page_cover → 'page'` (otherwise a viewer sees a broken banner). Only a ready image owned by the actor, or already referenced by this page, can be set (same rule as page images, `repo/pages.ts:259-266`).
- C7 Data: `PageDTO.coverAttachmentId` (string or null) comes from `pages.get`, and a reload renders the same banner; the sidebar tree, pins and graph do not need it. `pages.patchSchema` gains `coverAttachmentId` as `string | null` (a `ATT` id), and the response is the updated page as today.
- C8 Gallery: a database record whose page has a cover shows that image as its gallery card cover (card 25's first choice), so the two cards agree on the fallback order (DESIGN line 120; card 25 C3).
- C9 Undo: setting, changing or removing a cover shows an Undo that restores the previous `coverAttachmentId` **and** its `page_cover` ref, and the page's `revision` is not rolled back, so the open editor's next save is not a 409 (D-V4-22 special case; CLAUDE.md "every mutation gets an undo entry"; DESIGN §0 line 13).
- C10 States (DESIGN §3): loading — the banner area shows the previous cover or the `--ground` placeholder while the upload runs, no spinner over 300 ms; empty — no cover → only the `Add cover` entry; error — a failed upload or PATCH keeps the old cover and shows the server message (`showError`, or the upload toast for size/type), never a broken image; offline — the entries are disabled with the "You're offline" helper (line 164); read-only — banner only (C6).
- C11 Phone: the rows are in the page actions sheet at ≥ 48 dp, the image picker is the platform's, tapping the banner opens the sheet with `Change cover` · `Remove`, Back closes the sheet before the page, and no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN §0 lines 11, 15).
- C12 Both themes: the banner sits on `--card`, its placeholder on `--ground`, and the layout is checked in light and dark (DESIGN §0 line 9; line 166).
- C13 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-CREATE/PG-BLOCKS area), `docs/SERVICE-HANDOFF.md` needs no change — its backup section already includes `data/uploads/` (verified, line 127).

## Out of scope

- "Pick an existing attachment" from a library (Decided), image cropping, focal-point positioning, or a cover colour/gradient instead of an image.
- Covers inside the sidebar, the graph, backlinks, the link picker or Keep notes.
- A cover on a database record shown in the table view (only the gallery card uses it, C8).
- Copying a cover to a duplicate or template copy (Decided), and a per-page cover alt-text field (Decided).
- Any new upload route, image resizing server-side, or a new dependency.

## Files likely touched

- `app/src/routes/pages/[id]/+page.svelte` (header/title area 240–254, page menu 204–238, phone actions surface, styles 298–468)
- `app/src/routes/api/pages/[id]/+server.ts` (PATCH 14–22, read-only: the schema comes from the repo)
- `app/src/lib/server/repo/pages.ts` (`patchSchema` 182–191, `update` set clauses 268–272, `get` 58–95, `Row` 20, `purgeTrash` 382–392, `syncRefs` call 259–266)
- `app/src/lib/server/attachments.ts` (`readable` 140–146, `SOURCE_KIND`/`viaSource` 148–152, `syncRefs`/`addRef`/`dropRefs` 154–185, `gc` 188–211)
- `app/src/lib/server/schema.ts` (`pages` 454–484, `attachmentRefs` 306–324 — read-only: card 15 adds the column, the ref table is generic)
- `app/src/lib/types.ts` (`PageDTO` 157–170)
- `app/src/routes/pages/[id]/+page.server.ts` (read-only: `pages.get` already returns the page)
- `app/src/lib/components/IconPicker.svelte` / the icon button from card 16 (read-only: `Add cover` sits beside it)
- `app/tests/unit/v4-31-page-cover.test.ts` (new), `app/tests/unit/attachments.test.ts`, `app/tests/unit/pages.test.ts`
- `app/tests/e2e/v4/31-page-cover.spec.ts` (new), `app/tests/e2e/phone/v4-31-page-cover.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — a cover ref keeps the file past `ORPHAN_GRACE_MS`, replacing/removing it releases the old ref, a doc save does not drop the `page_cover` ref, `purgeTrash` drops it, a view-only viewer can read the attachment through `viaSource`, and undo restores the id + ref without rolling `revision` back — in `app/tests/unit/v4-31-page-cover.test.ts`; desktop e2e `Add cover` → upload a small png → banner shows → reload → still there → `Remove` → gone → Undo → back — `app/tests/e2e/v4/31-page-cover.spec.ts`; phone sheet rows, 48 dp, banner at 120 px, Back — `app/tests/e2e/phone/v4-31-page-cover.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-31-blind.test.ts`, `app/tests/e2e/v4/31-blind.spec.ts`, `app/tests/e2e/phone/v4-31-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages).

## Decided

- Decided: D-V4-47 — upload only; a duplicate/template copy keeps the cover only when the duplicator owns the file; decorative banner (`alt=""`) with the accessible name "Page cover" on the controls.
