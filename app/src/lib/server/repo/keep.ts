// Keep notes, checklists, labels, binders (FEATURES §5, DESIGN §8). Everything scoped by owner here.
// Order: REAL `position`, newest/top = highest. Checklist + labels + binders + images are saved as whole lists
// with the note in one transaction (simple, atomic, no partial states).
import { z } from 'zod';
import { handle, txImmediate } from '../db';
import { newId } from '../crypto';
import { ApiFail, bad, notFound } from '../http';
import * as attachments from '../attachments';
import * as fts from '../search';
import { nowUtcIso } from '$lib/time';

export const MAX_DEPTH = 4; // D-10
export const TRASH_DAYS = 30; // D-17
export const NOTE_COLORS = [
	'#F3A2BD',
	'#F7E7D8',
	'#C9DAE7',
	'#B6B1D9',
	'#D3EECE',
	'#FAEDB8',
	'#E6E7F0',
] as const;

export type { BinderDTO, ChecklistItem, LabelDTO, NoteDTO } from '$lib/types';
import type { BinderDTO, ChecklistItem, LabelDTO, NoteDTO } from '$lib/types';

const db = () => handle().sqlite;
type NoteRow = { id: string; owner_id: string; note_type: 'text' | 'checklist'; title: string; body: string; color: string | null; pinned: number; position: number; archived_at: string | null; deleted_at: string | null; created_at: string; updated_at: string; revision: number }; // prettier-ignore

function hydrate(rows: NoteRow[]): NoteDTO[] {
	if (!rows.length) return [];
	const ids = rows.map((r) => r.id);
	const q = ids.map(() => '?').join(',');
	const items = db().prepare(`SELECT id, note_id, text, checked, parent_item_id FROM keep_checklist_items WHERE note_id IN (${q}) ORDER BY position`).all(...ids) as { id: string; note_id: string; text: string; checked: number; parent_item_id: string | null }[]; // prettier-ignore
	const labels = db().prepare(`SELECT note_id, label_id FROM keep_note_labels WHERE note_id IN (${q})`).all(...ids) as { note_id: string; label_id: string }[]; // prettier-ignore
	const binders = db().prepare(`SELECT note_id, binder_id FROM keep_note_binders WHERE note_id IN (${q})`).all(...ids) as { note_id: string; binder_id: string }[]; // prettier-ignore
	const imgs = db().prepare(`SELECT r.source_id, a.id, a.original_name, a.mime_type, a.byte_size FROM attachment_refs r JOIN attachments a ON a.id = r.attachment_id WHERE r.source_type = 'keep_note' AND r.source_id IN (${q}) AND a.status = 'ready' ORDER BY r.created_at`).all(...ids) as { source_id: string; id: string; original_name: string; mime_type: string; byte_size: number }[]; // prettier-ignore
	return rows.map((r) => ({
		id: r.id,
		type: r.note_type,
		title: r.title,
		body: r.body,
		color: r.color,
		pinned: !!r.pinned,
		archived: !!r.archived_at,
		trashed: !!r.deleted_at,
		labels: labels.filter((l) => l.note_id === r.id).map((l) => l.label_id),
		binders: binders.filter((b) => b.note_id === r.id).map((b) => b.binder_id),
		items: items.filter((i) => i.note_id === r.id).map((i) => ({ id: i.id, text: i.text, checked: !!i.checked, parentId: i.parent_item_id })), // prettier-ignore
		images: imgs.filter((i) => i.source_id === r.id).map((i) => ({ id: i.id, name: i.original_name, mime: i.mime_type, size: i.byte_size, url: `/api/attachments/${i.id}` })), // prettier-ignore
		createdAt: r.created_at,
		updatedAt: r.updated_at,
		revision: r.revision,
	}));
}

const own = (ownerId: string, id: string): NoteRow =>
	(db().prepare(`SELECT * FROM keep_notes WHERE id = ? AND owner_id = ?`).get(id, ownerId) as
		NoteRow | undefined) ?? notFound();
export const get = (ownerId: string, id: string): NoteDTO => hydrate([own(ownerId, id)])[0] as NoteDTO;

