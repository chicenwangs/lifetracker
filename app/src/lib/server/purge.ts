import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { db } from './db';
import { blocks, items, places } from './schema';
import * as sessionsRepo from './repo/sessions';
import * as rl from './ratelimit';
import * as undo from './undo';
import * as attachments from './attachments';
import * as keep from './repo/keep';
import { nowUtcIso } from '$lib/time';

/** hard delete soft-deleted rows older than 30 days */
export function purgeTrash(now: number = Date.now()): void {
	const cut = nowUtcIso(now - 30 * 86_400_000);
	// a surviving block keeps a copy of its item's title; once the FK unlinks it, a secret title would be shareable
	db()
		.update(blocks)
		.set({ label: 'Block' })
		.where(
			inArray(
				blocks.itemId,
				db()
					.select({ id: items.id })
					.from(items)
					.where(and(eq(items.private, true), isNotNull(items.deletedAt), lt(items.deletedAt, cut))),
			),
		)
		.run();
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
	undo.purgeExpired(now);
	keep.purgeTrash(now);
	attachments.gc(now);
	// P2: sharekeys.purgeExpired()
}
