import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import { quickAdd } from '$lib/server/quickadd-server';

export const POST = api(async (e) => {
	const u = me(e);
	const { text } = await body(e, z.object({ text: z.string().max(500) }).strict());
	return json(quickAdd(u, text), { status: 201 });
});
