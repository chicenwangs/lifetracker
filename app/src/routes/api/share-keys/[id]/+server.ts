// DELETE = cancel an unused code
import { json } from '@sveltejs/kit';
import { api, me, notFound } from '$lib/server/http';
import * as keys from '$lib/server/repo/sharekeys';

export const DELETE = api((e) => {
	if (!keys.revoke(me(e).id, e.params.id ?? '')) notFound();
	return json({ ok: true });
});
