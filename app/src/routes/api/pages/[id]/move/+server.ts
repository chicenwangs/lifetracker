import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as pages from '$lib/server/repo/pages';

export const POST = api(async (e) => {
	const u = me(e);
	const p = await body(e, z.object({ parentId: z.string().max(40).nullable(), before: z.string().max(40).nullable().default(null) }).strict()); // prettier-ignore
	pages.move(u.id, e.params.id ?? '', p.parentId, p.before);
	return json({ ok: true });
});
