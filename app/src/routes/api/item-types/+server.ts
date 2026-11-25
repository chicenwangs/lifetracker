// GET my types (+ usage) · POST new type (FEATURES §3b)
import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as itemTypes from '$lib/server/repo/itemtypes';
import { undoable } from '$lib/server/undo';

export const GET = api((e) => json({ types: itemTypes.listWithUse(me(e).id) }));
export const POST = api(async (e) => {
	const u = me(e);
	const input = await body(e, itemTypes.createSchema);
	// one undo entry for a new type (the starter pack and every other add path use this route)
	const r = undoable(u.id, `Add type "${input.name}"`, [], () => {
		const t = itemTypes.create(u.id, input);
		return { result: t, created: [{ t: 'item_types' as const, id: t.id }] };
	});
	return json({ type: r.result, undo: r.undo }, { status: 201 });
});
