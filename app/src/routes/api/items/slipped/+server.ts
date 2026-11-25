// v3.2 PR 4: "Move all to today" for the Slipped strip — one undo batch.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import { recalcOwner } from '$lib/server/reminders';
import { todayLocal } from '$lib/time';

export const POST = api((e) => {
	const u = me(e);
	const today = todayLocal(u.timezone); // owner-local, from the session: never a client date
	const ids = items.slippedIds(u.id, today);
	if (!ids.length) return json({ moved: 0 });
	const r = undoable(
		u.id,
		`Move ${ids.length} slipped to today`,
		ids.map((id) => ({ t: 'items' as const, id })),
		() => ({ result: items.moveSlippedToToday(u.id, today) }),
	);
	recalcOwner(u.id); // relative reminders move with the new dates
	return json({ ...r.result, undo: r.undo });
});
