-- FTS5 search index (TECHNICAL §4). Synced by repo helpers, not triggers. Owner-only.
CREATE VIRTUAL TABLE `search_fts` USING fts5(kind UNINDEXED, ref_id UNINDEXED, owner_id UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');
