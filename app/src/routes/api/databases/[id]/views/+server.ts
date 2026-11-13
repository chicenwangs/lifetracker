import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';

const schema = z.object({ name: z.string().trim().min(1).max(60) }).strict();
export const POST = api(async (e) => {
	const u = me(e);
	return json({ view: dbs.addView(u.id, e.params.id ?? '', (await body(e, schema)).name) }, { status: 201 });
}); // prettier-ignore
