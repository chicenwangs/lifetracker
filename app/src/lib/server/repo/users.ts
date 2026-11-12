import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { calendars, users } from '../schema';
import { newId } from '../crypto';
import { nowUtcIso } from '$lib/time';
import { USER_COLORS } from '$lib/colors';

export type UserRow = typeof users.$inferSelect;

export function safe(u: UserRow): App.SafeUser {
	return {
		id: u.id,
		username: u.username,
		displayName: u.displayName,
		role: u.role,
		color: u.color,
		timezone: u.timezone,
		overlapOn: u.overlapOn,
		theme: u.theme,
		planMode: u.planMode,
	};
}

export function byId(id: string): UserRow | undefined {
	return db().select().from(users).where(eq(users.id, id)).get();
}

/** NOCASE column -> case-insensitive */
export function byUsername(username: string): UserRow | undefined {
	return db().select().from(users).where(eq(users.username, username.trim())).get();
}

export function list(): App.SafeUser[] {
	return db().select().from(users).orderBy(asc(users.createdAt)).all().map(safe);
}

export function count(): number {
	return (
		db()
			.select({ c: sql<number>`count(*)` })
			.from(users)
			.get()?.c ?? 0
	);
}

/** user + default calendar. Call inside a transaction. */
export function createWithCalendar(input: {
	username: string;
	displayName: string;
	passwordHash: string;
	role: 'admin' | 'member';
	color?: string;
	id?: string;
}): UserRow {
	const id = input.id ?? newId('usr');
	const now = nowUtcIso();
	db()
		.insert(users)
		.values({
			id,
			username: input.username.trim().toLowerCase(),
			displayName: input.displayName.trim(),
			passwordHash: input.passwordHash,
			role: input.role,
			color: input.color ?? USER_COLORS[0],
			createdAt: now,
		})
		.run();
	db()
		.insert(calendars)
		.values({ id: newId('cal'), ownerId: id, name: 'My calendar', isDefault: true, createdAt: now })
		.run();
	const u = byId(id);
	if (!u) throw new Error('user insert failed');
	return u;
}

export function setPasswordHash(id: string, hash: string): void {
	db().update(users).set({ passwordHash: hash }).where(eq(users.id, id)).run();
}

export function setPrefs(
	id: string,
	prefs: {
		overlapOn?: boolean;
		displayName?: string;
		color?: string;
		theme?: 'dark' | 'light';
		planMode?: 'night' | 'morning' | 'off' | null;
	},
): void {
	db().update(users).set(prefs).where(eq(users.id, id)).run();
}
