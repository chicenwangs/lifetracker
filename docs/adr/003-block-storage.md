# ADR-003 — block storage

Status: **Accepted** (2026-11-13). Open point closed in P3: **replace-all save** (below). Proof: S-1 JSON round-trip. Schema = DESIGN §5 `page_blocks`.

## Decision
- A page = metadata row + ordered rows in `page_blocks`. Never one HTML or JSON blob per page.
- **One row per top-level editor node.** `content_json` = that node's Tiptap JSON, as Tiptap gives it (ADR-002: round-trip is stable, so no own format).
- Children that Tiptap nests (list items, table cells, to-do items) stay **inside** the parent's JSON. `parent_block_id` is for containers we add later (toggle, columns).
- `block_type` = Tiptap node name. `schema_version` per type, `migrate(old → new)` in the block registry (DESIGN §6).
- Order = REAL `position` column (`page_blocks.position`, the node's index in the doc). Not a text `position_key`. Rewritten on every save.
- Save = replace all of the page's rows in one transaction + `expectedRevision` on the page (`repo/pages.ts` `update`). Mismatch = 409, client keeps its draft. One `PATCH /api/pages/:id` carries the whole doc.
- Server validates every block with zod against the known node schema before storing. Unknown type or mark = reject.

## Why
- Search and graph links need blocks as rows (`page_links` is projected from them).
- Original plan was changed-rows-only autosave; replaced by replace-all (see Open point below).

## Open point — CLOSED in P3 (2026-11-13): replace-all
Chosen: every save replaces all of the page's `page_blocks` rows in one transaction (+ `page_links` and the search row). No stable block ids needed. Cost: no per-block history (not planned anyway); a save rewrites the page's rows (fine up to the 1 MB page cap). Revisit only if co-edit (ADR-008) needs block identity.

### Original note
**Stable block ids.** Rows need the same id across saves. Plan: a small extension that puts an `id` attr on every top-level node and fills it on create/split/paste (duplicates get a new id). Not spiked. If it can't be made reliable: fall back to "replace all blocks of the page in one txn" (simple, loses per-block history) and write a new ADR.

## Consequences
- Table = one block, whole table re-saved on any cell edit. Fine for the "simple table"; real data goes in Databases (ADR-004).
- `page_links` is a projection rebuilt from link marks on save. Never the source of truth.
