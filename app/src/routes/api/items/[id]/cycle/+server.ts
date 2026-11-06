import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';

export const POST = api((e) => {
	const u = me(e);
	return json({ item: items.withCounts([items.cycle(u.id, e.params.id ?? '')])[0] });
});
