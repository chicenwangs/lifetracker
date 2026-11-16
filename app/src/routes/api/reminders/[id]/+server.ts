import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as rem from '$lib/server/reminders';

export const DELETE = api((e) => {
	rem.remove(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});

export const POST = api(async (e) => {
	const u = me(e);
	const p = await body(e, rem.actSchema);
	const reminder = rem.act(u.id, e.params.id ?? '', p.action);
	return json({ ok: true, reminder });
});
