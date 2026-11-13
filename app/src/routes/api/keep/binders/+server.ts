import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';

export const GET = api((e) => json({ binders: keep.binders(me(e).id) }));
export const POST = api(async (e) => {
	const u = me(e);
	return json({ binder: keep.createBinder(u.id, (await body(e, keep.nameSchema)).name) }, { status: 201 });
});
