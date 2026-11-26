// Reminders (DESIGN §13, FEATURES §9, D-13..D-16). One table for every source. Relative rules are re-resolved from the
// source whenever it changes AND again just before sending, so a moved item never fires at its old time.
import { z } from 'zod';
import { handle } from './db';
import { zIsoZ } from './validate';
import { newId } from './crypto';
import { bad, notFound } from './http';
import { itemRef, offsetMs, parseOffset, type Unit } from '$lib/remind';
import { baseItemId, expandRRule, parseExdates } from '$lib/rrule';
import {
	addDays,
	DEFAULT_TZ,
	diffDays,
	isoPlus,
	localToUtc,
	nowUtcIso,
	todayLocal,
	utcToLocal,
} from '$lib/time';
import type { ReminderDTO } from '$lib/types';
import * as itemsRepo from './repo/items';

export type Source = 'planner_item' | 'planner_block' | 'keep_note' | 'database_record';
const db = () => handle().sqlite;
export const MAX_OPEN = 500;
type Row = { id: string; owner_id: string; source_type: Source; source_id: string; rule_kind: 'relative' | 'absolute'; rel_value: number | null; rel_unit: Unit | null; at_time: string | null; due_at: string | null; status: string; attempts: number; sent_at: string | null }; // prettier-ignore

export interface SourceInfo {
	title: string;
	/** UTC Z instant the item happens, null = none (no date) */
	ref: string | null;
	/** repeating item fields (#72) for per-occurrence relative reminders */
	repeat?: { date: string; time: string | null; rrule: string; exdates: string[]; tz: string };
	/** trashed / deleted / gone = reminders stop (D-16: archived notes still remind) */
	live: boolean;
	route: string;
	kind: 'planner' | 'keep' | 'pages';
}

/** what a source is right now, if it belongs to ownerId; undefined = not mine / never existed */
export function sourceInfo(ownerId: string, type: Source, rawId: string): SourceInfo | undefined {
	const id = type === 'planner_item' ? baseItemId(rawId) : rawId;
	const tz = (db().prepare(`SELECT timezone FROM users WHERE id = ?`).get(ownerId) as { timezone: string } | undefined)?.timezone ?? 'Asia/Kuala_Lumpur'; // prettier-ignore
	if (type === 'planner_item') {
		const r = db().prepare(`SELECT i.title, i.date, i.time, i.rrule, i.exdates, i.deleted_at FROM items i JOIN calendars c ON c.id = i.calendar_id WHERE i.id = ? AND c.owner_id = ?`).get(id, ownerId) as { title: string; date: string | null; time: string | null; rrule: string | null; exdates: string | null; deleted_at: string | null } | undefined; // prettier-ignore
		return (
			r && {
				title: r.title,
				ref: r.date ? itemRef(r.date, r.time, tz) : null,
				repeat:
					r.date && r.rrule
						? { date: r.date, time: r.time, rrule: r.rrule, exdates: parseExdates(r.exdates), tz }
						: undefined,
				live: !r.deleted_at,
				route: `/item/${id}`,
				kind: 'planner',
			}
		);
	}
	if (type === 'planner_block') {
		const r = db().prepare(`SELECT b.label, b.start_at, b.deleted_at FROM blocks b JOIN calendars c ON c.id = b.calendar_id WHERE b.id = ? AND c.owner_id = ?`).get(id, ownerId) as { label: string; start_at: string; deleted_at: string | null } | undefined; // prettier-ignore
		return (
			r && {
				title: r.label,
				ref: r.start_at,
				live: !r.deleted_at,
				route: `/?d=${utcToLocal(r.start_at, tz).date}`, // owner's day, not the UTC one
				kind: 'planner',
			}
		);
	}
	if (type === 'keep_note') {
		const r = db().prepare(`SELECT title, body, deleted_at, archived_at FROM keep_notes WHERE id = ? AND owner_id = ?`).get(id, ownerId) as { title: string; body: string; deleted_at: string | null; archived_at: string | null } | undefined; // prettier-ignore
		return (
			r && {
				title: r.title || r.body.slice(0, 60) || 'Note',
				ref: null,
				live: !r.deleted_at,
				route: `/keep?${r.archived_at ? 'scope=archive&' : ''}note=${id}`, // D-16: archived notes remind too
				kind: 'keep',
			}
		);
	}
	const r = db().prepare(`SELECT r.page_id, d.page_id AS db_page FROM database_records r JOIN page_databases d ON d.id = r.database_id WHERE r.id = ? AND d.owner_id = ?`).get(id, ownerId) as { page_id: string | null; db_page: string } | undefined; // prettier-ignore
	if (!r) return undefined;
	const t = db().prepare(`SELECT v.value_json FROM database_values v JOIN database_properties p ON p.id = v.property_id WHERE v.record_id = ? AND p.property_type = 'title'`).get(id) as { value_json: string } | undefined; // prettier-ignore
	return {
		title: t ? (JSON.parse(t.value_json) as string) : 'Record',
		ref: null,
		live: true,
		route: `/pages/${r.page_id ?? r.db_page}`,
		kind: 'pages',
	};
}

