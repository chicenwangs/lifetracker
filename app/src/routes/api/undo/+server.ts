// POST {} = undo my newest action · POST {id} = undo that one (an Undo button on a toast)
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import { undo } from '$lib/server/undo';

export const POST = api(async (e) => {
	const u = me(e);
	const { id } = await body(e, z.object({ id: z.string().max(40).optional() }).strict());
	return json(undo(u.id, id));
});
