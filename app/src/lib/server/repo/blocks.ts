// Planner blocks. Instants UTC Z. Scoped to calendars `me` owns.
import { and, asc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { blocks, calendars, items } from '../schema';
import { newId } from '../crypto';
import { bad, notFound } from '../http';
import { zIsoZ, zId, zStatus, zType } from '../validate';
import * as calendarsRepo from './calendars';
import * as itemsRepo from './items';
import { durationMin, isoPlus, nowUtcIso } from '$lib/time';
import { nextStatus, type BlockDTO, type ItemType } from '$lib/types';

export type BlockRow = typeof blocks.$inferSelect;
const live = isNull(blocks.deletedAt);
const MAX_MIN = 7 * 24 * 60;

function myCalendarIds(meId: string): string[] {
	return db()
		.select({ id: calendars.id })
		.from(calendars)
		.where(eq(calendars.ownerId, meId))
		.all()
		.map((r) => r.id);
}

export function toDTO(b: BlockRow, itemType: ItemType | null = null): BlockDTO {
	return {
		id: b.id,
		label: b.label,
		type: b.type,
		startAt: b.startAt,
		endAt: b.endAt,
		status: b.status,
		itemId: b.itemId,
		itemType,
		editable: true,
	};
}

/** blocks overlapping [fromZ, toZ) with linked item type */
export function inRange(calendarId: string, fromZ: string, toZ: string): BlockDTO[] {
	return db()
		.select({ b: blocks, itemType: items.type })
		.from(blocks)
		.leftJoin(items, and(eq(items.id, blocks.itemId), isNull(items.deletedAt)))
		.where(and(eq(blocks.calendarId, calendarId), live, lt(blocks.startAt, toZ), gt(blocks.endAt, fromZ)))
		.orderBy(asc(blocks.startAt))
		.all()
		.map((r) => toDTO(r.b, r.itemType));
}

export function getOwn(meId: string, id: string): BlockRow | undefined {
	const cals = myCalendarIds(meId);
	if (!cals.length) return undefined;
	return db()
		.select()
		.from(blocks)
		.where(and(eq(blocks.id, id), inArray(blocks.calendarId, cals), live))
		.get();
}
const mustOwn = (meId: string, id: string) => getOwn(meId, id) ?? notFound();

export function forItem(meId: string, itemId: string): BlockRow[] {
	itemsRepo.mustOwn(meId, itemId);
	return db()
		.select()
		.from(blocks)
		.where(and(eq(blocks.itemId, itemId), live))
		.orderBy(asc(blocks.startAt))
		.all();
}

function checkRange(s: string, e: string) {
	if (e <= s) bad('end must be after start');
	if (durationMin(s, e) > MAX_MIN) bad('block max 7 days');
	if (durationMin(s, e) < 15) bad('block min 15 min');
}

export const blockCreateSchema = z
	.object({
		label: z.string().trim().min(1).max(200).optional(),
		type: zType.default(null),
		startAt: zIsoZ,
		endAt: zIsoZ.optional(),
		itemId: zId('itm').nullable().default(null),
	})
	.strict();

export function create(meId: string, input: z.infer<typeof blockCreateSchema>): BlockRow {
	let label = input.label;
	if (input.itemId) {
		const it = itemsRepo.mustOwn(meId, input.itemId);
		label ??= it.title;
	}
	if (!label) bad('label needed');
	const endAt = input.endAt ?? isoPlus(input.startAt, 60 * 60_000);
	checkRange(input.startAt, endAt);
	const cal = calendarsRepo.defaultFor(meId);
	const now = nowUtcIso();
	const id = newId('blk');
	db()
		.insert(blocks)
		.values({
			id,
			calendarId: cal.id,
			itemId: input.itemId,
			label: label as string,
			type: input.type,
			startAt: input.startAt,
			endAt,
			status: 'todo',
			createdAt: now,
			updatedAt: now,
			updatedBy: meId,
		})
		.run();
	return mustOwn(meId, id);
}

export const blockPatchSchema = z
	.object({
		label: z.string().trim().min(1).max(200),
		type: zType,
		startAt: zIsoZ,
		endAt: zIsoZ,
		status: zStatus,
		itemId: zId('itm').nullable(),
	})
	.partial()
	.strict();

export function patch(meId: string, id: string, p: z.infer<typeof blockPatchSchema>): BlockRow {
	const cur = mustOwn(meId, id);
	const s = p.startAt ?? cur.startAt;
	const e = p.endAt ?? cur.endAt;
	checkRange(s, e);
	if (p.itemId) itemsRepo.mustOwn(meId, p.itemId);
	db()
		.update(blocks)
		.set({ ...p, updatedAt: nowUtcIso(), updatedBy: meId })
		.where(eq(blocks.id, id))
		.run();
	return mustOwn(meId, id);
}

export function cycle(meId: string, id: string): BlockRow {
	const cur = mustOwn(meId, id);
	return patch(meId, id, { status: nextStatus(cur.status) });
}

/** blocks: soft delete single (own batch so restore works) */
export function softDelete(meId: string, id: string): { batch: string } {
	mustOwn(meId, id);
	const batch = newId('del');
	db().update(blocks).set({ deletedAt: nowUtcIso(), deletedBatch: batch }).where(eq(blocks.id, id)).run();
	return { batch };
}

export function itemTypeOf(b: BlockRow): ItemType | null {
	if (!b.itemId) return null;
	return db().select({ t: items.type }).from(items).where(eq(items.id, b.itemId)).get()?.t ?? null;
}
