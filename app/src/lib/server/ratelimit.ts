// rate_limits(key, count, window_start, locked_until). 15-min window (TECHNICAL §5).
import { eq, lt } from 'drizzle-orm';
import { db } from './db';
import { rateLimits } from './schema';
import { isoPlus, nowUtcIso } from '$lib/time';

export const WINDOW_MS = 15 * 60_000;

export interface LimitState {
	locked: boolean;
	minutesLeft: number;
	count: number;
}

function current(key: string, now: number) {
	const row = db().select().from(rateLimits).where(eq(rateLimits.key, key)).get();
	if (!row) return null;
	const fresh = now - Date.parse(row.windowStart) < WINDOW_MS;
	const lockedMs = row.lockedUntil ? Date.parse(row.lockedUntil) - now : 0;
	return { row, fresh, lockedMs };
}

export function check(key: string, now: number = Date.now()): LimitState {
	const c = current(key, now);
	if (!c) return { locked: false, minutesLeft: 0, count: 0 };
	if (c.lockedMs > 0)
		return { locked: true, minutesLeft: Math.ceil(c.lockedMs / 60_000), count: c.row.count };
	return { locked: false, minutesLeft: 0, count: c.fresh ? c.row.count : 0 };
}

/** Count one failure. Locks for lockMin when count reaches max (max=0 = never lock). */
export function fail(key: string, max: number, lockMin = 15, now: number = Date.now()): LimitState {
	const c = current(key, now);
	const nowIso = nowUtcIso(now);
	const reset = !c || !c.fresh || (c.row.lockedUntil !== null && c.lockedMs <= 0);
	const count = reset ? 1 : c.row.count + 1;
	const lockedUntil = max > 0 && count >= max ? isoPlus(nowIso, lockMin * 60_000) : null;
	db()
		.insert(rateLimits)
		.values({ key, count, windowStart: reset ? nowIso : c.row.windowStart, lockedUntil })
		.onConflictDoUpdate({
			target: rateLimits.key,
			set: { count, windowStart: reset ? nowIso : c.row.windowStart, lockedUntil },
		})
		.run();
	return { locked: lockedUntil !== null, minutesLeft: lockedUntil ? lockMin : 0, count };
}

export function clear(key: string): void {
	db().delete(rateLimits).where(eq(rateLimits.key, key)).run();
}

export function clearPrefix(prefix: string): void {
	const rows = db().select({ key: rateLimits.key }).from(rateLimits).all();
	for (const r of rows) if (r.key.startsWith(prefix)) clear(r.key);
}

/** drop rows older than 1 day and not locked */
export function purgeOld(now: number = Date.now()): void {
	db()
		.delete(rateLimits)
		.where(lt(rateLimits.windowStart, nowUtcIso(now - 86_400_000)))
		.run();
}