/** next due UTC Z instant for a relative reminder on a repeating item (#72): earliest occurrence whose reminder is > now */
function nextRepeatDue(rep: NonNullable<SourceInfo['repeat']>, ms: number, now = Date.now()): string | null {
	const start = addDays(todayLocal(rep.tz, now), -1);
	// #187: far enough for yearly / every-N-years rules (expandRRule caps its own steps)
	const end = addDays(start, 36_600);
	const occs = expandRRule(rep.date, rep.rrule, rep.exdates, start, end);
	for (const d of occs) {
		const due = isoPlus(itemRef(d, rep.time, rep.tz), -ms);
		if (Date.parse(due) > now) return due;
	}
	return null;
}

const dueOf = (
	r: Pick<Row, 'rule_kind' | 'rel_value' | 'rel_unit' | 'at_time'>,
	info: SourceInfo,
	now = Date.now(),
): string | null => {
	if (r.rule_kind === 'absolute') return r.at_time;
	if (!r.rel_value || !r.rel_unit) return null;
	const ms = offsetMs(r.rel_value, r.rel_unit);
	if (info.repeat) return nextRepeatDue(info.repeat, ms, now);
	return info.ref ? isoPlus(info.ref, -ms) : null;
};

const toDTO = (r: Row): ReminderDTO => ({ id: r.id, kind: r.rule_kind, offset: r.rel_value && r.rel_unit ? `${r.rel_value} ${r.rel_unit}` : null, dueAt: r.due_at, status: r.status as ReminderDTO['status'] }); // prettier-ignore

export const addSchema = z
	.object({
		/** relative: one of 1w 3d 2d 1d 2h 15min before the item's time */
		offset: z.string().max(10).optional(),
		/** absolute: a UTC Z instant */
		at: zIsoZ.optional(), // real instant only (#287): Feb 30 / 99:99 would store an unrenderable dueAt
	})
	.strict()
	.refine((p) => !!p.offset !== !!p.at, 'give an offset or a time');

