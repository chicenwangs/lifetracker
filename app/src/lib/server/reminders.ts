// Reminders (DESIGN §13, FEATURES §9, D-13..D-16). One table for every source. Relative rules are re-resolved from the
// source whenever it changes AND again just before sending, so a moved item never fires at its old time.
import { z } from 'zod';
import { handle } from './db';
import { newId } from './crypto';
import { bad, notFound } from './http';
import { itemRef, offsetMs, parseOffset, type Unit } from '$lib/remind';
import { isoPlus, nowUtcIso, utcToLocal } from '$lib/time';
import type { ReminderDTO } from '$lib/types';

export type Source = 'planner_item' | 'planner_block' | 'keep_note' | 'database_record';
const db = () => handle().sqlite;
type Row = { id: string; owner_id: string; source_type: Source; source_id: string; rule_kind: 'relative' | 'absolute'; rel_value: number | null; rel_unit: Unit | null; at_time: string | null; due_at: string | null; status: string; attempts: number; sent_at: string | null }; // prettier-ignore

export interface SourceInfo {
	title: string;
	/** UTC Z instant the item happens, null = none (no date) */
	ref: string | null;
	/** trashed / deleted / gone = reminders stop (D-16: archived notes still remind) */
	live: boolean;
	route: string;
	kind: 'planner' | 'keep' | 'pages';
}

/** what a source is right now, if it belongs to ownerId; undefined = not mine / never existed */
export function sourceInfo(ownerId: string, type: Source, id: string): SourceInfo | undefined {
	const tz = (db().prepare(`SELECT timezone FROM users WHERE id = ?`).get(ownerId) as { timezone: string } | undefined)?.timezone ?? 'Asia/Kuala_Lumpur'; // prettier-ignore
	if (type === 'planner_item') {
		const r = db().prepare(`SELECT i.title, i.date, i.time, i.deleted_at FROM items i JOIN calendars c ON c.id = i.calendar_id WHERE i.id = ? AND c.owner_id = ?`).get(id, ownerId) as { title: string; date: string | null; time: string | null; deleted_at: string | null } | undefined; // prettier-ignore
		return (
			r && {
				title: r.title,
				ref: r.date ? itemRef(r.date, r.time, tz) : null,
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

const dueOf = (r: Pick<Row, 'rule_kind' | 'rel_value' | 'rel_unit' | 'at_time'>, info: SourceInfo): string | null =>
	r.rule_kind === 'absolute' ? r.at_time : info.ref && r.rel_value && r.rel_unit ? isoPlus(info.ref, -offsetMs(r.rel_value, r.rel_unit)) : null; // prettier-ignore

const toDTO = (r: Row): ReminderDTO => ({ id: r.id, kind: r.rule_kind, offset: r.rel_value && r.rel_unit ? `${r.rel_value} ${r.rel_unit}` : null, dueAt: r.due_at, status: r.status as ReminderDTO['status'] }); // prettier-ignore

export const addSchema = z
	.object({
		/** relative: one of 1w 3d 2d 1d 2h 15min before the item's time */
		offset: z.string().max(10).optional(),
		/** absolute: a UTC Z instant */
		at: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
			.optional(),
	})
	.strict()
	.refine((p) => !!p.offset !== !!p.at, 'give an offset or a time');

export function add(
	ownerId: string,
	type: Source,
	sourceId: string,
	p: z.infer<typeof addSchema>,
	now = Date.now(),
): ReminderDTO {
	const info = sourceInfo(ownerId, type, sourceId);
	if (!info || !info.live) notFound();
	let rel: { value: number; unit: Unit } | null = null;
	if (p.offset) {
		rel = parseOffset(p.offset);
		if (!rel) bad(`"${p.offset}" isn't a reminder time. Use 1w, 3d, 2d, 1d, 2h or 15min.`, 'bad_offset');
		if (!info?.ref) bad('This has no date yet, so "before" has nothing to count from. Give it a date, or pick an exact time.', 'no_ref'); // prettier-ignore
	}
	const rule = { rule_kind: rel ? ('relative' as const) : ('absolute' as const), rel_value: rel?.value ?? null, rel_unit: rel?.unit ?? null, at_time: p.at ?? null }; // prettier-ignore
	const due = dueOf(rule, info as SourceInfo) as string;
	if (Date.parse(due) <= now) bad('That reminder time has already passed.', 'past');
	const dup = db().prepare(`SELECT 1 FROM reminders WHERE source_type = ? AND source_id = ? AND due_at = ? AND status IN ('scheduled','processing')`).get(type, sourceId, due); // prettier-ignore
	if (dup) bad('There is already a reminder at that time.', 'duplicate');
	const id = newId('rem');
	const t = nowUtcIso(now);
	db()
		.prepare(`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, rel_value, rel_unit, at_time, due_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`)
		.run(id, ownerId, type, sourceId, rule.rule_kind, rule.rel_value, rule.rel_unit, rule.at_time, due, t, t); // prettier-ignore
	return toDTO(db().prepare(`SELECT * FROM reminders WHERE id = ?`).get(id) as Row);
}

export function list(ownerId: string, type: Source, sourceId: string): ReminderDTO[] {
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
		const due = info?.live ? dueOf(r, info) : null;
		const status = due && Date.parse(due) > now ? 'scheduled' : 'cancelled';
		db()
			.prepare(`UPDATE reminders SET due_at = ?, status = ?, updated_at = ? WHERE id = ?`)
			.run(due ?? r.due_at, status, t, r.id);
	}
}

/** in-app channel: sent/missed reminders not shown yet */
export function inbox(ownerId: string) {
	const rows = db().prepare(`SELECT * FROM reminders WHERE owner_id = ? AND status IN ('sent','missed') AND seen_at IS NULL ORDER BY sent_at LIMIT 20`).all(ownerId) as Row[]; // prettier-ignore
	const out = rows.map((r) => {
		const i = sourceInfo(ownerId, r.source_type, r.source_id);
		return {
			id: r.id,
			title: i?.title ?? 'Reminder',
			route: i?.route ?? '/',
			late: r.status === 'missed',
			dueAt: r.due_at,
		};
	});
	if (rows.length) db().prepare(`UPDATE reminders SET seen_at = ? WHERE id IN (${rows.map(() => '?').join(',')})`).run(nowUtcIso(), ...rows.map((r) => r.id)); // prettier-ignore
	return out;
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
