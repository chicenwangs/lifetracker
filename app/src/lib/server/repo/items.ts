// Items. ALL scoping here: only rows in calendars owned by `me` (P2 adds grants via access.ts).
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, handle } from '../db';
import { blocks, calendars, items, users } from '../schema';
import { newId } from '../crypto';
import { notFound, bad } from '../http';
import { zDate, zStatus, zTime, zTitle, zType, zId } from '../validate';
import * as calendarsRepo from './calendars';
import { addDays, diffDays, nowUtcIso } from '$lib/time';
import { nextStatus, type ItemDTO, type Status } from '$lib/types';

export type ItemRow = typeof items.$inferSelect;

const live = isNull(items.deletedAt);

/** calendar ids `me` owns */
export function myCalendarIds(meId: string): string[] {
	return db()
		.select({ id: calendars.id })
		.from(calendars)
		.where(eq(calendars.ownerId, meId))
		.all()
		.map((r) => r.id);
}

export function toDTO(r: ItemRow, counts?: { done: number; total: number }): ItemDTO {
	return {
		id: r.id,
		title: r.title,
		type: r.type,
		status: r.status,
		date: r.date,
		time: r.time,
		endDate: r.endDate,
		parentId: r.parentId,
		private: r.private,
		stepsDone: counts?.done ?? 0,
		stepsTotal: counts?.total ?? 0,
		editable: true,
	};
}

/** rows per calendar (items, blocks): a runaway script or abuse can't grow the DB without end */
export const ROW_CAP = 50_000;
export function checkCap(table: typeof items | typeof blocks, calendarId: string): void {
	const n = db()
		.select({ n: sql<number>`count(*)` })
		.from(table)
		.where(eq(table.calendarId, calendarId))
		.get()?.n;
	if ((n ?? 0) >= ROW_CAP)
		bad(`limit reached (${ROW_CAP} per account). Empty the trash or contact the admin.`);
}

function stepCounts(ids: string[]): Map<string, { done: number; total: number }> {
	const m = new Map<string, { done: number; total: number }>();
	// chunks: SQLite caps bound variables (32766)
	for (let i = 0; i < ids.length; i += 500)
		for (const [k, v] of stepCountsChunk(ids.slice(i, i + 500))) m.set(k, v);
	return m;
}
function stepCountsChunk(ids: string[]): Map<string, { done: number; total: number }> {
	const m = new Map<string, { done: number; total: number }>();
	if (!ids.length) return m;
	const rows = db()
		.select({
			parent: items.parentId,
			total: sql<number>`count(*)`,
			done: sql<number>`sum(case when ${items.status} = 'done' then 1 else 0 end)`,
		})
		.from(items)
		.where(and(inArray(items.parentId, ids), live))
		.groupBy(items.parentId)
		.all();
	for (const r of rows) if (r.parent) m.set(r.parent, { done: r.done ?? 0, total: r.total });
	return m;
}

export function withCounts(rows: ItemRow[]): ItemDTO[] {
	const c = stepCounts(rows.map((r) => r.id));
	return rows.map((r) => toDTO(r, c.get(r.id)));
}

/** items overlapping [from, to) local dates. Steps (parent_id) excluded from calendar. */
export function inRange(calendarId: string, from: string, to: string): ItemRow[] {
	return db()
		.select()
		.from(items)
		.where(
			and(
				eq(items.calendarId, calendarId),
				live,
				isNotNull(items.date),
				lt(items.date, to),
				gte(sql`COALESCE(${items.endDate}, ${items.date})`, from),
			),
		)
		.orderBy(asc(items.date), sql`${items.time} IS NULL DESC`, asc(items.time), asc(items.createdAt))
		.all();
}

export function getOwn(meId: string, id: string): ItemRow | undefined {
	const cals = myCalendarIds(meId);
	if (!cals.length) return undefined;
	return db()
		.select()
		.from(items)
		.where(and(eq(items.id, id), inArray(items.calendarId, cals), live))
		.get();
}

export function mustOwn(meId: string, id: string): ItemRow {
	return getOwn(meId, id) ?? notFound();
}

function checkParent(meId: string, parentId: string | null | undefined, selfId?: string) {
	if (!parentId) return;
	if (parentId === selfId) bad('item cannot be its own parent');
	const p = getOwn(meId, parentId);
	if (!p) bad('parent not found', 'bad_parent');
	if (p?.parentId) bad('steps cannot have steps');
}

function checkDates(date: string | null, endDate: string | null) {
	if (endDate && !date) bad('end date needs a date');
	if (endDate && date && endDate < date) bad('end date before date');
}

