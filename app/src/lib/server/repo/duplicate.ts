// Page ⋯ Duplicate (BREAKDOWN PR 17, DESIGN §2.6, O-3, D-V4-23). One transaction: the new page, its blocks with
// new ids, page_links rebuilt from the doc, and database blocks copied as schema only (properties + views, no records).
// No child pages, shares, pins or comments; no journal row - Undo trashes the copy through DELETE /api/pages/:id.
import { txImmediate } from '../db';
import * as pages from './pages';
import * as databases from './databases';
import { level } from './shares';
import { notFound } from '../http';
import type { PageDTO } from '$lib/types';

type Node = { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };

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
		const title = cutTitle(`Copy of ${src.title || 'Untitled'}`);
		const parentId = mine ? src.parentId : null;
		const doc = structuredClone(src.doc) as unknown as Node & { type: 'doc'; content: unknown[] };
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
