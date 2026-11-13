// Pages (FEATURES §6, DESIGN §5–6, ADR-002/003). Owner-scoped. A page = metadata row + one page_blocks row per
// top-level editor node. Save = replace the page's blocks in one transaction (ADR-003 fallback: no stable block ids
// needed), then rebuild page_links + the search index in the same transaction.
import { z } from 'zod';
import { handle, txImmediate } from '../db';
import { newId } from '../crypto';
import { ApiFail, bad, notFound } from '../http';
import * as fts from '../search';
import * as attachments from '../attachments';
import { accessOf } from './shares';
import { nowUtcIso } from '$lib/time';
import type { PageDTO, PageNode } from '$lib/types';

export const MAX_PINS = 3;
export const TRASH_DAYS = 30; // D-18
export const SUGGEST_DAYS = 90; // PG-1b
const MAX_DOC_BYTES = 1_000_000;

const db = () => handle().sqlite;
type Row = { id: string; owner_id: string; parent_page_id: string | null; title: string; icon: string | null; position: number; archived_at: string | null; archived_batch: string | null; last_opened_at: string | null; deleted_at: string | null; deleted_batch: string | null; created_at: string; updated_at: string; revision: number }; // prettier-ignore

const row = (ownerId: string, id: string): Row | undefined =>
	db().prepare(`SELECT * FROM pages WHERE id = ? AND owner_id = ?`).get(id, ownerId) as Row | undefined;
/** live (not trashed) page of mine, archived ones included: links + graph must still open them */
const own = (ownerId: string, id: string): Row => {
	const r = row(ownerId, id);
	if (!r || r.deleted_at) notFound();
	return r as Row;
};

/** sidebar tree: live, not archived */
export function tree(ownerId: string): PageNode[] {
	return (
		db()
			.prepare(`SELECT id, parent_page_id, title, icon FROM pages WHERE owner_id = ? AND deleted_at IS NULL AND archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM database_records r WHERE r.page_id = pages.id) ORDER BY position`)
			.all(ownerId) as { id: string; parent_page_id: string | null; title: string; icon: string | null }[]
	).map((r) => ({ id: r.id, parentId: r.parent_page_id, title: r.title, icon: r.icon })); // prettier-ignore
}

/** last opened live pages (phone All pages · Recent, wireframe MPages) */
export function recent(ownerId: string, n = 5): { id: string; title: string; lastOpenedAt: string }[] {
	return db()
		.prepare(`SELECT id, title, last_opened_at AS lastOpenedAt FROM pages WHERE owner_id = ? AND deleted_at IS NULL AND archived_at IS NULL AND last_opened_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM database_records r WHERE r.page_id = pages.id) ORDER BY last_opened_at DESC LIMIT ?`)
		.all(ownerId, n) as { id: string; title: string; lastOpenedAt: string }[]; // prettier-ignore
}

/** ids of a page and everything under it (live rows) */
function subtree(ownerId: string, id: string): string[] {
	return (
		db()
			.prepare(`WITH RECURSIVE t(id) AS (SELECT ? UNION ALL SELECT p.id FROM pages p JOIN t ON p.parent_page_id = t.id WHERE p.owner_id = ? AND p.deleted_at IS NULL) SELECT id FROM t`)
			.all(id, ownerId) as { id: string }[]
	).map((r) => r.id); // prettier-ignore
}

