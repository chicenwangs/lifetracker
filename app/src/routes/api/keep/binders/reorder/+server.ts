import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as keep from '$lib/server/repo/keep';

export const POST = api(async (e) => {
	const u = me(e);
	keep.reorderBinders(
		u.id,
		(await body(e, z.object({ ids: z.array(z.string().max(40)).max(200) }).strict())).ids,
	);
	return json({ ok: true });
});
