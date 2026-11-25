import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import { recalcOwner, splitSeries } from '$lib/server/reminders';

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
	const created: { t: 'items'; id: string }[] = [];
	const r = undoable(u.id, `${what(p)} "${cur.title}"`, [{ t: 'items', id: cur.id }], () => {
		// PR 9: a from-completion tick writes a done copy; the journal needs its id to remove it on Undo
		const result = items.patch(u.id, id, p, (cid) => created.push({ t: 'items', id: cid }));
		return {
			result,
			created: result.id !== cur.id ? [...created, { t: 'items' as const, id: result.id }] : created,
		};
	});
	if (p.scope === 'following' && r.result.id !== cur.id) splitSeries(u.id, cur.id, r.result.id); // #296
	recalcOwner(u.id);
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
});

export const DELETE = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const cur = items.mustOwn(u.id, id);
	const rawScope = e.url.searchParams.get('scope');
	const scope = rawScope === 'this' || rawScope === 'following' || rawScope === 'all' ? rawScope : undefined;
	const r = undoable(u.id, `Delete "${cur.title}"`, items.deleteSet(u.id, cur.id), () => ({
		result: items.softDelete(u.id, id, scope),
	}));
	recalcOwner(u.id);
	return json({ ...r.result, undo: r.undo });
});
