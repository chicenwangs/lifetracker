import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import { afterCompletion, recalcOwner } from '$lib/server/reminders';

export const POST = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const cur = items.mustOwn(u.id, id);
	const r = undoable(u.id, `Status "${cur.title}"`, [{ t: 'items', id: cur.id }], () => {
		const result = items.cycle(u.id, id);
		// card 09 C9: a completion creates the done copy — journal it with the series in the same entry
		const made = result.id !== cur.id ? [result.id] : [];
		if (result.doneCopyId) made.push(result.doneCopyId);
		return { result, created: made.map((i) => ({ t: 'items' as const, id: i })) };
	});
	recalcOwner(u.id); // card 09 C8 (D-V4-27): a moved series takes its reminders along
	if (r.result.doneCopyId) afterCompletion(u.id, cur.id);
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
});
