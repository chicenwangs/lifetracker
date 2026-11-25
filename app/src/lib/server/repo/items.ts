// Items. ALL scoping here: only rows in calendars owned by `me` (P2 adds grants via access.ts).
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, handle } from '../db';
import { blocks, calendars, items, users } from '../schema';
import { newId } from '../crypto';
import { notFound, bad } from '../http';
import { zDate, zIsoZ, zStatus, zTime, zTitle, zType, zId } from '../validate';
import * as calendarsRepo from './calendars';
import * as itemTypesRepo from './itemtypes';
import { addDays, DEFAULT_TZ, diffDays, nowUtcIso, todayLocal } from '$lib/time';
import {
	baseItemId,
	canCountFromCompletion,
	countBefore,
	expandRRule,
	formatRRule,
	nextFromCompletion,
	parseExdates,
	parseRRule,
	retargetRRule,
	splitOccId,
	withUntil,
} from '$lib/rrule';
import { nextStatus, type ItemDTO, type Status } from '$lib/types';

export type ItemRow = typeof items.$inferSelect & {
	seriesId?: string;
	occurrenceDate?: string;
	seriesDate?: string;
};

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
	const dto: ItemDTO = {
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
	if (r.repeatFromCompletion) dto.repeatFromCompletion = true;
	if (r.rrule) {
		dto.rrule = r.rrule;
		dto.seriesId = r.seriesId ?? baseItemId(r.id);
		dto.occurrenceDate = r.occurrenceDate ?? r.date ?? undefined;
		dto.seriesDate = r.seriesDate ?? r.date ?? undefined;
	}
	return dto;
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
	const c = stepCounts([...new Set(rows.map((r) => baseItemId(r.id)))]);
	return rows.map((r) => toDTO(r, c.get(baseItemId(r.id))));
}

/** items overlapping [from, to) local dates, including expanded occurrences of repeating items (#72). */
export function inRange(calendarId: string, from: string, to: string): ItemRow[] {
	const plain = db()
		.select()
		.from(items)
		.where(
			and(
				eq(items.calendarId, calendarId),
				live,
				isNull(items.rrule),
				isNotNull(items.date),
				lt(items.date, to),
				gte(sql`COALESCE(${items.endDate}, ${items.date})`, from),
			),
		)
		.all();
	const repeating = db()
		.select()
		.from(items)
		.where(
			and(
				eq(items.calendarId, calendarId),
				live,
				isNotNull(items.rrule),
				isNotNull(items.date),
				lt(items.date, to),
			),
		)
		.all();
	const expanded: ItemRow[] = [...plain];
	for (const r of repeating) {
		if (!r.date || !r.rrule) continue;
		// v3.3 PR 9: a from-completion series has only its next date on screen, never future ghosts
		if (r.repeatFromCompletion) {
			if (r.date < to && (r.endDate ?? r.date) >= from) expanded.push(r);
			continue;
		}
		const span = r.endDate ? diffDays(r.date, r.endDate) : 0;
		const occs = expandRRule(r.date, r.rrule, parseExdates(r.exdates), from, to, span);
		for (const occ of occs) {
			expanded.push({
				...r,
				id: `${r.id}@${occ}`,
				seriesId: r.id,
				occurrenceDate: occ,
				seriesDate: r.date,
				date: occ,
				endDate: span > 0 ? addDays(occ, span) : null,
			});
		}
	}
	return expanded.sort((a, b) => {
		const da = a.date ?? '';
		const dbDate = b.date ?? '';
		if (da !== dbDate) return da < dbDate ? -1 : 1;
		const ta = a.time;
		const tb = b.time;
		if ((ta === null) !== (tb === null)) return ta === null ? -1 : 1;
		if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
		return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
	});
}

export function getOwn(meId: string, rawId: string): ItemRow | undefined {
	const { id } = splitOccId(rawId);
	const cals = myCalendarIds(meId);
	if (!cals.length) return undefined;
	return db()
		.select()
		.from(items)
		.where(and(eq(items.id, id), inArray(items.calendarId, cals), live))
		.get();
}