// ---------- read ----------
/** viewer = who is looking (default: the owner). A shared viewer only sees crumbs + link titles they could open. */
export function get(ownerId: string, id: string, opened = true, viewer = ownerId): PageDTO {
	const r = own(ownerId, id);
	const sees = (p: string) => viewer === ownerId || !!accessOf('page', viewer, p);
	if (opened && viewer === ownerId)
		db().prepare(`UPDATE pages SET last_opened_at = ? WHERE id = ?`).run(nowUtcIso(), id);
	const blocks = db().prepare(`SELECT content_json FROM page_blocks WHERE page_id = ? ORDER BY position`).all(id) as { content_json: string }[]; // prettier-ignore
	const doc = { type: 'doc' as const, content: blocks.map((b) => JSON.parse(b.content_json) as unknown) };
	// breadcrumbs: parents up to the root
	const crumbs: { id: string; title: string }[] = [];
	for (let p = r.parent_page_id, n = 0; p && n < 50; n++) {
		const pr = row(ownerId, p);
		if (!pr || pr.deleted_at || !sees(pr.id)) break;
		crumbs.unshift({ id: pr.id, title: pr.title });
		p = pr.parent_page_id;
	}
	// titles for internal links, resolved now (renames show at once). Unknown / not mine / trashed = unavailable.
	const targets = linksIn(doc);
	const links: PageDTO['links'] = {};
	for (const t of targets) {
		const tr = row(ownerId, t);
		links[t] = tr && !tr.deleted_at && sees(t) ? { title: tr.title, archived: !!tr.archived_at } : null;
	}
	return {
		id: r.id,
		parentId: r.parent_page_id,
		title: r.title,
		icon: r.icon,
		archived: !!r.archived_at,
		revision: r.revision,
		updatedAt: r.updated_at,
		createdAt: r.created_at,
		doc,
		crumbs,
		links,
		pinned: !!db().prepare(`SELECT 1 FROM page_shortcuts WHERE user_id = ? AND page_id = ?`).get(viewer, id),
		access: accessOf('page', viewer, id) ?? 'view',
	};
}

// ---------- doc validation (DESIGN §6: only known schemas) ----------
const NODES: Record<string, string[]> = {
	doc: [],
	paragraph: ['textAlign'],
	heading: ['level', 'textAlign'],
	bulletList: [],
	orderedList: ['start', 'type'],
	listItem: [],
	taskList: [],
	taskItem: ['checked'],
	horizontalRule: [],
	blockquote: [],
	codeBlock: ['language'],
	hardBreak: [],
	table: [],
	tableRow: [],
	tableCell: ['colspan', 'rowspan', 'colwidth', 'align'],
	tableHeader: ['colspan', 'rowspan', 'colwidth', 'align'],
	image: ['src', 'alt', 'title', 'width', 'height'],
	pageLink: ['pageId'],
	database: ['databaseId'],
	text: [],
};
const MARKS: Record<string, string[]> = {
	bold: [],
	italic: [],
	underline: [],
	strike: [],
	code: [],
	link: ['href', 'target', 'rel', 'class', 'title'],
};
const SAFE_HREF = /^(https?:\/\/|mailto:|\/api\/attachments\/att_[0-9a-z]+$)/i;

function check(n: unknown, depth: number): void {
	if (depth > 40) bad('Page is nested too deep.');
	if (!n || typeof n !== 'object' || Array.isArray(n)) bad('bad block');
	const node = n as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown; marks?: unknown; text?: unknown };
	const allowed = typeof node.type === 'string' ? NODES[node.type] : undefined;
	if (!allowed) bad(`unknown block type: ${String(node.type).slice(0, 30)}`);
	for (const [k, v] of Object.entries(node.attrs ?? {})) {
		if (!allowed?.includes(k)) bad(`unknown attribute ${k}`);
		if (v !== null && !['string', 'number', 'boolean'].includes(typeof v) && !(k === 'colwidth' && Array.isArray(v))) bad('bad attribute');
	}
	if (node.type === 'image') {
		const { src, alt } = node.attrs ?? {};
		if (typeof src !== 'string' || !/^\/api\/attachments\/att_[0-9a-z]+$/.test(src)) bad('Images must be uploaded files.');
		if (typeof alt !== 'string' || !alt.trim()) bad('Images need alt text.', 'alt_required');
	}
	if (node.type === 'pageLink' && !/^pg_[0-9a-z]+$/.test(String(node.attrs?.pageId ?? ''))) bad('bad page link');
	if (node.type === 'text' && typeof node.text !== 'string') bad('bad text');
	if (node.marks !== undefined) {
		if (!Array.isArray(node.marks)) bad('bad marks');
		for (const m of node.marks as { type?: string; attrs?: Record<string, unknown> }[]) {
			const ma = MARKS[m?.type ?? ''];
			if (!ma) bad(`unknown mark: ${String(m?.type).slice(0, 20)}`);
			for (const k of Object.keys(m.attrs ?? {})) if (!ma?.includes(k)) bad(`unknown attribute ${k}`);
			if (m.type === 'link' && !SAFE_HREF.test(String(m.attrs?.href ?? ''))) bad('Links must start with http(s):// or mailto:.', 'bad_link');
		}
	}
	if (node.content !== undefined) {
		if (!Array.isArray(node.content)) bad('bad content');
		for (const c of node.content as unknown[]) check(c, depth + 1);
	}
} // prettier-ignore

