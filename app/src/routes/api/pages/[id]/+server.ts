// GET page + doc · PATCH {title?, icon?, doc?, revision?} · DELETE = Trash (page + subpages, 30 d, restorable)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';

export const GET = api((e) => json({ page: pages.get(me(e).id, e.params.id ?? '') }));
export const PATCH = api(async (e) => {
	const u = me(e);
	return json({ page: pages.update(u.id, e.params.id ?? '', await body(e, pages.patchSchema)) });
});
export const DELETE = api((e) => json(pages.trash(me(e).id, e.params.id ?? '')));
