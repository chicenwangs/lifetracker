import { json } from '@sveltejs/kit';
import { api, body, me, notFound } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import { afterCompletion, recalcOwner, splitSeries } from '$lib/server/reminders';
import { splitOccId } from '$lib/rrule';

export const GET = api((e) => {
	const u = me(e);
	const raw = e.params.id ?? '';
	const { id, occDate } = splitOccId(raw);
	const cur = items.mustOwn(u.id, id);
	// card 09 C4: id@date is only valid for a date the row really has (a from-completion series: its date)
	if (occDate && cur.rrule && !items.isOccurrence(cur, occDate)) notFound();
	return json({ item: items.withCounts([cur])[0] });
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
	const r = undoable(u.id, `${what(p)} "${cur.title}"`, [{ t: 'items', id: cur.id }], () => {
		const result = items.patch(u.id, id, p);
		// card 09 C9: a completion creates the done copy — journal it with the series in the same entry
		const made = result.id !== cur.id ? [result.id] : [];
		if (result.doneCopyId) made.push(result.doneCopyId);
		return { result, created: made.map((i) => ({ t: 'items' as const, id: i })) };
	});
	if (p.scope === 'following' && r.result.id !== cur.id) splitSeries(u.id, cur.id, r.result.id); // #296
	recalcOwner(u.id);
	if (r.result.doneCopyId) afterCompletion(u.id, cur.id); // C8: recreate a reminder that already fired
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
