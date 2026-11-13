// PATCH rename/type/options/position (409 values_lost until confirm: true, D-19) · DELETE ?confirm=1
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';

export const PATCH = api(async (e) => {
	const u = me(e);
	return json({ prop: dbs.patchProp(u.id, e.params.id ?? '', await body(e, dbs.propPatchSchema)) });
});
export const DELETE = api((e) => {
	dbs.deleteProp(me(e).id, e.params.id ?? '', e.url.searchParams.get('confirm') === '1');
	return json({ ok: true });
});
