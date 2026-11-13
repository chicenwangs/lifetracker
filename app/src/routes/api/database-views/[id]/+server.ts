import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as dbs from '$lib/server/repo/databases';

export const PATCH = api(async (e) => {
	const u = me(e);
	dbs.patchView(u.id, e.params.id ?? '', await body(e, dbs.viewPatchSchema));
	return json({ ok: true });
});
export const DELETE = api((e) => {
	dbs.deleteView(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
