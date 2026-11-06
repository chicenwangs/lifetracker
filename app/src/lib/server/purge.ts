// PSEUDO
// purgeTrash(): hard delete items/blocks/places WHERE deleted_at < now-30d (+ fts rows)
// purgeExpiredSessions(): delete sessions WHERE expires_at<now OR absolute_expires_at<now
// purgeExpiredKeys() -> sharekeys.purgeExpired(); old rate_limits rows (window > 1 d) deleted
