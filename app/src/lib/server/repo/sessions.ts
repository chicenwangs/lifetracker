import { and, desc, eq, lt, ne, or } from 'drizzle-orm';
import { db } from '../db';
import { sessions, users } from '../schema';
import { nowUtcIso } from '$lib/time';

export type SessionRow = typeof sessions.$inferSelect;

export function insert(row: SessionRow): void {
	db().insert(sessions).values(row).run();
}

/** session + user, only if user can log in (hash not null) */
export function getWithUser(sid: string) {
	return db()
		.select({ s: sessions, u: users })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, sid))
		.get();
}

export function touch(sid: string, expiresAt: string, lastSeenAt: string): void {
	db().update(sessions).set({ expiresAt, lastSeenAt }).where(eq(sessions.id, sid)).run();
}

export function remove(sid: string): void {
	db().delete(sessions).where(eq(sessions.id, sid)).run();
}

export function removeOwn(userId: string, sid: string): boolean {
	return (
		db()
			.delete(sessions)
			.where(and(eq(sessions.id, sid), eq(sessions.userId, userId)))
			.run().changes > 0
	);
}

export function removeAllFor(userId: string): void {
	db().delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function removeAllExcept(userId: string, keepSid: string): number {
	return db()
		.delete(sessions)
		.where(and(eq(sessions.userId, userId), ne(sessions.id, keepSid)))
		.run().changes;
}

export function listFor(userId: string): SessionRow[] {
	return db()
		.select()
		.from(sessions)
		.where(eq(sessions.userId, userId))
		.orderBy(desc(sessions.lastSeenAt))
		.all();
}

export function purgeExpired(now: number = Date.now()): void {
	const n = nowUtcIso(now);
	db()
		.delete(sessions)
		.where(or(lt(sessions.expiresAt, n), lt(sessions.absoluteExpiresAt, n)))
		.run();
}
