// header pins (max 3): GET list · PUT {ids} = the full list in order
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';

export const GET = api((e) => json({ pins: pages.pins(me(e).id) }));
export const PUT = api(async (e) => {
	const u = me(e);
	pages.setPins(u.id, (await body(e, z.object({ ids: z.array(z.string().max(40)).max(10) }).strict())).ids);
	return json({ pins: pages.pins(u.id) });
});
