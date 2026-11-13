# ADR-003 — block storage

Status: **Accepted, 1 open point** (2026-11-13). Proof: S-1 JSON round-trip. Schema = DESIGN §5 `page_blocks`.

## Decision
- A page = metadata row + ordered rows in `page_blocks`. Never one HTML or JSON blob per page.
- **One row per top-level editor node.** `content_json` = that node's Tiptap JSON, as Tiptap gives it (ADR-002: round-trip is stable, so no own format).
- Children that Tiptap nests (list items, table cells, to-do items) stay **inside** the parent's JSON. `parent_block_id` is for containers we add later (toggle, columns).
- `block_type` = Tiptap node name. `schema_version` per type, `migrate(old → new)` in the block registry (DESIGN §6).
- Order = `position_key`. Move = one row update.
- Save = changed rows only + `expectedRevision` on the page. Mismatch = 409, client keeps its draft.
- Server validates every block with zod against the known node schema before storing. Unknown type or mark = reject.

## Why
- Search, graph links and "changed blocks only" autosave need addressable blocks.
- One long page edit rewrites a few rows, not the whole page.

## Open point (P3, first task)
**Stable block ids.** Rows need the same id across saves. Plan: a small extension that puts an `id` attr on every top-level node and fills it on create/split/paste (duplicates get a new id). Not spiked. If it can't be made reliable: fall back to "replace all blocks of the page in one txn" (simple, loses per-block history) and write a new ADR.

## Consequences
- Table = one block, whole table re-saved on any cell edit. Fine for the "simple table"; real data goes in Databases (ADR-004).
- `page_links` is a projection rebuilt from link marks on save. Never the source of truth.
