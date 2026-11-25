// Skip one occurrence of a repeating item (v3.2 reschedule): an EXDATE, one undo entry.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import { cancelOnDay, recalcOwner } from '$lib/server/reminders';
import { splitOccId } from '$lib/rrule';

export const POST = api((e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	const { occDate } = splitOccId(id);
	const cur = items.mustOwn(u.id, id);
	const r = undoable(u.id, `Skip "${cur.title}"`, [{ t: 'items', id: cur.id }], () => ({
		result: items.skipOccurrence(u.id, id),
	}));
	recalcOwner(u.id); // relative reminders move to the next date
	// shortcut: Undo of a Skip does not bring back this cancelled reminder (reminders are not in the undo journal); upgrade if users report it.
	if (occDate) cancelOnDay(u.id, cur.id, occDate); // exact-time ones would still fire on the skipped day
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
});
