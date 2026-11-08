// POST {code} -> I can now see the code owner's calendar
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as keys from '$lib/server/repo/sharekeys';

export const POST = api(async (e) => {
	const u = me(e);
	const { code } = await body(e, z.object({ code: z.string().max(40) }).strict());
	const r = keys.redeem(u.id, code);
	if (!r.ok) return json({ error: { code: 'bad_code', message: r.message } }, { status: r.status });
	return json({ grantId: r.grantId }, { status: 201 });
});
