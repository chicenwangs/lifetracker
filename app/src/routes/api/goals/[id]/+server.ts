import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as goals from '$lib/server/repo/goals';

export const PATCH = api(async (e) => {
	const u = me(e);
	return json({ goal: goals.update(u.id, e.params.id ?? '', await body(e, goals.goalPatchSchema)) });
});
export const DELETE = api((e) => {
	goals.remove(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