function linksIn(n: unknown, out = new Set<string>()): Set<string> {
	if (!n || typeof n !== 'object') return out;
	const node = n as { type?: string; attrs?: { pageId?: string }; content?: unknown[] };
	if (node.type === 'pageLink' && node.attrs?.pageId) out.add(node.attrs.pageId);
	for (const c of node.content ?? []) linksIn(c, out);
	return out;
}

// ---------- write ----------
export const createSchema = z
	.object({ parentId: z.string().max(40).nullable().default(null), title: z.string().max(300).default('') })
	.strict();
export const patchSchema = z
	.object({
		title: z.string().max(300),
		icon: z.string().max(8).nullable(),
		doc: z.object({ type: z.literal('doc'), content: z.array(z.unknown()).max(5000) }).passthrough(),
		/** optimistic lock (409 on mismatch, DESIGN §18) */
		revision: z.number().int(),
	})
	.partial()
	.strict();

const maxChildPos = (ownerId: string, parentId: string | null) =>
	((db().prepare(`SELECT max(position) AS m FROM pages WHERE owner_id = ? AND parent_page_id IS ?`).get(ownerId, parentId) as { m: number | null }).m ?? 0) + 1; // prettier-ignore

function reindex(ownerId: string, id: string) {
	const r = own(ownerId, id);
	const blocks = db().prepare(`SELECT content_json FROM page_blocks WHERE page_id = ? ORDER BY position`).all(id) as { content_json: string }[]; // prettier-ignore
	fts.index(
		ownerId,
		'page',
		id,
		r.title,
		blocks.map((b) => fts.textOf(JSON.parse(b.content_json))).join(' '),
		!!r.archived_at,
	);
}

