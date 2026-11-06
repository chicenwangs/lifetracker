import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';

export const POST = api(async (e) => {
	const u = me(e);
	const input = await body(e, items.itemCreateSchema);
	return json({ item: items.withCounts([items.create(u.id, input)])[0] }, { status: 201 });
});
