import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';

const schema = z
	.object({ name: z.string().trim().min(1).max(60), type: z.enum(['table', 'board', 'calendar']).optional() })
	.strict();
export const POST = api(async (e) => {
	const u = me(e);
	const p = await body(e, schema);
	return json({ view: dbs.addView(u.id, e.params.id ?? '', p.name, p.type ?? 'table') }, { status: 201 });
}); // prettier-ignore
