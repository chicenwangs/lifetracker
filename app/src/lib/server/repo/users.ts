import { asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { calendars, users } from '../schema';
import { newId } from '../crypto';
import { nowUtcIso } from '$lib/time';
import { USER_COLORS } from '$lib/colors';
import { seedFor } from './itemtypes';
import { resolveTheme } from '$lib/theme';

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
		theme: resolveTheme(u.themeMode, u.themeLightStart, u.themeDarkStart, u.timezone),
		themeMode: u.themeMode,
		themeLightStart: u.themeLightStart,
		themeDarkStart: u.themeDarkStart,
		planMode: u.planMode,
		tourState: u.tourState,
		region: u.region,
		qaTarget: u.qaTarget,
		blockMin: u.blockMin,
		visibleHours: u.visibleHours,
		hiddenTypes: u.hiddenTypes,
		hintsSeen: u.hintsSeen,
		defaultReminder: u.defaultReminder ?? null,
		notifyPlanner: u.notifyPlanner,
		notifyKeep: u.notifyKeep,
		notifyPages: u.notifyPages,
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
	seedFor(id);
	const u = byId(id);
	if (!u) throw new Error('user insert failed');
	return u;
}

export function setPasswordHash(id: string, hash: string): void {
	db().update(users).set({ passwordHash: hash }).where(eq(users.id, id)).run();
}

/** Calendar feed (card 07): only the token's SHA-256 is stored; null = no feed. */
export function setIcsTokenHash(id: string, hash: string | null): void {
	db().update(users).set({ icsTokenHash: hash }).where(eq(users.id, id)).run();
}
export function icsTokenHash(id: string): string | null {
	return db().select({ h: users.icsTokenHash }).from(users).where(eq(users.id, id)).get()?.h ?? null;
}
export function byIcsTokenHash(hash: string): UserRow | undefined {
	return db().select().from(users).where(eq(users.icsTokenHash, hash)).get();
}

/** disabled = no password hash: login fails and loadSession drops any session (auth.ts). Undo = scripts/reset-password.mjs */
export function disable(id: string): void {
	// belt and braces: a disabled account's calendar feed dies with the session, even if a row still holds one
	db().update(users).set({ passwordHash: null, icsTokenHash: null }).where(eq(users.id, id)).run();
}
export const disabledIds = (): string[] =>
	db()
		.select({ id: users.id })
		.from(users)
		.where(isNull(users.passwordHash))
		.all()
		.map((r) => r.id);

export type Prefs = Partial<
	Pick<
		UserRow,
		| 'overlapOn' | 'displayName' | 'color' | 'theme' | 'themeMode' | 'themeLightStart' | 'themeDarkStart'
		| 'planMode' | 'tourState' | 'timezone' | 'region' | 'qaTarget' | 'blockMin' | 'visibleHours' | 'hiddenTypes' | 'hintsSeen' | 'defaultReminder'
		| 'notifyPlanner' | 'notifyKeep' | 'notifyPages'
	>
>; // prettier-ignore
export function setPrefs(id: string, prefs: Prefs): void {
	db().update(users).set(prefs).where(eq(users.id, id)).run();
}
