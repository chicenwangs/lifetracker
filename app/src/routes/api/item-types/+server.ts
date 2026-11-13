// GET my types (+ usage) · POST new type (FEATURES §3b)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as itemTypes from '$lib/server/repo/itemtypes';

export const GET = api((e) => json({ types: itemTypes.listWithUse(me(e).id) }));
export const POST = api(async (e) => {
	const u = me(e);
	return json({ type: itemTypes.create(u.id, await body(e, itemTypes.createSchema)) }, { status: 201 });
});
