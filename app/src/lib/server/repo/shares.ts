// Page + Keep note shares (DESIGN §14, FEATURES §7–8). Closed decisions: D-01 explicit only (subpages are NOT
// shared) · D-02 a link opens only if the target is shared too · D-03 a shared page shares its whole database +
// record pages · D-04 no public links. All checks here, server side. No access = 404 (an id is never proof).
// View can't write (403 once they can see it). Edit can't re-share, move, archive or delete.
import { z } from 'zod';
import { handle } from '../db';
import { newId } from '../crypto';
import { ApiFail, bad, notFound } from '../http';
import { nowUtcIso } from '$lib/time';

const db = () => handle().sqlite;
export type Kind = 'page' | 'note';
export type Access = 'owner' | 'edit' | 'view';
const RANK: Record<Access, number> = { view: 1, edit: 2, owner: 3 };
const T = {
	page: { tbl: 'page_shares', col: 'page_id', src: 'pages' },
	note: { tbl: 'keep_note_shares', col: 'note_id', src: 'keep_notes' },
} as const;

/** who owns it and what `userId` may do with it; null = nothing (missing, trashed, not shared) */
export function level(kind: Kind, userId: string, id: string): { ownerId: string; access: Access } | null {
	const t = T[kind];
	const r = db().prepare(`SELECT owner_id, deleted_at FROM ${t.src} WHERE id = ?`).get(id) as { owner_id: string; deleted_at: string | null } | undefined; // prettier-ignore
	if (!r || r.deleted_at) return null;
	if (r.owner_id === userId) return { ownerId: r.owner_id, access: 'owner' };
	const s = db().prepare(`SELECT permission FROM ${t.tbl} WHERE ${t.col} = ? AND grantee_id = ?`).get(id, userId) as { permission: 'view' | 'edit' } | undefined; // prettier-ignore
	if (s) return { ownerId: r.owner_id, access: s.permission };
	if (kind === 'page') {
		// D-03: a record's page follows the page its database sits on
		const h = db().prepare(`SELECT d.page_id FROM database_records r JOIN page_databases d ON d.id = r.database_id WHERE r.page_id = ?`).get(id) as { page_id: string } | undefined; // prettier-ignore
		if (h && h.page_id !== id) return level('page', userId, h.page_id);
	}
	return null;
}
export const accessOf = (kind: Kind, userId: string, id: string): Access | null =>
	level(kind, userId, id)?.access ?? null;

/** the owner id to run the owner-scoped repo with, if `userId` has at least `min`; else 404 / 403 */
export function need(kind: Kind, userId: string, id: string, min: Access = 'view'): string {
	const a = level(kind, userId, id);
	if (!a) return notFound();
	if (RANK[a.access] < RANK[min])
		throw new ApiFail(403, 'read_only', min === 'owner' ? 'Only the owner can do that.' : 'You can view this, not edit it.'); // prettier-ignore
	return a.ownerId;
}

/** database access = access to the page it sits on (D-03) */
export function needDb(userId: string, dbId: string, min: Access = 'view'): string {
	const h = db().prepare(`SELECT page_id FROM page_databases WHERE id = ?`).get(dbId) as { page_id: string } | undefined; // prettier-ignore
	if (!h) return notFound();
	return need('page', userId, h.page_id, min);
}
export function needRecord(userId: string, recordId: string, min: Access = 'view'): string {
	const r = db().prepare(`SELECT database_id FROM database_records WHERE id = ?`).get(recordId) as { database_id: string } | undefined; // prettier-ignore
	if (!r) return notFound();
	return needDb(userId, r.database_id, min);
}

// ---------- managing shares (owner only) ----------
export const shareSchema = z
	.object({ username: z.string().trim().min(1).max(64), permission: z.enum(['view', 'edit']) })
	.strict();
export type ShareDTO = { id: string; username: string; name: string; permission: 'view' | 'edit' };

export function list(kind: Kind, userId: string, id: string): ShareDTO[] {
	need(kind, userId, id, 'owner');
	const t = T[kind];
	return db()
		.prepare(`SELECT s.id, u.username, u.display_name AS name, s.permission FROM ${t.tbl} s JOIN users u ON u.id = s.grantee_id WHERE s.${t.col} = ? ORDER BY s.created_at`)
		.all(id) as ShareDTO[]; // prettier-ignore
}

/** add someone, or change what they can do (one row per person) */
export function put(kind: Kind, userId: string, id: string, p: z.infer<typeof shareSchema>): ShareDTO[] {
	need(kind, userId, id, 'owner');
	const g = db().prepare(`SELECT id FROM users WHERE username = ?`).get(p.username) as { id: string } | undefined; // prettier-ignore
	if (!g) return bad('No one here has that username.', 'unknown_user');
	if (g.id === userId) bad("That's you. You already own it.", 'self');
	const t = T[kind];
	db()
		.prepare(`INSERT INTO ${t.tbl} (id, ${t.col}, owner_id, grantee_id, permission, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(${t.col}, grantee_id) DO UPDATE SET permission = excluded.permission`)
		.run(newId('shr'), id, userId, g.id, p.permission, nowUtcIso()); // prettier-ignore
	return list(kind, userId, id);
}

/** revoke: the row goes; the next request from them is denied */
export function revoke(kind: Kind, userId: string, id: string, shareId: string): ShareDTO[] {
	need(kind, userId, id, 'owner');
	const t = T[kind];
	if (!db().prepare(`DELETE FROM ${t.tbl} WHERE id = ? AND ${t.col} = ?`).run(shareId, id).changes)
		notFound();
	return list(kind, userId, id);
}

/** "Shared with me": live pages + notes others gave me */
export function sharedWithMe(userId: string) {
	const pages = db()
		.prepare(`SELECT p.id, p.title, p.icon, s.permission, u.display_name AS owner FROM page_shares s JOIN pages p ON p.id = s.page_id JOIN users u ON u.id = p.owner_id WHERE s.grantee_id = ? AND p.deleted_at IS NULL ORDER BY p.title COLLATE NOCASE`)
		.all(userId) as { id: string; title: string; icon: string | null; permission: 'view' | 'edit'; owner: string }[]; // prettier-ignore
	const notes = db()
		.prepare(`SELECT n.id, s.permission, u.display_name AS owner FROM keep_note_shares s JOIN keep_notes n ON n.id = s.note_id JOIN users u ON u.id = n.owner_id WHERE s.grantee_id = ? AND n.deleted_at IS NULL ORDER BY n.updated_at DESC`)
		.all(userId) as { id: string; permission: 'view' | 'edit'; owner: string }[]; // prettier-ignore
	return { pages, notes };
}
