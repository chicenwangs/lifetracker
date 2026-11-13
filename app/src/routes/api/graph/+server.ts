// GET the knowledge graph of my pages (DESIGN §10). Private, never cached across users.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { graph } from '$lib/server/graph';

export const GET = api((e) => json(graph(me(e).id), { headers: { 'cache-control': 'private, no-store' } }));
