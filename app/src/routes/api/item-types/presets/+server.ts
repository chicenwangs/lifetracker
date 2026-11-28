// POST { slug } = one starter-pack type, in its own transaction (card 14, O-1 item 6, D-V4-21)
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as itemTypes from '$lib/server/repo/itemtypes';

export const POST = api(async (e) => {
	const u = me(e);
	const { slug } = await body(e, z.object({ slug: z.string().trim().max(20) }).strict());
	return json({ type: itemTypes.createPreset(u.id, slug) }, { status: 201 });
});