export function add(
	ownerId: string,
	type: Source,
	rawSourceId: string,
	p: z.infer<typeof addSchema>,
	now = Date.now(),
): ReminderDTO {
	const sourceId = type === 'planner_item' ? baseItemId(rawSourceId) : rawSourceId;
	const info = sourceInfo(ownerId, type, sourceId);
	if (!info || !info.live) notFound();
	let rel: { value: number; unit: Unit } | null = null;
	if (p.offset) {
		rel = parseOffset(p.offset);
		if (!rel) bad(`"${p.offset}" isn't a reminder time. Use 1w, 3d, 2d, 1d, 2h or 15min.`, 'bad_offset');
		if (!info?.ref) bad('This has no date yet, so "before" has nothing to count from. Give it a date, or pick an exact time.', 'no_ref'); // prettier-ignore
	}
	const rule = { rule_kind: rel ? ('relative' as const) : ('absolute' as const), rel_value: rel?.value ?? null, rel_unit: rel?.unit ?? null, at_time: p.at ?? null }; // prettier-ignore
	const due = dueOf(rule, info as SourceInfo, now) as string;
	if (!due || Date.parse(due) <= now) bad('That reminder time has already passed.', 'past');
	const dup = db().prepare(`SELECT 1 FROM reminders WHERE source_type = ? AND source_id = ? AND due_at = ? AND status IN ('scheduled','processing')`).get(type, sourceId, due); // prettier-ignore
	if (dup) bad('There is already a reminder at that time.', 'duplicate');
	// one global queue drains 50 per tick: an owner with thousands due at once would delay everyone else's
	const open = db().prepare(`SELECT count(*) AS n FROM reminders WHERE owner_id = ? AND status IN ('scheduled','processing')`).get(ownerId) as { n: number }; // prettier-ignore
	if (open.n >= MAX_OPEN) bad(`You have ${MAX_OPEN} reminders waiting. Remove some first.`, 'too_many');
	const id = newId('rem');
	const t = nowUtcIso(now);
	db()
		.prepare(`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, rel_value, rel_unit, at_time, due_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`)
		.run(id, ownerId, type, sourceId, rule.rule_kind, rule.rel_value, rule.rel_unit, rule.at_time, due, t, t); // prettier-ignore
	return toDTO(db().prepare(`SELECT * FROM reminders WHERE id = ?`).get(id) as Row);
}

export function list(ownerId: string, type: Source, rawSourceId: string): ReminderDTO[] {
	const sourceId = type === 'planner_item' ? baseItemId(rawSourceId) : rawSourceId;
	return (db().prepare(`SELECT * FROM reminders WHERE owner_id = ? AND source_type = ? AND source_id = ? AND status <> 'cancelled' ORDER BY due_at`).all(ownerId, type, sourceId) as Row[]).map(toDTO); // prettier-ignore
}

export function remove(ownerId: string, id: string): void {
	if (!db().prepare(`DELETE FROM reminders WHERE id = ? AND owner_id = ?`).run(id, ownerId).changes)
		notFound();
}

/** after any change to a source: relative ones move with it; gone/trashed -> cancelled; restored -> back on (if still ahead) */
export function recalc(ownerId: string, type: Source, sourceId: string, now = Date.now()): void {
	const rows = db().prepare(`SELECT * FROM reminders WHERE owner_id = ? AND source_type = ? AND source_id = ? AND status IN ('scheduled','cancelled')`).all(ownerId, type, sourceId) as Row[]; // prettier-ignore
	if (!rows.length) return;
	const info = sourceInfo(ownerId, type, sourceId);
	const t = nowUtcIso(now);
	for (const r of rows) {
		const due = info?.live ? dueOf(r, info, now) : null;
		const status = due && Date.parse(due) > now ? 'scheduled' : 'cancelled';
		db()
			.prepare(`UPDATE reminders SET due_at = ?, status = ?, updated_at = ? WHERE id = ?`)
			.run(due ?? r.due_at, status, t, r.id);
	}
}

/**
 * #296: "this and following" splits a series in two. Relative reminders ("1d before") are copied to the new
 * half so later dates still remind. Exact-time ones stay on the old half (they fire at their own instant, and
 * the reminders table is not in the undo journal, so moving them would be lost when the split is undone).
 * shortcut: an exact-time reminder does not repeat into the new half, fine until reminders join the undo journal.
 */
