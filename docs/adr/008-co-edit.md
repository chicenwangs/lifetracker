# ADR-008 — Co-edit

Status: **Accepted (P7, 2026-11-14)** · closes D-05 ("Yjs spike decides").

## Decision
No live co-edit in v2.0. Shared pages + notes save with the existing revision check.
Two people on the same page: the second save gets 409 "changed somewhere else", their text stays in the editor, they copy + reload. Never a silent overwrite (FEATURES §8).
Yjs + Tiptap collab → v2.1 (cut line in PHASES allows it).

## Why
- Yjs needs a WebSocket server, a doc store, compaction, and auth on every update + kick on revoke. That's a second sync path next to `page_blocks`, and ADR-003 just settled on replace-all saves.
- Real use = 2 people (owner + partner). Same page at the same second is rare. A clear 409 is enough for v2.0.
- WebSocket through Cloudflare Tunnel was never spiked (idle timeout unknown).

## v2.1 shape (if picked up)
`y-prosemirror` + Tiptap Collaboration, Yjs doc per page persisted as an update log in SQLite, compacted to `page_blocks` on idle (search + links + graph keep reading blocks). Server checks `shares.need(page, edit)` on connect and on every update; revoke closes the socket.
