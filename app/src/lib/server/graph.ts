// Knowledge graph read model (DESIGN §10, FEATURES PG-GRAPH). Built on request from pages + page_links; never stored.
// Only my live pages (archived ones included, flagged). Edges to anything I can't see are dropped: no id, title or count.
import { handle } from './db';
import type { GraphDTO } from '$lib/types';
import { nowUtcIso } from '$lib/time';

export const MAX_NODES = 5000; // DESIGN §10 target; past this the client offers the local graph

export function graph(ownerId: string): GraphDTO {
	const db = handle().sqlite;
	const nodes = db
		.prepare(
			`SELECT p.id, p.title, p.parent_page_id AS parentId, p.archived_at IS NOT NULL AS archived,
			        EXISTS (SELECT 1 FROM database_records r WHERE r.page_id = p.id) AS record
			 FROM pages p WHERE p.owner_id = ? AND p.deleted_at IS NULL ORDER BY p.last_opened_at DESC LIMIT ?`,
		)
		.all(ownerId, MAX_NODES) as {
		id: string;
		title: string;
		parentId: string | null;
		archived: number;
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
		nodes: nodes.map((n) => ({ id: n.id, title: n.title, kind: n.record ? 'record' : 'page', archived: !!n.archived, parentId: n.parentId && ids.has(n.parentId) ? n.parentId : null })), // prettier-ignore
		edges,
		truncated: nodes.length >= MAX_NODES,
		generatedAt: nowUtcIso(),
	};
}
