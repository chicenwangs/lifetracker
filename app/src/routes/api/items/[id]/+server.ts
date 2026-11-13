import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';

export const GET = api((e) => {
	const u = me(e);
	return json({ item: items.withCounts([items.mustOwn(u.id, e.params.id ?? '')])[0] });
});

/** short undo label for what a patch changed */
const what = (p: items.ItemPatch) =>
	p.date !== undefined || p.endDate !== undefined
		? 'Move'
		: p.title !== undefined
			? 'Rename'
			: p.status
				? 'Status'
				: 'Edit';

export const PATCH = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const p = await body(e, items.itemPatchSchema);
	const cur = items.mustOwn(u.id, id);
	const r = undoable(u.id, `${what(p)} "${cur.title}"`, [{ t: 'items', id }], () => ({ result: items.patch(u.id, id, p) }));
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
}); // prettier-ignore

export const DELETE = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const cur = items.mustOwn(u.id, id);
	const r = undoable(u.id, `Delete "${cur.title}"`, items.deleteSet(u.id, id), () => ({ result: items.softDelete(u.id, id) }));
	return json({ ...r.result, undo: r.undo });
}); // prettier-ignore
