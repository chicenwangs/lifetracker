import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';

export const GET = api((e) => json({ labels: keep.labels(me(e).id) }));
export const POST = api(async (e) => {
	const u = me(e);
	return json({ label: keep.createLabel(u.id, (await body(e, keep.nameSchema)).name) }, { status: 201 });
});
