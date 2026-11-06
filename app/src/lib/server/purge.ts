import { and, isNotNull, lt } from 'drizzle-orm';
import { db } from './db';
import { blocks, items, places } from './schema';
import * as sessionsRepo from './repo/sessions';
import * as rl from './ratelimit';
import { nowUtcIso } from '$lib/time';

/** hard delete soft-deleted rows older than 30 days */
export function purgeTrash(now: number = Date.now()): void {
	const cut = nowUtcIso(now - 30 * 86_400_000);
	for (const t of [blocks, items, places]) {
		db()
			.delete(t)
			.where(and(isNotNull(t.deletedAt), lt(t.deletedAt, cut)))
			.run();
	}
}

export function purgeAll(now: number = Date.now()): void {
	sessionsRepo.purgeExpired(now);
	rl.purgeOld(now);
	purgeTrash(now);
	// P2: sharekeys.purgeExpired()
}