export function mustOwn(meId: string, rawId: string): ItemRow {
	return getOwn(meId, rawId) ?? notFound();
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

/** a repeat that ends before its first date has no occurrences: the item would vanish from every calendar */
function checkRuleEnd(date: string | null, rrule: string | null | undefined) {
	const until = parseRRule(rrule)?.until;
	if (until && date && until < date) bad('repeat end before start', 'bad_repeat_end');
}

const zRRule = z
	.string()
	.max(200)
	.refine((s) => parseRRule(s) !== null, 'invalid repeat rule')
	.transform((s) => {
		const parsed = parseRRule(s);
		return parsed ? formatRRule(parsed) : s;
	});

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
		rrule: zRRule.nullable().default(null),
	})
	.strict();
export type ItemCreate = z.infer<typeof itemCreateSchema>;

export function create(meId: string, input: ItemCreate): ItemRow {
	itemTypesRepo.mustHave(meId, input.type);
	checkDates(input.date, input.endDate);
	if (input.time && !input.date) bad('time needs a date');
	if (input.rrule && !input.date) bad('repeat needs a date');
	checkRuleEnd(input.date, input.rrule);
	if (input.rrule && input.parentId) bad('steps cannot repeat');
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
			rrule: input.rrule ?? null,
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

/** Alt-drag copy (D-09 allowlist): title, type, time, span length, notes. Never status, audit, steps, secret flag. */
export function duplicateTo(meId: string, id: string, date: string): ItemRow {
	const src = mustOwn(meId, id);
	return create(
		meId,
		itemCreateSchema.parse({
			title: src.title,
			type: src.type,
			date,
			time: src.time,
			endDate: src.date && src.endDate ? addDays(date, diffDays(src.date, src.endDate)) : null,
			notes: src.notes,
		}),
	);
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
		rrule: zRRule.nullable(),
		/** v3.3 PR 9: count the next one from the day it is finished */
		repeatFromCompletion: z.boolean(),
		/** repeating edit scope (#72): 'this' detaches one date, 'following' splits the series, 'all' updates the series */
		scope: z.enum(['this', 'following', 'all']),
		/** #105 offline edit timestamp (UTC Z): if server's updatedAt >= editedAt, server wins */
		editedAt: zIsoZ,
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

/** #296: the rule really generates `occDate` (detached dates count: they are still the rule's dates) */
export function isOccurrence(cur: ItemRow, occDate: string): boolean {
	if (!cur.rrule || !cur.date) return false;
	const span = cur.endDate ? diffDays(cur.date, cur.endDate) : 0;
	return expandRRule(cur.date, cur.rrule, [], occDate, addDays(occDate, 1), span).includes(occDate);
}

function addExdate(meId: string, cur: ItemRow, occDate: string, now: string): void {
	const ex = parseExdates(cur.exdates);
	if (!ex.includes(occDate)) {
		ex.push(occDate);
		ex.sort();
	}
	db().update(items).set({ exdates: ex, updatedAt: now, updatedBy: meId }).where(eq(items.id, cur.id)).run();
}

function detachOccurrence(meId: string, cur: ItemRow, occDate: string, p: ItemPatch): ItemRow {
	const now = nowUtcIso();
	const span = cur.date && cur.endDate ? diffDays(cur.date, cur.endDate) : 0;
	const date = p.date !== undefined ? p.date : occDate;
	let endDate = p.endDate !== undefined ? p.endDate : date && span > 0 ? addDays(date, span) : null;
	if (date === null || endDate === date) endDate = null;
	return handle().sqlite.transaction(() => {
		addExdate(meId, cur, occDate, now);
		return create(
			meId,
			itemCreateSchema.parse({
				title: p.title ?? cur.title,
				type: p.type !== undefined ? p.type : cur.type,
				status: p.status ?? cur.status,
				date,
				time: p.time !== undefined ? p.time : date === null ? null : cur.time,
				endDate,
				notes: p.notes !== undefined ? p.notes : cur.notes,
				private: p.private !== undefined ? p.private : cur.private,
				rrule: null,
			}),
		);
	})();
}

/** PR 9: tick a from-completion series: a done copy dated today stays as history, the series moves on by one
 *  interval from today. Runs inside the route's undo transaction: the copy id goes to the journal's created list. */
function completeFromCompletion(meId: string, cur: ItemRow, onCreated?: (id: string) => void): ItemRow {
	const tz =
		(
			handle().sqlite.prepare(`SELECT timezone FROM users WHERE id = ?`).get(meId) as
				{ timezone: string } | undefined
		)?.timezone ?? DEFAULT_TZ;
	const today = todayLocal(tz);
	const next = nextFromCompletion(today, cur.rrule);
	if (!next) {
		bad('This repeat cannot count from completion.', 'bad_from_completion');
		return cur; // bad() throws; this keeps `next` a string for the type checker
	}
	const now = nowUtcIso();
	const span = cur.date && cur.endDate ? diffDays(cur.date, cur.endDate) : 0;
	const copyId = newId('itm');
	handle().sqlite.transaction(() => {
		db()
			.insert(items)
			.values({
				...cur,
				id: copyId,
				date: today,
				endDate: span > 0 ? addDays(today, span) : null,
				status: 'done',
				rrule: null,
				exdates: null,
				repeatFromCompletion: false,
				icsUid: null,
				parentId: null,
				startedAt: cur.startedAt ?? now,
				completedAt: now,
				createdAt: now,
				updatedAt: now,
				updatedBy: meId,
			})
			.run();
		db()
			.update(items)
			.set({ date: next, endDate: span > 0 ? addDays(next, span) : null, updatedAt: now, updatedBy: meId })
			.where(eq(items.id, cur.id))
			.run();
	})();
	onCreated?.(copyId);
	return mustOwn(meId, cur.id);
}

export function patch(meId: string, rawId: string, p: ItemPatch, onCreated?: (id: string) => void): ItemRow {
	const { id, occDate } = splitOccId(rawId);
	const cur = mustOwn(meId, id);
	// #158/#163: that date was already detached into its own row; editing it again would make a second copy
	if (occDate && parseExdates(cur.exdates).includes(occDate)) notFound();
	if (occDate && cur.rrule && !isOccurrence(cur, occDate)) notFound(); // #296: a made-up @date is not an occurrence
	const { scope, editedAt, ...fields } = p;
	// #105 offline edit made before the server copy last changed: the server wins
	if (editedAt && cur.updatedAt > editedAt) return cur;
	if (fields.type !== undefined) itemTypesRepo.mustHave(meId, fields.type);

	// v3.3 PR 9: finishing a from-completion series never detaches. It leaves a done copy dated today (history)
	// and moves the series on by one interval from today. Undo: the route passes the copy id to its journal.
	const onlyDone =
		fields.status === 'done' &&
		scope === undefined &&
		fields.date === undefined &&
		fields.rrule === undefined &&
		fields.time === undefined &&
		fields.endDate === undefined;
	if (onlyDone && cur.repeatFromCompletion && cur.rrule && cur.date)
		return completeFromCompletion(meId, cur, onCreated);

	// Repeating occurrence handling (#72):
	// - Ticking status (only `status` changed, no `scope`) detaches that single occurrence date.
	// - `scope === 'this'` (or dragging an occurrence date on the calendar without scope) detaches that date.
	// - `scope === 'following'` truncates the existing series before `occDate` and starts a new series at `occDate`.
	// PR 9: a from-completion series is one row that moves itself on done; it never detaches or splits.
	if (cur.rrule && cur.date && !cur.repeatFromCompletion) {
		const targetOcc = occDate ?? cur.date;
		const keys = Object.keys(fields);
		const onlyStatus = keys.length === 1 && keys[0] === 'status';
		const draggedOcc = !scope && occDate !== null && fields.date !== undefined && fields.rrule === undefined;
		const effScope = scope ?? (onlyStatus || draggedOcc ? 'this' : 'all');

		if (effScope === 'this') {
			return detachOccurrence(meId, cur, targetOcc, fields);
		}
		if (effScope === 'following' && targetOcc > cur.date) {
			const now = nowUtcIso();
			const span = cur.endDate ? diffDays(cur.date, cur.endDate) : 0;
			const newDate = fields.date !== undefined ? fields.date : targetOcc;
			let newEnd =
				fields.endDate !== undefined ? fields.endDate : newDate && span > 0 ? addDays(newDate, span) : null;
			if (newDate === null || newEnd === newDate) newEnd = null;
			// #155: the new half keeps what is left of a COUNT and the dates the user already deleted;
			// #164: a moved start date takes the rule's weekday / day of month with it
			let newRule = fields.rrule !== undefined ? fields.rrule : (cur.rrule as string);
			let newEx: string[] = [];
			if (fields.rrule === undefined && newDate) {
				let nr = cur.rrule as string;
				const r = parseRRule(nr);
				if (r?.count)
					nr = formatRRule({ ...r, count: Math.max(1, r.count - countBefore(cur.date, nr, targetOcc)) });
				newRule = retargetRRule(nr, targetOcc, newDate);
				const shift = diffDays(targetOcc, newDate);
				newEx = parseExdates(cur.exdates)
					.filter((d) => d >= targetOcc)
					.map((d) => addDays(d, shift));
			}
			return handle().sqlite.transaction(() => {
				db()
					.update(items)
					.set({
						rrule: withUntil(cur.rrule as string, addDays(targetOcc, -1)),
						updatedAt: now,
						updatedBy: meId,
					})
					.where(eq(items.id, cur.id))
					.run();
				const made = create(
					meId,
					itemCreateSchema.parse({
						title: fields.title ?? cur.title,
						type: fields.type !== undefined ? fields.type : cur.type,
						status: fields.status ?? cur.status,
						date: newDate,
						time: fields.time !== undefined ? fields.time : newDate === null ? null : cur.time,
						endDate: newEnd,
						notes: fields.notes !== undefined ? fields.notes : cur.notes,
						private: fields.private !== undefined ? fields.private : cur.private,
						rrule: newDate === null ? null : newRule,
					}),
				);
				if (!newEx.length || !made.rrule) return made;
				db().update(items).set({ exdates: newEx }).where(eq(items.id, made.id)).run();
				return mustOwn(meId, made.id);
			})();
		}
	}

	let date = fields.date !== undefined ? fields.date : cur.date;
	let endDate = fields.endDate !== undefined ? fields.endDate : cur.endDate;
	// #296: "Does not repeat" must not put the series back on a date it already detached into its own row
	if (fields.rrule === null && fields.date === undefined && cur.rrule && cur.date) {
		const ex = parseExdates(cur.exdates);
		if (ex.includes(cur.date)) {
			const span = cur.endDate ? diffDays(cur.date, cur.endDate) : 0;
			const next = expandRRule(cur.date, cur.rrule, ex, cur.date, addDays(cur.date, 36_600), span)[0];
			if (!next) return bad('every date of this series was edited on its own; delete the series instead', 'series_empty'); // prettier-ignore
			date = next;
			endDate = span > 0 ? addDays(next, span) : null;
		}
	}
	// moving date without explicit endDate keeps the span
	if (fields.date !== undefined && fields.endDate === undefined && cur.date && cur.endDate && fields.date) {
		endDate = addDays(fields.date, diffDays(cur.date, cur.endDate));
	}
	if (date === null) endDate = null;
	if (endDate === date) endDate = null;
	const time = fields.time !== undefined ? fields.time : date === null ? null : cur.time;
	let rrule = fields.rrule !== undefined ? fields.rrule : date === null ? null : cur.rrule;
	// #164: moving a whole series' date moves its weekday / day of month too
	if (fields.rrule === undefined && rrule && cur.date && date && date !== cur.date)
		rrule = retargetRRule(rrule, cur.date, date);
	checkDates(date, endDate);
	if (time && !date) bad('time needs a date');
	if (rrule && !date) bad('repeat needs a date');
	checkRuleEnd(date, rrule);
	// v3.3 PR 9: count from completion only on a daily/weekly/monthly rule with no weekdays; picking weekdays
	// or clearing the rule silently falls back to "from the scheduled date" unless the client asks for it
	const fromCompletion =
		fields.repeatFromCompletion !== undefined
			? fields.repeatFromCompletion
			: canCountFromCompletion(rrule)
				? cur.repeatFromCompletion
				: false;
	if (fromCompletion && (!rrule || !canCountFromCompletion(rrule)))
		bad(
			'Counting from completion needs a daily, weekly or monthly repeat without weekdays.',
			'bad_from_completion',
		);
	if (fields.parentId !== undefined) checkParent(meId, fields.parentId, id);
	if (fields.parentId && steps(meId, id).length) bad('an item with steps cannot become a step');
	if ((fields.parentId ?? cur.parentId) && rrule) bad('steps cannot repeat');
	const now = nowUtcIso();
	db()
		.update(items)
		.set({
			...fields,
			date,
			time,
			endDate,
			rrule,
			repeatFromCompletion: !!(fromCompletion && rrule),
			...(rrule === null ? { exdates: null } : {}),
			...(fields.status ? statusStamps(cur, fields.status, now) : {}),
			updatedAt: now,
			updatedBy: meId,
		})
		.where(eq(items.id, id))
		.run();
	return mustOwn(meId, id);
}

/** FR-H3/H4: todo -> doing -> done -> todo. On a repeating item (#72), detaches that occurrence date;
 *  a from-completion series advances instead (PR 9). */
export function cycle(meId: string, rawId: string, onCreated?: (id: string) => void): ItemRow {
	const cur = mustOwn(meId, rawId);
	return patch(meId, rawId, { status: nextStatus(cur.status) }, onCreated);
}

/** Skip one date of a repeating series (v3.2 reschedule): an EXDATE. Undo = the journal's before-row. */
export function skipOccurrence(meId: string, rawId: string): ItemRow {
	const { id, occDate } = splitOccId(rawId);
	const cur = mustOwn(meId, id);
	if (!cur.rrule || !cur.date) bad('This item does not repeat.', 'not_repeating');
	if (!occDate) return bad('Skip needs one date of a repeating item.', 'occurrence_only');
	if (parseExdates(cur.exdates).includes(occDate)) notFound();
	if (!isOccurrence(cur, occDate)) notFound(); // #296: a made-up @date is not an occurrence
	addExdate(meId, cur, occDate, nowUtcIso());
	return mustOwn(meId, id);
}

// ---------- delete / trash (FR-I5) ----------
/** rows a delete of this item touches (for the undo journal): it, its live steps, their live blocks */
export function deleteSet(meId: string, id: string): { t: 'items' | 'blocks'; id: string }[] {
	const cur = mustOwn(meId, id);
	const ids = [cur.id, ...steps(meId, cur.id).map((s) => s.id)];
	const bl = db()
		.select({ id: blocks.id })
		.from(blocks)
		.where(and(inArray(blocks.itemId, ids), isNull(blocks.deletedAt)))
		.all();
	return [
		...ids.map((i) => ({ t: 'items' as const, id: i })),
		...bl.map((b) => ({ t: 'blocks' as const, id: b.id })),
	];
}

export function softDelete(
	meId: string,
	rawId: string,
	scope?: 'this' | 'following' | 'all',
): { batch: string } {
	const { id, occDate } = splitOccId(rawId);
	const cur = mustOwn(meId, id);
	const batch = newId('del');
	const now = nowUtcIso();
	if (cur.rrule && cur.date) {
		const targetOcc = occDate ?? cur.date;
		if (scope === 'this') {
			addExdate(meId, cur, targetOcc, now);
			return { batch };
		}
		if (scope === 'following' && targetOcc > cur.date) {
			db()
				.update(items)
				.set({
					rrule: withUntil(cur.rrule, addDays(targetOcc, -1)),
					updatedAt: now,
					updatedBy: meId,
				})
				.where(eq(items.id, cur.id))
				.run();
			return { batch };
		}
	}
	handle().sqlite.transaction(() => {
		const stepIds = db()
			.select({ id: items.id })
			.from(items)
			.where(and(eq(items.parentId, cur.id), live))
			.all()
			.map((r) => r.id);
		const all = [cur.id, ...stepIds];
		db()
			.update(items)
			.set({ deletedAt: now, deletedBatch: batch, updatedAt: now })
			.where(inArray(items.id, all))
			.run();
		db()
			.update(blocks)
			.set({ deletedAt: now, deletedBatch: batch, updatedAt: now })
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

/** FR-H12: dated today (or spanning today), not done, top-level (includes repeating occurrences, #72) */
export function dueOn(meId: string, day: string): ItemRow[] {
	const cals = myCalendarIds(meId);
	if (!cals.length) return [];
	return cals
		.flatMap((cid) => inRange(cid, day, addDays(day, 1)))
		.filter((r) => !r.parentId && (r.status === 'todo' || r.status === 'doing'))
		.sort((a, b) => {
			if ((a.time === null) !== (b.time === null)) return a.time === null ? -1 : 1;
			if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
			return a.title.localeCompare(b.title);
		});
}

/** v3.2 PR 4: a one-off top-level item whose last day is behind today. A normal repeat never slips; a
 *  from-completion series does (PR 9): its next date is what the user has to finish. */
const SLIPPED_CAP = 50;
const slippedWhere = (cals: string[], today: string) =>
	and(
		inArray(items.calendarId, cals),
		live,
		isNull(items.parentId),
		or(isNull(items.rrule), eq(items.repeatFromCompletion, true)),
		ne(items.status, 'done'),
		isNotNull(items.date),
		lt(sql`COALESCE(${items.endDate}, ${items.date})`, today),
	);

/** the Slipped strip: newest first, capped, plus how many more are waiting */
export function slipped(meId: string, today: string): { items: ItemDTO[]; more: number } {
	const cals = myCalendarIds(meId);
	if (!cals.length) return { items: [], more: 0 };
	const rows = db()
		.select()
		.from(items)
		.where(slippedWhere(cals, today))
		.orderBy(desc(items.date), desc(items.createdAt))
		.limit(SLIPPED_CAP)
		.all();
	const n =
		db()
			.select({ n: sql<number>`count(*)` })
			.from(items)
			.where(slippedWhere(cals, today))
			.get()?.n ?? 0;
	return { items: withCounts(rows), more: Math.max(0, n - rows.length) };
}

/** the rows "Move all to today" will change (the undo journal targets, before the move) */
export function slippedIds(meId: string, today: string): string[] {
	const cals = myCalendarIds(meId);
	if (!cals.length) return [];
	return db()
		.select({ id: items.id })
		.from(items)
		.where(slippedWhere(cals, today))
		.all()
		.map((r) => r.id);
}

/** "Move all to today": every slipped item keeps its time and its multi-day span. Call inside undoable(). */
export function moveSlippedToToday(meId: string, today: string): { moved: number } {
	const cals = myCalendarIds(meId);
	if (!cals.length) return { moved: 0 };
	const rows = db().select().from(items).where(slippedWhere(cals, today)).all();
	const now = nowUtcIso();
	return handle().sqlite.transaction(() => {
		for (const r of rows) {
			const span = r.date && r.endDate ? diffDays(r.date, r.endDate) : 0;
			db()
				.update(items)
				.set({
					date: today,
					endDate: span > 0 ? addDays(today, span) : null,
					updatedAt: now,
					updatedBy: meId,
				})
				.where(eq(items.id, r.id))
				.run();
		}
		return { moved: rows.length };
	})();
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

/** ICS feed rows: top-level dated items of `calendarId` in [from, to), repeating series NOT expanded (RRULE goes
 * out as is), each with the minutes of its first linked live planner block (null = none). */
export function feedRows(
	calendarId: string,
	from: string,
	to: string,
): (ItemRow & { blockMin: number | null })[] {
	const rows = db()
		.select()
		.from(items)
		.where(
			and(
				eq(items.calendarId, calendarId),
				live,
				isNull(items.parentId),
				isNotNull(items.date),
				lt(items.date, to),
				or(isNotNull(items.rrule), gte(sql`COALESCE(${items.endDate}, ${items.date})`, from)),
			),
		)
		.orderBy(asc(items.date), asc(items.createdAt))
		.all();
	const ids = rows.map((r) => r.id);
	const len = new Map<string, number>();
	for (let i = 0; i < ids.length; i += 500) {
		const linked = db()
			.select({ itemId: blocks.itemId, startAt: blocks.startAt, endAt: blocks.endAt })
			.from(blocks)
			.where(and(inArray(blocks.itemId, ids.slice(i, i + 500)), isNull(blocks.deletedAt)))
			.orderBy(asc(blocks.startAt))
			.all();
		for (const b of linked) {
			if (b.itemId && !len.has(b.itemId)) len.set(b.itemId, Math.round((Date.parse(b.endAt) - Date.parse(b.startAt)) / 60_000)); // prettier-ignore
		}
	}
	return rows.map((r) => ({ ...r, blockMin: len.get(r.id) ?? null }));
}
