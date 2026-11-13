import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';

export const POST = api(async (e) => {
	const u = me(e);
	return json({ prop: dbs.addProp(u.id, e.params.id ?? '', await body(e, dbs.propCreateSchema)) }, { status: 201 });
}); // prettier-ignore
