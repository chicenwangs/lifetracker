// GET tree (live, not archived) · POST {parentId?, title?} new page
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';

export const GET = api((e) => json({ tree: pages.tree(me(e).id) }));
export const POST = api(async (e) => {
	const u = me(e);
	return json({ page: pages.create(u.id, await body(e, pages.createSchema)) }, { status: 201 });
});