// ---------- create ----------
export const itemCreateSchema = z
	.object({
		title: zTitle,
		type: zType.default(null),
		status: zStatus.default('todo'),
		date: zDate.nullable().default(null),
		time: zTime.nullable().default(null),
		endDate: zDate.nullable().default(null),
		parentId: zId('itm').nullable().default(null),
		notes: z.string().max(20_000).nullable().default(null),
		private: z.boolean().default(false),
	})
	.strict();
export type ItemCreate = z.infer<typeof itemCreateSchema>;

export function create(meId: string, input: ItemCreate): ItemRow {
	checkDates(input.date, input.endDate);
	if (input.time && !input.date) bad('time needs a date');
	checkParent(meId, input.parentId);
	const cal = calendarsRepo.defaultFor(meId);
	checkCap(items, cal.id);
	const now = nowUtcIso();
	const id = newId('itm');
	db()
		.insert(items)
		.values({
			id,
			calendarId: cal.id,
			title: input.title,
			type: input.type,
			status: input.status,
			date: input.date,
			time: input.time,
			endDate: input.endDate === input.date ? null : input.endDate,
			parentId: input.parentId,
			notes: input.notes,
			private: input.private,
			startedAt: input.status !== 'todo' ? now : null,
			completedAt: input.status === 'done' ? now : null,
			createdAt: now,
			updatedAt: now,
			createdBy: meId,
			updatedBy: meId,
		})
		.run();
	return mustOwn(meId, id);
}

// ---------- patch (owner) ----------
export const itemPatchSchema = z
	.object({
		title: zTitle,
		type: zType,
		status: zStatus,
		date: zDate.nullable(),
		time: zTime.nullable(),
		endDate: zDate.nullable(),
		parentId: zId('itm').nullable(),
		notes: z.string().max(20_000).nullable(),
		private: z.boolean(),
	})
	.partial()
	.strict();
export type ItemPatch = z.infer<typeof itemPatchSchema>;

function statusStamps(prev: ItemRow, s: Status, now: string) {
	if (s === prev.status) return {};
	if (s === 'todo') return { startedAt: null, completedAt: null };
	if (s === 'doing') return { startedAt: prev.startedAt ?? now, completedAt: null };
	return { startedAt: prev.startedAt ?? now, completedAt: now };
}

export function patch(meId: string, id: string, p: ItemPatch): ItemRow {
	const cur = mustOwn(meId, id);
	const date = p.date !== undefined ? p.date : cur.date;
	let endDate = p.endDate !== undefined ? p.endDate : cur.endDate;
	// moving date without explicit endDate keeps the span
	if (p.date !== undefined && p.endDate === undefined && cur.date && cur.endDate && p.date) {
		endDate = addDays(p.date, diffDays(cur.date, cur.endDate));
	}
	if (date === null) endDate = null;
	if (endDate === date) endDate = null;
	const time = p.time !== undefined ? p.time : date === null ? null : cur.time;
	checkDates(date, endDate);
	if (time && !date) bad('time needs a date');
	if (p.parentId !== undefined) checkParent(meId, p.parentId, id);
	if (p.parentId && steps(meId, id).length) bad('an item with steps cannot become a step');
	const now = nowUtcIso();
	db()
		.update(items)
		.set({
			...p,
			date,
			time,
			endDate,
			...(p.status ? statusStamps(cur, p.status, now) : {}),
			updatedAt: now,
			updatedBy: meId,
		})
		.where(eq(items.id, id))
		.run();
	return mustOwn(meId, id);
}

/** FR-H3/H4: todo -> doing -> done -> todo */
export function cycle(meId: string, id: string): ItemRow {
	const cur = mustOwn(meId, id);
	return patch(meId, id, { status: nextStatus(cur.status) });
}

// ---------- delete / trash (FR-I5) ----------
export function softDelete(meId: string, id: string): { batch: string } {
	const cur = mustOwn(meId, id);
	const batch = newId('del');
	const now = nowUtcIso();
	handle().sqlite.transaction(() => {
		const stepIds = db()
			.select({ id: items.id })
			.from(items)
			.where(and(eq(items.parentId, cur.id), live))
			.all()
			.map((r) => r.id);
		const all = [cur.id, ...stepIds];
		db().update(items).set({ deletedAt: now, deletedBatch: batch }).where(inArray(items.id, all)).run();
		db()
			.update(blocks)
			.set({ deletedAt: now, deletedBatch: batch })
			.where(and(inArray(blocks.itemId, all), isNull(blocks.deletedAt)))
			.run();
	})();
	return { batch };
}

