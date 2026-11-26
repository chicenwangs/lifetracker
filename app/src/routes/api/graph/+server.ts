// GET the knowledge graph of my pages (DESIGN �10), or the local graph around one page (PR 21).
// ?around=<pageId>&depth=1|2 -> that page + its links (+ links of links). Private, never cached across users.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { graph, localGraph } from '$lib/server/graph';

export const GET = api((e) => {
	const u = me(e);
	const around = e.url.searchParams.get('around');
	const depth = e.url.searchParams.get('depth') === '1' ? 1 : 2;
	const g = around ? localGraph(u.id, around, depth) : graph(u.id);
	return json(g, { headers: { 'cache-control': 'private, no-store' } });
});
