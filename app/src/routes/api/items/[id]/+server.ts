import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';

export const GET = api((e) => {
	const u = me(e);
	return json({ item: items.withCounts([items.mustOwn(u.id, e.params.id ?? '')])[0] });
});

export const PATCH = api(async (e) => {
	const u = me(e);
	const p = await body(e, items.itemPatchSchema);
	return json({ item: items.withCounts([items.patch(u.id, e.params.id ?? '', p)])[0] });
});

export const DELETE = api((e) => {
	const u = me(e);
	return json(items.softDelete(u.id, e.params.id ?? ''));
});
