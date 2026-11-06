// PSEUDO (FR-SR1, P2)
// upsertFts(kind, refId, ownerId, text) / deleteFts(kind, refId)  (called from repo helpers, not triggers)
// rebuildFts(ownerId): delete owner rows ; insert items(title+notes) places(name+notes) list_items facts ideas
// search(me, q): sanitize q -> fts5 tokens with '*' ; WHERE owner_id=me ; group by kind ; top 10 each