export function create(ownerId: string, p: z.infer<typeof createSchema>): PageDTO {
	return txImmediate(() => {
		if (p.parentId) {
			const par = own(ownerId, p.parentId);
			if (par.archived_at) bad('Restore the parent page first.');
		}
		const id = newId('pg');
		const now = nowUtcIso();
		db()
			.prepare(`INSERT INTO pages (id, owner_id, parent_page_id, title, position, created_at, updated_at, created_by, updated_by, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
			.run(id, ownerId, p.parentId, p.title, maxChildPos(ownerId, p.parentId), now, now, ownerId, ownerId, now); // prettier-ignore
		reindex(ownerId, id);
		return get(ownerId, id, false);
	});
}

/** actor = who saves (owner, or someone with an edit share) */
export function update(
	ownerId: string,
	id: string,
	p: z.infer<typeof patchSchema>,
	actor = ownerId,
): PageDTO {
	if (p.doc) {
		if (JSON.stringify(p.doc).length > MAX_DOC_BYTES)
			bad('This page is too big to save (1 MB max). Split it.', 'too_large');
		check(p.doc, 0);
	}
	return txImmediate(() => {
		const cur = own(ownerId, id);
		if (p.revision !== undefined && p.revision !== cur.revision)
			throw new ApiFail(
				409,
				'conflict',
				'This page changed somewhere else. Your text is kept: copy it, then reload.',
			);
		const now = nowUtcIso();
		if (p.doc) {
			db().prepare(`DELETE FROM page_blocks WHERE page_id = ?`).run(id);
			db().prepare(`DELETE FROM page_links WHERE source_page_id = ?`).run(id);
			const ins = db().prepare(`INSERT INTO page_blocks (id, page_id, block_type, position, content_json, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`); // prettier-ignore
			const link = db().prepare(`INSERT OR IGNORE INTO page_links (id, source_page_id, target_page_id, source_block_id, created_at) VALUES (?, ?, ?, ?, ?)`); // prettier-ignore
			(p.doc.content as { type: string }[]).forEach((node, i) => {
				const bid = newId('pbl');
				ins.run(bid, id, node.type, i, JSON.stringify(node), now, now, actor);
				// projection: only links to my own live pages (never reveals or stores anyone else's ids)
				for (const t of linksIn(node))
					if (t !== id && row(ownerId, t) && !row(ownerId, t)?.deleted_at)
						link.run(newId('plk'), id, t, bid, now);
			});
			// files in the doc are referenced by the page: kept from GC, readable by whoever can read the page
			const atts = new Set(JSON.stringify(p.doc).match(/att_[0-9a-z]{16}/g) ?? []);
			attachments.syncRefs('page_block', id, ownerId, [...atts], [ownerId, actor]);
		}
		const set: string[] = ['updated_at = @now', 'updated_by = @me', 'revision = revision + 1'];
		if (p.title !== undefined) set.push('title = @title');
		if (p.icon !== undefined) set.push('icon = @icon');
		db().prepare(`UPDATE pages SET ${set.join(', ')} WHERE id = @id`).run({ now, me: actor, title: p.title ?? null, icon: p.icon ?? null, id }); // prettier-ignore
		reindex(ownerId, id);
		return get(ownerId, id, false);
	});
}

/** move under a new parent (null = root), placed above `before` or at the end. No self-parent, no move under a descendant. */
export function move(
	ownerId: string,
	id: string,
	parentId: string | null,
	before: string | null = null,
): void {
	txImmediate(() => {
		own(ownerId, id);
		if (parentId) {
			if (subtree(ownerId, id).includes(parentId))
				bad("A page can't go inside itself or its own subpages.", 'cycle');
			if (own(ownerId, parentId).archived_at) bad('Restore that page first.');
		}
		let pos: number;
		if (before) {
			const b = own(ownerId, before);
			if (b.parent_page_id !== parentId) bad('before must be a sibling');
			const prev = (db().prepare(`SELECT max(position) AS p FROM pages WHERE owner_id = ? AND parent_page_id IS ? AND position < ? AND id <> ?`).get(ownerId, parentId, b.position, id) as { p: number | null }).p; // prettier-ignore
			pos = prev === null ? b.position - 1 : (prev + b.position) / 2;
		} else pos = maxChildPos(ownerId, parentId);
		db()
			.prepare(`UPDATE pages SET parent_page_id = ?, position = ?, updated_at = ? WHERE id = ?`)
			.run(parentId, pos, nowUtcIso(), id);
	});
}

/** rows touched by archive/trash of a page (for the undo journal): it + live subpages */
export const subtreeTargets = (ownerId: string, id: string) =>
	subtree(ownerId, id).map((p) => ({ t: 'pages' as const, id: p }));

/** archive a page + all subpages (one batch). Pins for them go, the graph keeps them. */
export function archive(ownerId: string, id: string): { count: number; unpinned: number } {
	return txImmediate(() => {
		const r = own(ownerId, id);
		if (r.archived_at) return { count: 0, unpinned: 0 };
		const ids = subtree(ownerId, id).filter((p) => !row(ownerId, p)?.archived_at);
		const batch = newId('arc');
		const now = nowUtcIso();
		const q = ids.map(() => '?').join(',');
		db()
			.prepare(`UPDATE pages SET archived_at = ?, archived_batch = ?, updated_at = ? WHERE id IN (${q})`)
			.run(now, batch, now, ...ids);
		const unpinned = db()
			.prepare(`DELETE FROM page_shortcuts WHERE page_id IN (${q})`)
			.run(...ids).changes;
		for (const p of ids) reindex(ownerId, p);
		return { count: ids.length, unpinned };
	});
}

/** restore an archived page (+ the subpages archived with it). Back to its old parent, or root if that is gone/archived. */
export function restoreArchived(ownerId: string, id: string): number {
	return txImmediate(() => {
		const r = own(ownerId, id);
		if (!r.archived_batch) return 0;
		const ids = (db().prepare(`SELECT id FROM pages WHERE owner_id = ? AND archived_batch = ? AND deleted_at IS NULL`).all(ownerId, r.archived_batch) as { id: string }[]).map((x) => x.id); // prettier-ignore
		const now = nowUtcIso();
		for (const p of ids) db().prepare(`UPDATE pages SET archived_at = NULL, archived_batch = NULL, updated_at = ? WHERE id = ?`).run(now, p);
		const par = r.parent_page_id ? row(ownerId, r.parent_page_id) : undefined;
		if (r.parent_page_id && (!par || par.deleted_at || par.archived_at))
			db().prepare(`UPDATE pages SET parent_page_id = NULL, position = ? WHERE id = ?`).run(maxChildPos(ownerId, null), id);
		for (const p of ids) reindex(ownerId, p);
		return ids.length;
	});
} // prettier-ignore

/** Trash (D-18): page + subpages, restorable 30 days, then gone. Never one ambiguous click: the UI confirms. */
export function trash(ownerId: string, id: string): { batch: string; count: number } {
	return txImmediate(() => {
		own(ownerId, id);
		const ids = subtree(ownerId, id);
		const batch = newId('del');
		const now = nowUtcIso();
		const q = ids.map(() => '?').join(',');
		db()
			.prepare(`UPDATE pages SET deleted_at = ?, deleted_batch = ?, updated_at = ? WHERE id IN (${q})`)
			.run(now, batch, now, ...ids);
		db()
			.prepare(`DELETE FROM page_shortcuts WHERE page_id IN (${q})`)
			.run(...ids);
		for (const p of ids) fts.unindex('page', p);
		return { batch, count: ids.length };
	});
}
export function restoreTrashed(ownerId: string, batch: string): number {
	return txImmediate(() => {
		const ids = (db().prepare(`SELECT id, parent_page_id FROM pages WHERE owner_id = ? AND deleted_batch = ?`).all(ownerId, batch) as { id: string; parent_page_id: string | null }[]); // prettier-ignore
		if (!ids.length) notFound();
		for (const p of ids) {
			db().prepare(`UPDATE pages SET deleted_at = NULL, deleted_batch = NULL WHERE id = ?`).run(p.id);
			const par = p.parent_page_id ? row(ownerId, p.parent_page_id) : undefined;
			if (p.parent_page_id && (!par || par.deleted_at)) db().prepare(`UPDATE pages SET parent_page_id = NULL WHERE id = ?`).run(p.id);
		}
		for (const p of ids) reindex(ownerId, p.id);
		return ids.length;
	});
} // prettier-ignore
export function trashed(ownerId: string) {
	return db()
		.prepare(`SELECT deleted_batch AS batch, min(deleted_at) AS deletedAt, count(*) AS count, (SELECT title FROM pages q WHERE q.deleted_batch = p.deleted_batch AND (q.parent_page_id IS NULL OR q.parent_page_id NOT IN (SELECT id FROM pages r WHERE r.deleted_batch = p.deleted_batch)) LIMIT 1) AS title FROM pages p WHERE owner_id = ? AND deleted_at IS NOT NULL GROUP BY deleted_batch ORDER BY deletedAt DESC`)
		.all(ownerId) as { batch: string; deletedAt: string; count: number; title: string }[]; // prettier-ignore
}
export function purgeTrash(now: number = Date.now()): void {
	const cut = nowUtcIso(now - TRASH_DAYS * 86_400_000);
	const ids = db()
		.prepare(`SELECT id FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < ?`)
		.all(cut) as { id: string }[];
	for (const r of ids) {
		fts.unindex('page', r.id);
		attachments.dropRefs('page_block', r.id);
	}
	db().prepare(`DELETE FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < ?`).run(cut);
}

/** Archive view: every archived page + "was in" path + link count; suggestions = live pages not opened in 90+ days */
export function archived(ownerId: string) {
	const rows = db()
		.prepare(`SELECT p.id, p.title, p.archived_at AS archivedAt, p.last_opened_at AS lastOpenedAt, p.parent_page_id AS parentId, (SELECT count(*) FROM page_links l WHERE l.target_page_id = p.id) AS links FROM pages p WHERE p.owner_id = ? AND p.deleted_at IS NULL AND p.archived_at IS NOT NULL ORDER BY p.archived_at DESC`)
		.all(ownerId) as { id: string; title: string; archivedAt: string; lastOpenedAt: string | null; parentId: string | null; links: number }[]; // prettier-ignore
	return rows.map((r) => ({ ...r, wasIn: r.parentId ? (row(ownerId, r.parentId)?.title ?? '') : '' }));
}
export function suggestions(ownerId: string, now: number = Date.now()) {
	return db()
		.prepare(`SELECT id, title, COALESCE(last_opened_at, created_at) AS lastOpenedAt FROM pages WHERE owner_id = ? AND deleted_at IS NULL AND archived_at IS NULL AND COALESCE(last_opened_at, created_at) < ? ORDER BY lastOpenedAt LIMIT 50`)
		.all(ownerId, nowUtcIso(now - SUGGEST_DAYS * 86_400_000)) as { id: string; title: string; lastOpenedAt: string }[]; // prettier-ignore
}

/** link picker / Ctrl+K: my live pages whose title matches (archived ones marked) */
export function findByTitle(ownerId: string, q: string, limit = 10) {
	const like = `%${q.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
	return db()
		.prepare(`SELECT id, title, archived_at IS NOT NULL AS archived FROM pages WHERE owner_id = ? AND deleted_at IS NULL AND title LIKE ? ESCAPE '\\' ORDER BY archived_at IS NOT NULL, last_opened_at DESC LIMIT ?`)
		.all(ownerId, like, limit) as { id: string; title: string; archived: number }[]; // prettier-ignore
}

// ---------- pins (FEATURES §2, D-20: title = page title) ----------
export function pins(userId: string): { id: string; title: string }[] {
	return db()
		.prepare(`SELECT p.id, p.title FROM page_shortcuts s JOIN pages p ON p.id = s.page_id WHERE s.user_id = ? AND p.owner_id = ? AND p.deleted_at IS NULL AND p.archived_at IS NULL ORDER BY s.slot`)
		.all(userId, userId) as { id: string; title: string }[]; // prettier-ignore
}
/** full list in order (PUT): delete + insert in one txn so slot swaps never clash */
export function setPins(userId: string, ids: string[]): void {
	if (ids.length > MAX_PINS) bad(`You can pin ${MAX_PINS} pages. Unpin one first.`, 'pin_cap');
	txImmediate(() => {
		for (const id of ids) if (own(userId, id).archived_at) bad('Archived pages cannot be pinned.');
		db().prepare(`DELETE FROM page_shortcuts WHERE user_id = ?`).run(userId);
		const now = nowUtcIso();
		[...new Set(ids)].forEach((id, i) => db().prepare(`INSERT INTO page_shortcuts (user_id, page_id, slot, created_at) VALUES (?, ?, ?, ?)`).run(userId, id, i, now)); // prettier-ignore
	});
}
