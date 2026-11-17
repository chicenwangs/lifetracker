import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import * as reminders from '$lib/server/reminders';
import { undoable } from '$lib/server/undo';

export const POST = api(async (e) => {
	const u = me(e);
	const input = await body(e, items.itemCreateSchema);
	const r = undoable(u.id, `Add "${input.title}"`, [], () => {
		const row = items.create(u.id, input);
		if (u.defaultReminder && row.date && !row.parentId) {
			try {
				reminders.add(u.id, 'planner_item', row.id, { offset: u.defaultReminder });
			} catch {
				/* reminder time already passed: item creation still succeeds */
			}
		}
		return { result: row, created: [{ t: 'items', id: row.id }] };
	});
	return json({ item: items.withCounts([r.result])[0], undo: r.undo }, { status: 201 });
});
