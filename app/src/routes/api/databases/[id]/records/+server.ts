import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';
import { needDb } from '$lib/server/repo/shares';

const schema = z.object({ values: z.record(z.string().max(40), z.unknown()).default({}) }).strict();
export const POST = api(async (e) => {
	const u = me(e);
	return json({ row: dbs.addRecord(needDb(u.id, e.params.id ?? '', 'edit'), e.params.id ?? '', (await body(e, schema)).values) }, { status: 201 });
}); // prettier-ignore