export function splitSeries(ownerId: string, oldId: string, toId: string, now = Date.now()): void {
	const rows = db().prepare(`SELECT * FROM reminders WHERE owner_id = ? AND source_type = 'planner_item' AND source_id = ? AND status = 'scheduled'`).all(ownerId, oldId) as Row[]; // prettier-ignore
	const fresh = sourceInfo(ownerId, 'planner_item', toId)?.repeat;
	if (!rows.length || !fresh) return;
	const t = nowUtcIso(now);
	for (const r of rows) {
		if (r.rule_kind !== 'relative') continue;
		db().prepare(`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, rel_value, rel_unit, at_time, due_at, status, created_at, updated_at) VALUES (?, ?, 'planner_item', ?, 'relative', ?, ?, NULL, ?, 'scheduled', ?, ?)`).run(newId('rem'), ownerId, toId, r.rel_value, r.rel_unit, r.due_at, t, t); // prettier-ignore
	}
	recalc(ownerId, 'planner_item', oldId, now);
	recalc(ownerId, 'planner_item', toId, now);
}

/**
 * Card 03 C10 (D-V4-04): after one occurrence was skipped. Its absolute reminders are deleted inside the
 * route's undo entry (see absoluteInRange/removeIds); relative reminders re-resolve through recalc, so a
 * "1 day before" reminder is due at the next occurrence.
 */
export function afterSkip(ownerId: string, now = Date.now()): void {
	recalcOwner(ownerId, now);
}

/** ids of absolute reminders due inside the local date span [from, to]: the skip route journals their deletion */
export function absoluteInRange(ownerId: string, sourceId: string, from: string, to: string): string[] {
	const tz =
		(db().prepare(`SELECT timezone FROM users WHERE id = ?`).get(ownerId) as { timezone: string } | undefined)
			?.timezone ?? DEFAULT_TZ;
	const last = to < from ? from : to;
	const rows = db()
		.prepare(
			`SELECT id, due_at FROM reminders WHERE owner_id = ? AND source_type = 'planner_item' AND source_id = ? AND rule_kind = 'absolute' AND status IN ('scheduled','processing')`,
		)
		.all(ownerId, sourceId) as { id: string; due_at: string | null }[];
	return rows
		.filter((r) => {
			if (!r.due_at) return false;
			const day = utcToLocal(r.due_at, tz).date;
			return day >= from && day <= last;
		})
		.map((r) => r.id);
}

/** delete reminders by id (the skip route runs this inside its undo entry); a row already gone is skipped */
export function removeIds(ownerId: string, ids: string[]): void {
	const st = db().prepare(`DELETE FROM reminders WHERE id = ? AND owner_id = ?`);
	for (const id of ids) st.run(id, ownerId);
}

