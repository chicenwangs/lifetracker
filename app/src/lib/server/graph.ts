// Knowledge graph read model (DESIGN §10, FEATURES PG-GRAPH). Built on request from pages + page_links; never stored.
// Only my live pages (archived ones included, flagged). Edges to anything I can't see are dropped: no id, title or count.
import { handle } from './db';
import * as shares from './repo/shares';
import type { GraphDTO } from '$lib/types';
import { nowUtcIso } from '$lib/time';

export const MAX_NODES = 5000; // DESIGN §10 target; past this the client offers the local graph

export function graph(ownerId: string): GraphDTO {
	const db = handle().sqlite;
	const nodes = db
		.prepare(
			`SELECT p.id, p.title, p.icon, p.parent_page_id AS parentId, p.archived_at IS NOT NULL AS archived,
			        EXISTS (SELECT 1 FROM database_records r WHERE r.page_id = p.id) AS record
			 FROM pages p WHERE p.owner_id = ? AND p.deleted_at IS NULL ORDER BY p.last_opened_at DESC LIMIT ?`,
		)
		.all(ownerId, MAX_NODES) as {
		id: string;
		title: string;
		parentId: string | null;
		archived: number;
		icon: string | null;
		record: number;
	}[];
	const ids = new Set(nodes.map((n) => n.id));
	const edges: GraphDTO['edges'] = [];
	for (const n of nodes)
		if (n.parentId && ids.has(n.parentId))
			edges.push({ source: n.parentId, target: n.id, relation: 'parent' });
	const links = db
		.prepare(`SELECT DISTINCT l.source_page_id AS s, l.target_page_id AS t FROM page_links l JOIN pages p ON p.id = l.source_page_id WHERE p.owner_id = ?`)
		.all(ownerId) as { s: string; t: string }[]; // prettier-ignore
	for (const l of links)
		if (ids.has(l.s) && ids.has(l.t) && l.s !== l.t)
			edges.push({ source: l.s, target: l.t, relation: 'link' });
	return {
		nodes: nodes.map((n) => ({ id: n.id, title: n.title, icon: n.icon, kind: n.record ? 'record' : 'page', archived: !!n.archived, parentId: n.parentId && ids.has(n.parentId) ? n.parentId : null })), // prettier-ignore
		edges,
		truncated: nodes.length >= MAX_NODES,
		generatedAt: nowUtcIso(),
	};
}

/** local graph cap: a depth-2 hub can touch thousands; the dialog stays readable (and IN() stays < 999 params) */
export const LOCAL_MAX = 250;

/**
 * PR 21: the subgraph around one page — itself, its direct links (both directions) and, at depth 2, their links.
 * Every candidate is checked with level() for THIS viewer: a page they cannot open is never a node, id or title.
 */
export function localGraph(viewer: string, aroundId: string, depth: 1 | 2 = 2): GraphDTO {
	const db = handle().sqlite;
	shares.need('page', viewer, aroundId); // 404 for unknown / forbidden, before any link is read
	const all = new Set<string>([aroundId]);
	let ring = [aroundId];
	const linksAt = db.prepare(
		`SELECT source_page_id AS s, target_page_id AS t FROM page_links WHERE source_page_id = ? OR target_page_id = ?`,
	);
	for (let d = 0; d < depth && ring.length && all.size < LOCAL_MAX; d++) {
		const next: string[] = [];
		for (const id of ring) {
			for (const r of linksAt.all(id, id) as { s: string; t: string }[]) {
				const other = r.s === id ? r.t : r.s;
				if (other === id || all.has(other) || all.size >= LOCAL_MAX) continue;
				if (!shares.accessOf('page', viewer, other)) continue; // never leak a title, id or count
				all.add(other);
				next.push(other);
			}
		}
		ring = next;
	}
	const ids = [...all];
	const ph = ids.map(() => '?').join(',');
	const rows = db
		.prepare(
			`SELECT id, title, icon, parent_page_id AS parentId, archived_at IS NOT NULL AS archived,
			        EXISTS (SELECT 1 FROM database_records r WHERE r.page_id = pages.id) AS record
			 FROM pages WHERE id IN (${ph}) AND deleted_at IS NULL`,
		)
		.all(...ids) as { id: string; title: string; icon: string | null; parentId: string | null; archived: number; record: number }[]; // prettier-ignore
	const byId = new Map(rows.map((r) => [r.id, r]));
	const present = new Set(rows.map((r) => r.id));
	const nodes = ids.flatMap((id) => {
		const r = byId.get(id);
		if (!r) return [];
		return [
			{
				id,
				title: r.title,
				icon: r.icon,
				kind: r.record ? ('record' as const) : ('page' as const),
				archived: !!r.archived,
				parentId: r.parentId && present.has(r.parentId) ? r.parentId : null,
			},
		];
	});
	const edges: GraphDTO['edges'] = [];
	for (const r of rows)
		if (r.parentId && present.has(r.parentId))
			edges.push({ source: r.parentId, target: r.id, relation: 'parent' });
	for (const l of db
		.prepare(
			`SELECT DISTINCT source_page_id AS s, target_page_id AS t FROM page_links WHERE source_page_id IN (${ph}) AND target_page_id IN (${ph})`,
		)
		.all(...ids, ...ids) as { s: string; t: string }[])
		if (l.s !== l.t && present.has(l.s) && present.has(l.t))
			edges.push({ source: l.s, target: l.t, relation: 'link' });
	return { nodes, edges, truncated: all.size >= LOCAL_MAX, generatedAt: nowUtcIso() };
}