export type Scope = 'active' | 'archive' | 'trash';
/** list for one scope; q matches title, body and checklist text; labels = all of them; binder = in that binder */
export function list(
	ownerId: string,
	o: { scope?: Scope; q?: string; labels?: string[]; binder?: string } = {},
): NoteDTO[] {
	const where = ['n.owner_id = ?'];
	const args: unknown[] = [ownerId];
	const scope = o.scope ?? 'active';
	where.push(scope === 'trash' ? 'n.deleted_at IS NOT NULL' : scope === 'archive' ? 'n.deleted_at IS NULL AND n.archived_at IS NOT NULL' : 'n.deleted_at IS NULL AND n.archived_at IS NULL'); // prettier-ignore
	const q = o.q?.trim();
	if (q) {
		// shortcut: LIKE scan of my own notes; P3 moves search to the FTS index (content_search)
		const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
		where.push(`(n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM keep_checklist_items i WHERE i.note_id = n.id AND i.text LIKE ? ESCAPE '\\'))`); // prettier-ignore
		args.push(like, like, like);
	}
	for (const l of o.labels ?? []) {
		where.push('EXISTS (SELECT 1 FROM keep_note_labels nl WHERE nl.note_id = n.id AND nl.label_id = ?)');
		args.push(l);
	}
	let order = 'n.pinned DESC, n.position DESC';
	if (o.binder) {
		where.push('nb.binder_id = ?');
		args.push(o.binder);
		order = 'n.pinned DESC, nb.position DESC';
	}
	const rows = db()
		.prepare(
			`SELECT n.* FROM keep_notes n ${o.binder ? 'JOIN keep_note_binders nb ON nb.note_id = n.id' : ''} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 1000`,
		) // prettier-ignore
		.all(...args) as NoteRow[];
	return hydrate(rows);
}

// ---------- write ----------
const zItem = z.object({ id: z.string().max(40).optional(), text: z.string().max(1000), checked: z.boolean(), parentId: z.string().max(40).nullable() }).strict(); // prettier-ignore
const zIds = z.array(z.string().max(40)).max(200);
export const noteSchema = z
	.object({
		type: z.enum(['text', 'checklist']),
		title: z.string().max(300),
		body: z.string().max(20_000),
		color: z.enum(NOTE_COLORS).nullable(),
		pinned: z.boolean(),
		archived: z.boolean(),
		trashed: z.boolean(),
		items: z.array(zItem).max(500),
		labels: zIds,
		binders: zIds,
		images: zIds,
		/** optimistic lock: refuse (409) if the note changed since this revision */
		revision: z.number().int().optional(),
	})
	.partial()
	.strict();
export type NoteInput = z.infer<typeof noteSchema>;

const maxPos = (sql: string, ...a: unknown[]) =>
	((
		db()
			.prepare(sql)
			.get(...a) as { m: number | null }
	).m ?? 0) + 1;
function mine(table: 'keep_labels' | 'keep_binders', ownerId: string, ids: string[]) {
	for (const id of ids)
		if (!db().prepare(`SELECT 1 FROM ${table} WHERE id = ? AND owner_id = ?`).get(id, ownerId)) bad(`unknown ${table === 'keep_labels' ? 'label' : 'binder'}`); // prettier-ignore
}

/** checklist rules: parent must come earlier in the list (so no cycles), depth <= D-10. Client ids that aren't ours
 * (new rows, temp ids) get a fresh id; children follow their parent's new id. */
function checkItems(items: z.infer<typeof zItem>[]): ChecklistItem[] {
	const out: ChecklistItem[] = [];
	const ids = new Map<string, string>(); // client id -> stored id
	const depth = new Map<string, number>(); // stored id -> depth
	for (const it of items) {
		const keep = it.id && /^kci_[0-9a-z]+$/.test(it.id) && !depth.has(it.id);
		const id = keep ? (it.id as string) : newId('kci');
		if (it.id) ids.set(it.id, id);
		let parentId: string | null = null;
		let d = 1;
		if (it.parentId) {
			parentId = ids.get(it.parentId) ?? null;
			if (!parentId) bad('checklist item parent must come before it');
			d = (depth.get(parentId as string) ?? 0) + 1;
			if (d > MAX_DEPTH) bad(`Checklists nest ${MAX_DEPTH} levels deep at most.`, 'too_deep');
		}
		depth.set(id, d);
		out.push({ id, text: it.text, checked: it.checked, parentId });
	}
	return out;
}

