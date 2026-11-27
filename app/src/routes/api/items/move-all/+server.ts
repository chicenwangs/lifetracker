// Card 04 C5 (D-V4-05, D-V4-17): "Move all to today" = one request, one undo batch over every slipped row
// (all N, not just the 50 the strip shows). The server decides which rows: ids never come from the client.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import { recalcOwner } from '$lib/server/reminders';
import { todayLocal } from '$lib/time';

export const POST = api((e) => {
	const u = me(e);
	const today = todayLocal(u.timezone);
	const targets = items.slippedRows(u.id, today).map((r) => ({ t: 'items' as const, id: r.id }));
	const r = undoable(u.id, 'Move slipped items to today', targets, () => ({
		result: items.moveSlipped(u.id, today),
	}));
	recalcOwner(u.id); // a relative reminder follows the new date (card 03 rule)
	return json({ moved: r.result, undo: r.undo });
});
