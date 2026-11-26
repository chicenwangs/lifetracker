// Global undo journal (FEATURES §3 Undo, DESIGN §11). Per user, newest first, 12 h, no redo.
// One UI action = one entry = whole rows before + after. (updated_at alone has 1 s resolution: two quick
// edits would look the same.)
// Undo checks every row still looks exactly as the action left it ("can't undo safely" otherwise),
// then writes the before-rows back in one transaction.
import { handle } from './db';
import { ApiFail } from './http';
import { newId } from './crypto';
import { isoPlus, nowUtcIso } from '$lib/time';
import * as fts from './search';
import * as attachments from './attachments';

/** tables the journal may touch. Never sessions, users, grants, share codes. */
const TABLES = ['items', 'blocks', 'item_types', 'pages'] as const;
export type Table = (typeof TABLES)[number];
export interface Target {
	t: Table;
	id: string;
}
type Row = Record<string, unknown>;
interface Snap extends Target {
	before: Row | null;
	/** the row right after the action; null = it did not exist */
	after: Row | null;
}
export interface UndoRef {
	id: string;
	label: string;
}

const EXPIRES_MS = 12 * 3_600_000;
const db = () => handle().sqlite;
const get = (t: Table, id: string) =>
	db().prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id) as Row | undefined;
/** pages.last_opened_at moves on every page load; opening a page must not block undoing what created it (#440) */
const comparable = (t: Table, row: Row | null | undefined) => {
	if (!row || t !== 'pages') return row ?? null;
	const rest = { ...row };
	delete rest.last_opened_at;
	return rest;
};

/**
 * Run `fn` and journal what it changed. `targets` = rows that exist before (they are captured first);
 * `fn` returns its result plus any rows it created. All in one transaction.
 */
export function undoable<T>(
	userId: string,
	label: string,
	targets: Target[],
	fn: () => { result: T; created?: Target[] },
): { result: T; undo: UndoRef } {
	return db().transaction(() => {
		const before = new Map(targets.map((x) => [`${x.t}:${x.id}`, { ...x, before: get(x.t, x.id) ?? null }]));
		const { result, created = [] } = fn();
		for (const x of created) if (!before.has(`${x.t}:${x.id}`)) before.set(`${x.t}:${x.id}`, { ...x, before: null });
		const rows: Snap[] = [...before.values()].map((s) => ({ ...s, after: get(s.t, s.id) ?? null }));
		const id = newId('und');
		const now = nowUtcIso();
		db()
			.prepare(`INSERT INTO undo_actions (id, user_id, label, rows, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
			.run(id, userId, label, JSON.stringify(rows), now, isoPlus(now, EXPIRES_MS));
		return { result, undo: { id, label } };
	})();
} // prettier-ignore

/** undo the newest live action of this user (or a given one). Returns its label. */
export function undo(userId: string, id?: string): { label: string } {
	return db().transaction(() => {
		const now = nowUtcIso();
		const a = db()
			.prepare(
				`SELECT id, label, rows FROM undo_actions WHERE user_id = ? AND undone_at IS NULL AND expires_at > ?
				 ${id ? 'AND id = ?' : ''} ORDER BY created_at DESC, rowid DESC LIMIT 1`,
			)
			.get(...(id ? [userId, now, id] : [userId, now])) as { id: string; label: string; rows: string } | undefined;
		if (!a) throw new ApiFail(404, 'nothing_to_undo', 'Nothing to undo.');
		const rows = JSON.parse(a.rows) as Snap[];
		for (const r of rows) {
			const cur = get(r.t, r.id);
			const same = JSON.stringify(comparable(r.t, cur)) === JSON.stringify(comparable(r.t, r.after));
			if (!same) throw new ApiFail(409, 'cant_undo', `Can't undo safely: "${a.label}" was changed since.`);
		}
		// parents before children on re-insert (a step needs its item), children first on delete
		const order = (t: Table) => TABLES.indexOf(t);
		for (const r of [...rows].sort((x, y) => order(x.t) - order(y.t) || Number(!!y.before?.parent_id) - Number(!!x.before?.parent_id)).reverse())
			if (!r.before) {
				// pages keep side tables synced by repo helpers, not triggers: clear them before the row (and its
				// blocks/links/databases, which cascade) goes
				if (r.t === 'pages') {
					fts.unindex('page', r.id);
					attachments.dropRefs('page_block', r.id);
					attachments.dropRefs('page_cover', r.id); // v4.0 PR 31: a cover ref would pin the image
				}
				db().prepare(`DELETE FROM ${r.t} WHERE id = ?`).run(r.id);
			}
		for (const r of [...rows].sort((x, y) => (x.t === y.t ? Number(!!x.before?.parent_id) - Number(!!y.before?.parent_id) : order(x.t) - order(y.t)))) {
			if (!r.before) continue;
			const cols = Object.keys(r.before).filter((c) => c !== 'id');
			if (get(r.t, r.id)) {
				// UPDATE, never INSERT OR REPLACE: REPLACE deletes the row first and fires ON DELETE SET NULL on children
				db().prepare(`UPDATE ${r.t} SET ${cols.map((c) => `"${c}" = @${c}`).join(', ')} WHERE id = @id`).run(r.before);
			} else {
				const all = Object.keys(r.before);
				db().prepare(`INSERT INTO ${r.t} (${all.map((c) => `"${c}"`).join(', ')}) VALUES (${all.map((c) => `@${c}`).join(', ')})`).run(r.before);
			}
		}
		// v4.0 PR 31: a cover change moves attachment_refs too (a side table the journal does not hold)
		for (const r of rows) {
			if (r.t !== 'pages' || !r.before || !r.after) continue;
			const b = r.before as { cover_attachment_id?: string | null; owner_id?: string };
			const a = r.after as { cover_attachment_id?: string | null };
			if ((b.cover_attachment_id ?? null) === (a.cover_attachment_id ?? null)) continue;
			attachments.dropRefs('page_cover', r.id);
			if (b.cover_attachment_id)
				attachments.addRef(b.owner_id ?? '', b.cover_attachment_id, 'page_cover', r.id);
		}
		db().prepare(`UPDATE undo_actions SET undone_at = ? WHERE id = ?`).run(now, a.id);
		return { label: a.label };
	})();
} // prettier-ignore

export function purgeExpired(now: number = Date.now()): void {
	db().prepare(`DELETE FROM undo_actions WHERE expires_at < ?`).run(nowUtcIso(now));
}

/** on sign-out-everywhere (DESIGN §5) */
export const clearFor = (userId: string) =>
	db().prepare(`DELETE FROM undo_actions WHERE user_id = ?`).run(userId);