export function restore(meId: string, batch: string): number {
	const cals = myCalendarIds(meId);
	if (!cals.length) return 0;
	let n = 0;
	handle().sqlite.transaction(() => {
		n = db()
			.update(items)
			.set({ deletedAt: null, deletedBatch: null })
			.where(and(eq(items.deletedBatch, batch), inArray(items.calendarId, cals)))
			.run().changes;
		n += db()
			.update(blocks)
			.set({ deletedAt: null, deletedBatch: null })
			.where(and(eq(blocks.deletedBatch, batch), inArray(blocks.calendarId, cals)))
			.run().changes;
		// a step restored without its (still deleted) parent would be invisible: make it a normal item
		handle()
			.sqlite.prepare(
				`UPDATE items SET parent_id = NULL WHERE parent_id IN (SELECT id FROM items WHERE deleted_at IS NOT NULL)
				 AND deleted_at IS NULL AND calendar_id IN (${cals.map(() => '?').join(',')})`,
			)
			.run(...cals);
	})();
	return n;
}

export function trash(meId: string) {
	const cals = myCalendarIds(meId);
	if (!cals.length) return [];
	return db()
		.select({
			id: items.id,
			title: items.title,
			type: items.type,
			date: items.date,
			deletedAt: items.deletedAt,
			batch: items.deletedBatch,
			parentId: items.parentId,
		})
		.from(items)
		.where(and(inArray(items.calendarId, cals), isNotNull(items.deletedAt)))
		.orderBy(desc(items.deletedAt))
		.all();
}

/** deleted planner blocks (their own batch when a block was deleted alone) */
export function trashBlocks(meId: string) {
	const cals = myCalendarIds(meId);
	if (!cals.length) return [];
	return db()
		.select({
			label: blocks.label,
			type: blocks.type,
			startAt: blocks.startAt,
			deletedAt: blocks.deletedAt,
			batch: blocks.deletedBatch,
		})
		.from(blocks)
		.where(and(inArray(blocks.calendarId, cals), isNotNull(blocks.deletedAt)))
		.orderBy(desc(blocks.deletedAt))
		.all();
}

// ---------- lists ----------
export function unscheduled(meId: string): ItemRow[] {
	const cals = myCalendarIds(meId);
	if (!cals.length) return [];
	return db()
		.select()
		.from(items)
		.where(and(inArray(items.calendarId, cals), live, isNull(items.date), isNull(items.parentId)))
		.orderBy(asc(items.createdAt))
		.all();
}

/** FR-H12: dated today (or spanning today), not done, top-level */
export function dueOn(meId: string, day: string): ItemRow[] {
	const cals = myCalendarIds(meId);
	if (!cals.length) return [];
	return db()
		.select()
		.from(items)
		.where(
			and(
				inArray(items.calendarId, cals),
				live,
				isNull(items.parentId),
				or(eq(items.status, 'todo'), eq(items.status, 'doing')),
				lte(items.date, day),
				gte(sql`COALESCE(${items.endDate}, ${items.date})`, day),
			),
		)
		.orderBy(sql`${items.time} IS NULL`, asc(items.time), asc(items.title))
		.all();
}

/** all-day (no time) items touching [from, to) that are not done and have no planner block anywhere */
export function allDayUnblocked(meId: string, from: string, to: string): ItemRow[] {
	const cals = myCalendarIds(meId);
	if (!cals.length) return [];
	return db()
		.select()
		.from(items)
		.where(
			and(
				inArray(items.calendarId, cals),
				live,
				isNull(items.parentId),
				isNull(items.time),
				or(eq(items.status, 'todo'), eq(items.status, 'doing')),
				lt(items.date, to),
				sql`COALESCE(${items.endDate}, ${items.date}) >= ${from}`,
				sql`NOT EXISTS (SELECT 1 FROM blocks b WHERE b.item_id = ${items.id} AND b.deleted_at IS NULL)`,
			),
		)
		.orderBy(asc(items.date), asc(items.title))
		.all();
}

export function steps(meId: string, id: string): ItemRow[] {
	mustOwn(meId, id);
	return db()
		.select()
		.from(items)
		.where(and(eq(items.parentId, id), live))
		.orderBy(asc(items.date), asc(items.createdAt))
		.all();
}

export function editorName(userId: string | null): string | null {
	if (!userId) return null;
	return db().select({ n: users.displayName }).from(users).where(eq(users.id, userId)).get()?.n ?? null;
}
