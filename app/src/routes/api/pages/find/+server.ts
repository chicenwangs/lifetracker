// link picker: my pages whose title matches (archived marked)
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';

export const GET = api((e) =>
	json({ hits: pages.findByTitle(me(e).id, (e.url.searchParams.get('q') ?? '').slice(0, 100)) }),
);
