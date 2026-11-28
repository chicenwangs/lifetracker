// Page ⋯ Duplicate (BREAKDOWN PR 17, DESIGN §2.6, O-3, D-V4-23). One transaction: the new page, its blocks with
// new ids, page_links rebuilt from the doc, and database blocks copied as schema only (properties + views, no records).
// No child pages, shares, pins or comments; no journal row - Undo trashes the copy through DELETE /api/pages/:id.
import { txImmediate } from '../db';
import * as pages from './pages';
import * as databases from './databases';
import * as attachments from '../attachments';
import { level } from './shares';
import { bad, notFound } from '../http';
import type { PageDTO } from '$lib/types';

type Node = { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };

/** D-V4-23: only images the duplicator owns survive a copy; a foreign file would be a broken node */
function stripImages(n: unknown, keep: Set<string>): void {
	const node = n as Node;
	if (!node?.content) return;
	node.content = node.content.filter((c) => {
		const child = c as Node;
		if (child?.type !== 'image') return true;
		const id = /att_[0-9a-z]{16}/.exec(String(child.attrs?.src ?? ''))?.[0];
		return !!id && keep.has(id);
	});
	for (const c of node.content) stripImages(c, keep);
}

function databaseIds(n: unknown, out = new Set<string>()): Set<string> {
	const node = n as Node;
	if (node?.type === 'database' && typeof node.attrs?.databaseId === 'string') out.add(node.attrs.databaseId);
	for (const c of node?.content ?? []) databaseIds(c, out);
	return out;
}

function useDatabases(n: unknown, ids: Map<string, string>): void {
	const node = n as Node;
	if (node?.type === 'database') {
		const old = node.attrs?.databaseId;
		const copy = typeof old === 'string' ? ids.get(old) : undefined;
		if (copy) node.attrs = { ...node.attrs, databaseId: copy };
	}
	for (const c of node?.content ?? []) useDatabases(c, ids);
}

/** ≤ 300 code points (the SQLite CHECK) and ≤ 300 UTF-16 units (patchSchema's max), never splitting an emoji */
function cutTitle(s: string): string {
	let out = '';
	for (const c of s) {
		if (out.length + c.length > 300) break;
		out += c;
	}
	return out;
}

/**
 * Copy the page `sourceId` into the viewer's own account as "Copy of <title>".
 * Same parent and directly below the source when it is mine; a shared page's copy goes to my root.
 */
export function duplicate(viewerId: string, sourceId: string): PageDTO {
	const access = level('page', viewerId, sourceId) ?? notFound();
	const mine = access.ownerId === viewerId;
	return txImmediate(() => {
		const src = pages.get(access.ownerId, sourceId, false, viewerId);
		// hidden in the UI; the API refuses them too (no archived pages, no database records copied as pages)
		if (src.archived) bad('Restore the page first.', 'archived');
		if (databases.isRecordPage(sourceId)) bad("A database record's page can't be copied.", 'record_page');
		const title = cutTitle(`Copy of ${src.title || 'Untitled'}`);
		const parentId = mine ? src.parentId : null;
		const doc = structuredClone(src.doc) as unknown as Node & { type: 'doc'; content: unknown[] };
		const atts = [...new Set(JSON.stringify(doc).match(/att_[0-9a-z]{16}/g) ?? [])];
		stripImages(doc, attachments.ownedBy(viewerId, atts));
		const copy = pages.create(viewerId, { parentId, title });
		const ids = new Map<string, string>();
		for (const old of databaseIds(doc)) ids.set(old, databases.copySchema(viewerId, old, copy.id));
		useDatabases(doc, ids);
		const page = pages.update(viewerId, copy.id, { icon: src.icon, doc });
		if (mine) {
			const sibs = pages.tree(viewerId).filter((n) => n.parentId === parentId && n.id !== copy.id);
			const i = sibs.findIndex((n) => n.id === sourceId);
			pages.move(viewerId, copy.id, parentId, i >= 0 ? (sibs[i + 1]?.id ?? null) : null);
		}
		return page;
	});
}
