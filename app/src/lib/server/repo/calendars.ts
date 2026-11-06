import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { calendars } from '../schema';

export type CalendarRow = typeof calendars.$inferSelect;

export function defaultFor(userId: string): CalendarRow {
	const c = db()
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, userId), eq(calendars.isDefault, true)))
		.get();
	if (!c) throw new Error('user has no default calendar');
	return c;
}

export function byId(id: string): CalendarRow | undefined {
	return db().select().from(calendars).where(eq(calendars.id, id)).get();
}
