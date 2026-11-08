// Grants = "X can see my calendar" (FR-S8, S9). Rev 2026-11-08: view-only.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { calendars, grants, users } from '../schema';
import * as calendarsRepo from './calendars';
import type { ShareKind } from '$lib/types';
import { nowUtcIso } from '$lib/time';

export type GrantRow = typeof grants.$inferSelect;
const live = isNull(grants.revokedAt);

/** people who can see MY calendar */
export function given(meId: string) {
	const cal = calendarsRepo.defaultFor(meId);
	return db()
		.select({
			id: grants.id,
			name: users.displayName,
			username: users.username,
			color: users.color,
			visibleTypes: grants.visibleTypes,
			hiddenAs: grants.hiddenAs,
			createdAt: grants.createdAt,
		})
		.from(grants)
		.innerJoin(users, eq(users.id, grants.granteeId))
		.where(and(eq(grants.calendarId, cal.id), live))
		.all();
}

/** calendars I can see */
export function received(meId: string) {
	return db()
		.select({
			id: grants.id,
			calendarId: grants.calendarId,
			ownerId: users.id,
			name: users.displayName,
			username: users.username,
			color: users.color,
			visibleTypes: grants.visibleTypes,
			hiddenAs: grants.hiddenAs,
			inOverlap: grants.inOverlap,
		})
		.from(grants)
		.innerJoin(calendars, eq(calendars.id, grants.calendarId))
		.innerJoin(users, eq(users.id, calendars.ownerId))
		.where(and(eq(grants.granteeId, meId), live))
		.all()
		.map((g) => ({ ...g, visibleTypes: g.visibleTypes as ShareKind[] }));
}
export type Received = ReturnType<typeof received>[number];

/** owner removes someone (FR-S8) */
export function removeGiven(meId: string, id: string): boolean {
	const cal = calendarsRepo.defaultFor(meId);
	return (
		db()
			.update(grants)
			.set({ revokedAt: nowUtcIso() })
			.where(and(eq(grants.id, id), eq(grants.calendarId, cal.id), live))
			.run().changes > 0
	);
}

/** grantee leaves (FR-S9) */
export function leave(meId: string, id: string): boolean {
	return (
		db()
			.update(grants)
			.set({ revokedAt: nowUtcIso() })
			.where(and(eq(grants.id, id), eq(grants.granteeId, meId), live))
			.run().changes > 0
	);
}

export function setInOverlap(meId: string, id: string, on: boolean): boolean {
	return (
		db()
			.update(grants)
			.set({ inOverlap: on })
			.where(and(eq(grants.id, id), eq(grants.granteeId, meId), live))
			.run().changes > 0
	);
}
