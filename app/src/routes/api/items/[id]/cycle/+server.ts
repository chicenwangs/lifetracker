import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';

export const POST = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const cur = items.mustOwn(u.id, id);
	const created: { t: 'items'; id: string }[] = [];
	const r = undoable(u.id, `Status "${cur.title}"`, [{ t: 'items', id: cur.id }], () => {
		const result = items.cycle(u.id, id, (cid) => created.push({ t: 'items', id: cid }));
		return {
			result,
			created: result.id !== cur.id ? [...created, { t: 'items' as const, id: result.id }] : created,
		};
	});
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
});
