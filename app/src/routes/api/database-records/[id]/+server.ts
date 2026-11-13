// GET one record + props · PATCH {values} (each checked for its type) · DELETE (its page goes to Trash)
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';

const schema = z.object({ values: z.record(z.string().max(40), z.unknown()) }).strict();
export const GET = api((e) => json(dbs.getRecord(me(e).id, e.params.id ?? '')));
export const PATCH = api(async (e) => {
	const u = me(e);
	return json({ values: dbs.setValues(u.id, e.params.id ?? '', (await body(e, schema)).values) });
});
export const DELETE = api((e) => {
	dbs.deleteRecord(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
