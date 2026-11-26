// v4.0 PR 17: duplicate a page the viewer can read. Same parent (when it is the copier's), icon and blocks with
// new block ids; database blocks copy their schema only (no records); child pages are not copied; no shares.
import { handle } from '../db';
import { newId } from '../crypto';
import { nowUtcIso } from '$lib/time';
import type { PageDTO } from '$lib/types';
import * as pages from './pages';
import * as databases from './databases';
import { notFound } from '../http';

type Node = { type: string; attrs?: { databaseId?: string } };

export function duplicatePage(meId: string, ownerId: string, sourceId: string): PageDTO {
	const src = pages.get(ownerId, sourceId, false, meId); // doc + title/icon; never bump the source's last-opened
	const row = handle()
		.sqlite.prepare(
			'SELECT parent_page_id AS pid, position AS pos, icon FROM pages WHERE id = ? AND owner_id = ?',
		)
		.get(sourceId, ownerId) as { pid: string | null; pos: number; icon: string | null } | undefined;
	if (!row) return notFound();
	// same parent only when the copier owns a live page there; otherwise top level
	let parentId: string | null = null;
	if (row.pid) {
		const p = handle()
			.sqlite.prepare('SELECT id FROM pages WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
			.get(row.pid, meId);
		if (p) parentId = row.pid;
	}
	const db = handle().sqlite;
	let position: number;
	if (parentId === row.pid) {
		const next = db
			.prepare(
				'SELECT min(position) AS p FROM pages WHERE owner_id = ? AND parent_page_id IS ? AND position > ? AND id <> ? AND deleted_at IS NULL',
			)
			.get(meId, parentId, row.pos, sourceId) as { p: number | null };
		position = next.p === null ? row.pos + 1 : (row.pos + next.p) / 2;
	} else {
		const max = db
			.prepare('SELECT max(position) AS m FROM pages WHERE owner_id = ? AND parent_page_id IS NULL')
			.get(meId) as { m: number | null };
		position = (max.m ?? 0) + 1;
	}
	const id = newId('pg');
	const now = nowUtcIso();
	const title = `Copy of ${src.title.trim() || 'Untitled'}`.slice(0, 300);
	db.prepare(
		`INSERT INTO pages (id, owner_id, parent_page_id, title, icon, position, created_at, updated_at, created_by, updated_by, last_opened_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(id, meId, parentId, title, row.icon, position, now, now, meId, meId, now);
	// copy the blocks; a database block gets a fresh schema and a rewritten databaseId
	const doc = structuredClone(src.doc) as { type: 'doc'; content: Node[] };
	for (const node of doc.content) {
		if (node.type === 'database' && node.attrs?.databaseId) {
			node.attrs.databaseId = databases.cloneSchema(ownerId, meId, node.attrs.databaseId, id);
		}
	}
	pages.update(meId, id, { doc }); // new page_blocks ids, page_links + search rebuilt, my attachments referenced
	return pages.get(meId, id, false);
}