/** After a reminder on a repeating item fires (#72, #261), schedule the next occurrence if one exists. */
export function advanceRepeating(id: string, ownerId: string, now = Date.now()): void {
	const r = db().prepare(`SELECT * FROM reminders WHERE id = ? AND owner_id = ?`).get(id, ownerId) as Row | undefined; // prettier-ignore
	if (!r) return;
	const info = sourceInfo(ownerId, r.source_type, r.source_id);
	if (!info?.live || !info.repeat) return;
	const rep = info.repeat;
	let nextDue: string | null;
	if (r.rule_kind === 'relative') {
		if (!r.rel_value || !r.rel_unit) return;
		const after = Math.max(now, r.due_at ? Date.parse(r.due_at) + 1000 : now);
		nextDue = nextRepeatDue(rep, offsetMs(r.rel_value, r.rel_unit), after);
	} else {
		if (!r.due_at) return;
		// #261: an exact-time reminder keeps its distance from the occurrence, not its calendar date
		const local = utcToLocal(r.due_at, rep.tz);
		const occ = expandRRule(rep.date, rep.rrule, rep.exdates, local.date, addDays(local.date, 36_600))[0];
		if (!occ) return;
		const offset = diffDays(occ, local.date);
		// start near "now", not at the old occurrence: a long-overdue reminder must not scan years of days
		let cursor = addDays(todayLocal(rep.tz, now), -offset);
		for (let k = 0; ; k++) {
			const next = expandRRule(rep.date, rep.rrule, rep.exdates, cursor, addDays(cursor, 36_600))[0];
			if (!next || k >= 1000) return;
			const due = localToUtc(addDays(next, offset), local.time, rep.tz);
			if (Date.parse(due) > now) {
				nextDue = due;
				break;
			}
			cursor = addDays(cursor, 1);
		}
	}
	if (!nextDue) return;
	const dup = db().prepare(`SELECT 1 FROM reminders WHERE source_type = ? AND source_id = ? AND due_at = ? AND status IN ('scheduled','processing')`).get(r.source_type, r.source_id, nextDue); // prettier-ignore
	if (dup) return;
	const newRemId = newId('rem');
	const t = nowUtcIso(now);
	if (r.rule_kind === 'relative')
		db()
			.prepare(`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, rel_value, rel_unit, at_time, due_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'relative', ?, ?, NULL, ?, 'scheduled', ?, ?)`)
			.run(newRemId, ownerId, r.source_type, r.source_id, r.rel_value, r.rel_unit, nextDue, t, t); // prettier-ignore
	else
		db()
			.prepare(`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, rel_value, rel_unit, at_time, due_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'absolute', NULL, NULL, ?, ?, 'scheduled', ?, ?)`)
			.run(newRemId, ownerId, r.source_type, r.source_id, nextDue, nextDue, t, t); // prettier-ignore
}

/** Android app: scheduled reminders due in the next `ms`, for local alarms. Kinds the owner turned off are left out. */
export function upcoming(ownerId: string, now = Date.now(), ms = 48 * 3_600_000) {
	const rows = db().prepare(`SELECT * FROM reminders WHERE owner_id = ? AND status = 'scheduled' AND due_at > ? AND due_at <= ? ORDER BY due_at LIMIT 50`).all(ownerId, nowUtcIso(now), nowUtcIso(now + ms)) as Row[]; // prettier-ignore
	const on = db().prepare(`SELECT notify_planner AS planner, notify_keep AS keep, notify_pages AS pages FROM users WHERE id = ?`).get(ownerId) as Record<SourceInfo['kind'], number>; // prettier-ignore
	return rows.flatMap((r) => {
		const i = sourceInfo(ownerId, r.source_type, r.source_id);
		return i?.live && on[i.kind]
			? [
					{
						id: r.id,
						title: i.title,
						route: r.source_type === 'planner_item' ? `/today?item=${r.source_id}` : i.route,
						dueAt: r.due_at as string,
						sourceType: r.source_type,
						sourceId: r.source_id,
					},
				]
			: [];
	});
}

/** in-app channel: the oldest sent/missed reminder not shown yet (#198: one at a time, the toast has one slot) */
export function inbox(ownerId: string) {
	const rows = db().prepare(`SELECT * FROM reminders WHERE owner_id = ? AND status IN ('sent','missed') AND seen_at IS NULL ORDER BY sent_at LIMIT 21`).all(ownerId) as Row[]; // prettier-ignore
	const out = rows.slice(0, 1).map((r) => {
		const i = sourceInfo(ownerId, r.source_type, r.source_id);
		return {
			id: r.id,
			title: i?.title ?? 'Reminder',
			route: i?.route ?? '/',
			sourceType: r.source_type,
			sourceId: r.source_id,
			late: r.status === 'missed',
			dueAt: r.due_at,
			/** more waiting after this one (20 = 20 or more) */
			more: Math.min(20, rows.length - 1),
		};
	});
	if (rows[0]) db().prepare(`UPDATE reminders SET seen_at = ? WHERE id = ?`).run(nowUtcIso(), rows[0].id);
	return out;
}

