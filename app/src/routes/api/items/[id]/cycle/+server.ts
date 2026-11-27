import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, bad, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import { afterCompletion, cancelIds, completionReminderIds, recalcOwner } from '$lib/server/reminders';
import { zDate } from '$lib/server/validate';
import { nextStatus } from '$lib/types';

/** the optional tick body (card 09 MUST 2): the series date the client saw.
 *  Optional for API callers: a bare POST is the old tick (it still completes); every UI tick sends it. */
const cycleSchema = z.object({ seenDate: zDate.optional() }).strict();

export const POST = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	// a bare POST (no body) is the old tick; a body must be {"seenDate": "YYYY-MM-DD"}
	const raw = await e.request.json().catch(() => ({}));
	const parsed = cycleSchema.safeParse(raw);
	const seenDate = parsed.success ? parsed.data.seenDate : bad('seenDate must be YYYY-MM-DD');
	const cur = items.mustOwn(u.id, id);
	const next = nextStatus(cur.status);
	// card 09 MUST 2: a replayed tick changes nothing — answer with the refreshed row, no journal entry
	if (items.isStaleCompletion(cur, next, seenDate))
		return json({ item: items.withCounts([items.mustOwn(u.id, id)])[0], stale: true });
	const completing = !!cur.rrule && cur.date !== null && cur.repeatFromCompletion && next === 'done';
	// the finished occurrence's reminders go with it, in this action's undo entry. A tick without
	// `seenDate` is an older/API caller (the optional residual): it completes but keeps the old reminder set.
	const siblings = completing && seenDate !== undefined ? completionReminderIds(u.id, cur.id) : [];
	const r = undoable(
		u.id,
		`Status "${cur.title}"`,
		[{ t: 'items', id: cur.id }, ...siblings.map((sid) => ({ t: 'reminders' as const, id: sid }))],
		() => {
			const result = items.cycle(u.id, id, seenDate);
			// card 09 C9: a completion creates the done copy — journal it with the series in the same entry
			const made = result.id !== cur.id ? [result.id] : [];
			if (result.doneCopyId) made.push(result.doneCopyId);
			if (result.doneCopyId) {
				// standing relative rules move with the new date; recreate the next reminder, then cancel the finished set
				recalcOwner(u.id);
				afterCompletion(u.id, cur.id);
				cancelIds(u.id, siblings);
			}
			return { result, created: made.map((i) => ({ t: 'items' as const, id: i })) };
		},
	);
	if (!r.result.doneCopyId) recalcOwner(u.id); // card 09 C8 (D-V4-27): a moved series takes its reminders along
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
});