function writeParts(ownerId: string, id: string, p: NoteInput) {
	if (p.items) {
		const items = checkItems(p.items);
		db().prepare(`DELETE FROM keep_checklist_items WHERE note_id = ?`).run(id);
		const ins = db().prepare(`INSERT INTO keep_checklist_items (id, note_id, parent_item_id, text, checked, position) VALUES (?, ?, ?, ?, ?, ?)`); // prettier-ignore
		items.forEach((it, i) => ins.run(it.id, id, it.parentId, it.text, it.checked ? 1 : 0, i));
	}
	if (p.labels) {
		mine('keep_labels', ownerId, p.labels);
		db().prepare(`DELETE FROM keep_note_labels WHERE note_id = ?`).run(id);
		for (const l of new Set(p.labels)) db().prepare(`INSERT INTO keep_note_labels (note_id, label_id) VALUES (?, ?)`).run(id, l);
	}
	if (p.binders) {
		mine('keep_binders', ownerId, p.binders);
		const keep = new Set(p.binders);
		for (const b of db().prepare(`SELECT binder_id FROM keep_note_binders WHERE note_id = ?`).all(id) as { binder_id: string }[])
			if (!keep.has(b.binder_id)) db().prepare(`DELETE FROM keep_note_binders WHERE note_id = ? AND binder_id = ?`).run(id, b.binder_id);
		for (const b of keep)
			db().prepare(`INSERT OR IGNORE INTO keep_note_binders (note_id, binder_id, position) VALUES (?, ?, ?)`)
				.run(id, b, maxPos(`SELECT max(position) AS m FROM keep_note_binders WHERE binder_id = ?`, b)); // new in a binder = on top
	}
	if (p.images) {
		attachments.dropRefs('keep_note', id); // the file stays while anything else uses it; GC handles the rest
		for (const a of p.images) attachments.addRef(ownerId, a, 'keep_note', id);
	}
} // prettier-ignore

/** keep the search index in step (same transaction as the write): trash = out, archive = hidden by default */
function reindex(ownerId: string, id: string) {
	const n = get(ownerId, id);
	if (n.trashed) return fts.unindex('note', id);
	fts.index(ownerId, 'note', id, n.title, `${n.body} ${n.items.map((i) => i.text).join(' ')}`, n.archived);
}

