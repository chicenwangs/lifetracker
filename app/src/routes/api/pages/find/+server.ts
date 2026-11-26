// link picker (#442): empty query = the viewer's 10 most recent pages, typing = title matches (archived marked)
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';

export const GET = api((e) => {
	const uid = me(e).id;
	const q = (e.url.searchParams.get('q') ?? '').slice(0, 100);
	return json({ hits: q.trim() ? pages.findByTitle(uid, q) : pages.recent(uid, 10) });
});
