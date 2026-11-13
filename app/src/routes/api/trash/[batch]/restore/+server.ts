import { json } from '@sveltejs/kit';
import { api, me, notFound } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { recalcOwner } from '$lib/server/reminders';

export const POST = api((e) => {
	const n = items.restore(me(e).id, e.params.batch ?? '');
	if (!n) notFound();
	recalcOwner(me(e).id);
	return json({ restored: n });
});
