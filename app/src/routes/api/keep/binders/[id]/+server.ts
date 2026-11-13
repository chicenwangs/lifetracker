// PATCH {name} · DELETE (notes stay)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';

export const PATCH = api(async (e) => {
	const u = me(e);
	keep.renameBinder(u.id, e.params.id ?? '', (await body(e, keep.nameSchema)).name);
	return json({ ok: true });
});
export const DELETE = api((e) => {
	keep.deleteBinder(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
