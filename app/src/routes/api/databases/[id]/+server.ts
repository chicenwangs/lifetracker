// GET ?view=&offset=&limit= database with one view applied · PATCH {title}
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';

export const GET = api((e) => {
	const q = e.url.searchParams;
	return json({
		database: dbs.get(me(e).id, e.params.id ?? '', {
			viewId: q.get('view') ?? undefined,
			offset: Number(q.get('offset')) || 0,
			limit: Number(q.get('limit')) || undefined,
		}),
	});
});
export const PATCH = api(async (e) => {
	const u = me(e);
	const p = await body(e, z.object({ title: z.string().max(300) }).strict());
	dbs.rename(u.id, e.params.id ?? '', p.title);
	return json({ ok: true });
});
