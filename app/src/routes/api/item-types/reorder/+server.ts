import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as itemTypes from '$lib/server/repo/itemtypes';

export const POST = api(async (e) => {
	const u = me(e);
	const { ids } = await body(e, z.object({ ids: z.array(z.string().max(40)).max(20) }).strict());
	itemTypes.reorder(u.id, ids);
	return json({ ok: true });
});
