// One FTS5 index for Keep notes + Pages (DESIGN §9). Updated in the same transaction as the source write.
// Index ≠ permission: every query is scoped to owner_id here, and callers open results through owner-scoped repos.
import { handle } from './db';

export type Kind = 'note' | 'page';
const db = () => handle().sqlite;

export function unindex(kind: Kind, refId: string): void {
	db().prepare(`DELETE FROM content_search WHERE kind = ? AND ref_id = ?`).run(kind, refId);
}
/** upsert; `archived` rows are hidden unless asked for. Trashed things are unindexed instead. */
export function index(
	ownerId: string,
	kind: Kind,
	refId: string,
	title: string,
	body: string,
	archived = false,
): void {
	unindex(kind, refId);
	db()
		.prepare(
			`INSERT INTO content_search (owner_id, kind, ref_id, archived, title, body) VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.run(ownerId, kind, refId, archived ? 1 : 0, title, body);
}

export interface Hit {
	kind: Kind;
	id: string;
	title: string;
	snippet: string;
	archived: boolean;
}
/** words -> prefix query, every word must match ("rest pla" finds "Restaurant plan"); FTS syntax never reaches MATCH */
const toMatch = (q: string) =>
	q
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
		.slice(0, 8)
		.map((w) => `"${w}"*`)
		.join(' ');

export function search(
	ownerId: string,
	q: string,
	o: { kinds?: Kind[]; includeArchived?: boolean; limit?: number } = {},
): Hit[] {
	const m = toMatch(q);
	if (!m) return [];
	const kinds = o.kinds ?? ['note', 'page'];
	const rows = db()
		.prepare(
			`SELECT kind, ref_id, archived, title, snippet(content_search, 5, '', '', '…', 12) AS snip
			 FROM content_search WHERE content_search MATCH ? AND owner_id = ?
			 AND kind IN (${kinds.map(() => '?').join(',')}) ${o.includeArchived ? '' : 'AND archived = 0'}
			 ORDER BY rank LIMIT ?`,
		)
		.all(m, ownerId, ...kinds, Math.min(o.limit ?? 20, 50)) as { kind: Kind; ref_id: string; archived: number; title: string; snip: string }[]; // prettier-ignore
	return rows.map((r) => ({
		kind: r.kind,
		id: r.ref_id,
		title: r.title,
		snippet: r.snip,
		archived: !!r.archived,
	}));
}

/** plain text of a Tiptap JSON doc / node list, for the index */
export function textOf(node: unknown): string {
	if (!node || typeof node !== 'object') return '';
	const n = node as { text?: string; content?: unknown[]; attrs?: { title?: string; alt?: string } };
	const own = n.text ?? n.attrs?.alt ?? '';
	return [own, ...(n.content ?? []).map(textOf)].filter(Boolean).join(' ');
}

/** admin "rebuild index" and the seed import: re-index everything one owner has */
export function rebuildFts(ownerId: string): void {
	db().transaction(() => {
		db().prepare(`DELETE FROM content_search WHERE owner_id = ?`).run(ownerId);
		const notes = db().prepare(`SELECT n.id, n.title, n.body, n.archived_at, (SELECT group_concat(text, ' ') FROM keep_checklist_items i WHERE i.note_id = n.id) AS items FROM keep_notes n WHERE n.owner_id = ? AND n.deleted_at IS NULL`).all(ownerId) as { id: string; title: string; body: string; archived_at: string | null; items: string | null }[]; // prettier-ignore
		for (const n of notes)
			index(ownerId, 'note', n.id, n.title, `${n.body} ${n.items ?? ''}`, !!n.archived_at);
		const pages = db().prepare(`SELECT p.id, p.title, p.archived_at FROM pages p WHERE p.owner_id = ? AND p.deleted_at IS NULL`).all(ownerId) as { id: string; title: string; archived_at: string | null }[]; // prettier-ignore
		for (const p of pages) {
			const blocks = db().prepare(`SELECT content_json FROM page_blocks WHERE page_id = ? ORDER BY position`).all(p.id) as { content_json: string }[]; // prettier-ignore
			index(
				ownerId,
				'page',
				p.id,
				p.title,
				blocks.map((b) => textOf(JSON.parse(b.content_json))).join(' '),
				!!p.archived_at,
			);
		}
	})();
}