export function create(ownerId: string, p: NoteInput): NoteDTO {
	const empty =
		!p.title?.trim() && !p.body?.trim() && !p.items?.some((i) => i.text.trim()) && !p.images?.length;
	if (empty) bad('Empty notes are not saved.', 'empty');
	return txImmediate(() => {
		const id = newId('kn');
		const now = nowUtcIso();
		db()
			.prepare(`INSERT INTO keep_notes (id, owner_id, note_type, title, body, color, pinned, position, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
			.run(id, ownerId, p.type ?? 'text', p.title ?? '', p.body ?? '', p.color ?? null, p.pinned ? 1 : 0, maxPos(`SELECT max(position) AS m FROM keep_notes WHERE owner_id = ?`, ownerId), p.archived ? now : null, now, now); // prettier-ignore
		writeParts(ownerId, id, p);
		reindex(ownerId, id);
		return get(ownerId, id);
	});
}

export function update(ownerId: string, id: string, p: NoteInput): NoteDTO {
	return txImmediate(() => {
		const cur = own(ownerId, id);
		if (p.revision !== undefined && p.revision !== cur.revision)
			throw new ApiFail(409, 'conflict', 'This note changed somewhere else. Reload it to see the latest.');
		const now = nowUtcIso();
		const set: Record<string, unknown> = {};
		if (p.type !== undefined) set.note_type = p.type;
		if (p.title !== undefined) set.title = p.title;
		if (p.body !== undefined) set.body = p.body;
		if (p.color !== undefined) set.color = p.color;
		if (p.pinned !== undefined) set.pinned = p.pinned ? 1 : 0;
		if (p.archived !== undefined) set.archived_at = p.archived ? (cur.archived_at ?? now) : null;
		if (p.trashed !== undefined) set.deleted_at = p.trashed ? (cur.deleted_at ?? now) : null;
		// unpin on archive/trash: Trash is never in the pinned area (K-PIN), archive keeps it out of the way too
		if (p.archived || p.trashed) set.pinned = 0;
		const cols = Object.keys(set);
		db()
			.prepare(`UPDATE keep_notes SET ${[...cols.map((c) => `${c} = @${c}`), 'updated_at = @now', 'revision = revision + 1'].join(', ')} WHERE id = @id`)
			.run({ ...set, now, id }); // prettier-ignore
		writeParts(ownerId, id, p);
		reindex(ownerId, id);
		return get(ownerId, id);
	});
}

/** permanent delete: only from Trash (K-TRASH: explicit second step). Files stay if used elsewhere. */
export function destroy(ownerId: string, id: string): void {
	txImmediate(() => {
		const cur = own(ownerId, id);
		if (!cur.deleted_at) bad('Move the note to Trash first.', 'not_in_trash');
		attachments.dropRefs('keep_note', id);
		fts.unindex('note', id);
		db().prepare(`DELETE FROM keep_notes WHERE id = ?`).run(id);
	});
}

export function duplicate(ownerId: string, id: string): NoteDTO {
	const n = get(ownerId, id);
	const map = new Map<string, string>();
	const items = n.items.map((i) => {
		const nid = newId('kci');
		map.set(i.id, nid);
		return {
			id: nid,
			text: i.text,
			checked: i.checked,
			parentId: i.parentId ? (map.get(i.parentId) ?? null) : null,
		};
	});
	return create(ownerId, { type: n.type, title: n.title, body: n.body, color: n.color as NoteInput['color'], items, labels: n.labels, binders: n.binders, images: n.images.map((i) => i.id) }); // prettier-ignore
}

/** reorder: put `id` just above `before` (or at the bottom when null), in the main list or inside a binder */
export function move(ownerId: string, id: string, before: string | null, binder?: string): void {
	txImmediate(() => {
		own(ownerId, id);
		const t = binder ? 'keep_note_binders' : 'keep_notes';
		const keyCol = binder ? 'note_id' : 'id';
		const scopeSql = binder ? 'binder_id = ?' : 'owner_id = ?';
		const scopeArg = binder ?? ownerId;
		if (binder) mine('keep_binders', ownerId, [binder]);
		const pos = (nid: string) => (db().prepare(`SELECT position AS p FROM ${t} WHERE ${keyCol} = ? AND ${scopeSql}`).get(nid, scopeArg) as { p: number } | undefined)?.p; // prettier-ignore
		let p: number;
		if (before) {
			const b = pos(before);
			if (b === undefined) notFound();
			// next one above `before` (higher position = higher in the list)
			const above = (db().prepare(`SELECT min(position) AS p FROM ${t} WHERE ${scopeSql} AND position > ? AND ${keyCol} <> ?`).get(scopeArg, b, id) as { p: number | null }).p; // prettier-ignore
			p = above === null ? (b as number) + 1 : ((b as number) + above) / 2;
		} else {
			p = ((db().prepare(`SELECT min(position) AS p FROM ${t} WHERE ${scopeSql}`).get(scopeArg) as { p: number | null }).p ?? 0) - 1; // prettier-ignore
		}
		db().prepare(`UPDATE ${t} SET position = ? WHERE ${keyCol} = ? AND ${scopeSql}`).run(p, id, scopeArg);
		if (!binder) db().prepare(`UPDATE keep_notes SET updated_at = ?, revision = revision + 1 WHERE id = ?`).run(nowUtcIso(), id);
	});
} // prettier-ignore

// ---------- labels + binders ----------
const zName = z.string().trim().min(1, 'Name needed').max(60);
export const nameSchema = z.object({ name: zName }).strict();

export function labels(ownerId: string): LabelDTO[] {
	return db()
		.prepare(`SELECT l.id, l.name, (SELECT count(*) FROM keep_note_labels nl JOIN keep_notes n ON n.id = nl.note_id WHERE nl.label_id = l.id AND n.deleted_at IS NULL) AS count FROM keep_labels l WHERE l.owner_id = ? ORDER BY l.name COLLATE NOCASE`)
		.all(ownerId) as LabelDTO[]; // prettier-ignore
}
export function binders(ownerId: string): BinderDTO[] {
	return db()
		.prepare(`SELECT b.id, b.name, (SELECT count(*) FROM keep_note_binders nb JOIN keep_notes n ON n.id = nb.note_id WHERE nb.binder_id = b.id AND n.deleted_at IS NULL) AS count FROM keep_binders b WHERE b.owner_id = ? ORDER BY b.position`)
		.all(ownerId) as BinderDTO[]; // prettier-ignore
}
const nameTaken = (e: unknown) => e instanceof Error && /UNIQUE/.test(e.message);

export function createLabel(ownerId: string, name: string): LabelDTO {
	const id = newId('kl');
	try {
		db().prepare(`INSERT INTO keep_labels (id, owner_id, name, position, created_at) VALUES (?, ?, ?, 0, ?)`).run(id, ownerId, name, nowUtcIso()); // prettier-ignore
	} catch (e) {
		if (nameTaken(e)) bad('You already have that label.', 'taken');
		throw e;
	}
	return { id, name, count: 0 };
}
export function renameLabel(ownerId: string, id: string, name: string): void {
	try {
		if (
			!db().prepare(`UPDATE keep_labels SET name = ? WHERE id = ? AND owner_id = ?`).run(name, id, ownerId)
				.changes
		)
			notFound();
	} catch (e) {
		if (nameTaken(e)) bad('You already have that label.', 'taken');
		throw e;
	}
}
/** delete a label: notes stay, they just lose it (K-LABEL) */
export function deleteLabel(ownerId: string, id: string): void {
	if (!db().prepare(`DELETE FROM keep_labels WHERE id = ? AND owner_id = ?`).run(id, ownerId).changes)
		notFound();
}

export function createBinder(ownerId: string, name: string): BinderDTO {
	const id = newId('kb');
	const now = nowUtcIso();
	db().prepare(`INSERT INTO keep_binders (id, owner_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
		.run(id, ownerId, name, maxPos(`SELECT max(position) AS m FROM keep_binders WHERE owner_id = ?`, ownerId), now, now); // prettier-ignore
	return { id, name, count: 0 };
}
export function renameBinder(ownerId: string, id: string, name: string): void {
	if (!db().prepare(`UPDATE keep_binders SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?`).run(name, nowUtcIso(), id, ownerId).changes) notFound(); // prettier-ignore
}
/** delete a binder: notes stay (K-BINDER) */
export function deleteBinder(ownerId: string, id: string): void {
	if (!db().prepare(`DELETE FROM keep_binders WHERE id = ? AND owner_id = ?`).run(id, ownerId).changes)
		notFound();
}
export function reorderBinders(ownerId: string, ids: string[]): void {
	txImmediate(() => {
		const all = binders(ownerId).map((b) => b.id);
		if (ids.length !== all.length || ids.some((i) => !all.includes(i))) bad('send every binder id once');
		ids.forEach((id, i) => db().prepare(`UPDATE keep_binders SET position = ? WHERE id = ?`).run(i, id));
	});
}

/** D-17: notes in Trash for 30 days are deleted for good */
export function purgeTrash(now: number = Date.now()): void {
	const cut = nowUtcIso(now - TRASH_DAYS * 86_400_000);
	for (const r of db().prepare(`SELECT id FROM keep_notes WHERE deleted_at IS NOT NULL AND deleted_at < ?`).all(cut) as { id: string }[]) {
		attachments.dropRefs('keep_note', r.id);
		fts.unindex('note', r.id);
		db().prepare(`DELETE FROM keep_notes WHERE id = ?`).run(r.id);
	}
} // prettier-ignore
