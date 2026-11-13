import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as rem from '$lib/server/reminders';

export const DELETE = api((e) => {
	rem.remove(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