export const actSchema = z.object({ action: z.enum(['done', 'snooze10', 'tomorrow']) }).strict();

/** Notification / in-app reminder actions (#112): Done · Snooze 10 min · Tomorrow (09:00 local). */
export function act(
	ownerId: string,
	id: string,
	action: 'done' | 'snooze10' | 'tomorrow',
	now = Date.now(),
): ReminderDTO | null {
	const r = db().prepare(`SELECT * FROM reminders WHERE id = ? AND owner_id = ?`).get(id, ownerId) as Row | undefined; // prettier-ignore
	if (!r) return notFound() as never;
	const t = nowUtcIso(now);
	// #185: a repeating item's chain goes on to the next date before this row is rewritten
	advanceRepeating(id, ownerId, now);
	if (action === 'done') {
		db().prepare(`UPDATE reminders SET status = 'sent', seen_at = COALESCE(seen_at, ?), updated_at = ? WHERE id = ?`).run(t, t, id); // prettier-ignore
		if (r.source_type === 'planner_item') {
			// through the repo (status stamps); a repeating item ticks only the occurrence this reminder was for (#72)
			const rep = sourceInfo(ownerId, 'planner_item', r.source_id)?.repeat;
			let target = r.source_id;
			if (rep && r.due_at) {
				const ref = r.rule_kind === 'relative' && r.rel_value && r.rel_unit ? isoPlus(r.due_at, offsetMs(r.rel_value, r.rel_unit)) : r.due_at; // prettier-ignore
				const from = utcToLocal(ref, rep.tz).date;
				const occ = expandRRule(rep.date, rep.rrule, rep.exdates, from, addDays(from, 400))[0];
				if (occ) target = `${r.source_id}@${occ}`;
			}
			try {
				itemsRepo.patch(ownerId, target, { status: 'done' });
			} catch {
				/* item gone meanwhile: the reminder is still marked handled */
			}
		} else if (r.source_type === 'planner_block')
			db().prepare(`UPDATE blocks SET status = 'done', updated_at = ? WHERE id = ? AND calendar_id IN (SELECT id FROM calendars WHERE owner_id = ?)`).run(t, r.source_id, ownerId); // prettier-ignore
		return null;
	}
	const tz = (db().prepare(`SELECT timezone FROM users WHERE id = ?`).get(ownerId) as { timezone: string } | undefined)?.timezone ?? 'Asia/Kuala_Lumpur'; // prettier-ignore
	const due =
		action === 'snooze10'
			? isoPlus(t, 10 * 60_000)
			: localToUtc(addDays(todayLocal(tz, now), 1), '09:00', tz);
	db()
		.prepare(`UPDATE reminders SET rule_kind = 'absolute', rel_value = NULL, rel_unit = NULL, at_time = ?, due_at = ?, status = 'scheduled', attempts = 0, sent_at = NULL, seen_at = NULL, last_error = NULL, updated_at = ? WHERE id = ?`)
		.run(due, due, t, id); // prettier-ignore
	return toDTO(db().prepare(`SELECT * FROM reminders WHERE id = ?`).get(id) as Row);
}

export const backlog = () =>
	(
		db()
			.prepare(`SELECT count(*) AS n FROM reminders WHERE status = 'scheduled' AND due_at <= ?`)
			.get(nowUtcIso()) as { n: number }
	).n;

/** after planner / Keep writes (move, delete, restore, undo): bring every open reminder of this user in step.
 * shortcut: re-checks all of one user's open reminders (tens); key by source if users get thousands */
export function recalcOwner(ownerId: string, now = Date.now()): void {
	const srcs = db().prepare(`SELECT DISTINCT source_type, source_id FROM reminders WHERE owner_id = ? AND status IN ('scheduled','cancelled')`).all(ownerId) as { source_type: Source; source_id: string }[]; // prettier-ignore
	for (const s of srcs) recalc(ownerId, s.source_type, s.source_id, now);
}
