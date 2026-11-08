// GET my unused codes · POST make a code (shown once)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as keys from '$lib/server/repo/sharekeys';

export const GET = api((e) => json({ keys: keys.listUnused(me(e).id) }));
export const POST = api(async (e) => {
	const u = me(e);
	return json(keys.create(u.id, await body(e, keys.shareKeyCreateSchema)), { status: 201 });
});
