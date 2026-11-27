import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { api, bad, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import { afterCompletion, recalcOwner } from '$lib/server/reminders';
import { zDate } from '$lib/server/validate';

/** the optional tick body (card 09 MUST 2): the series date the client saw; absent = an older client */
const cycleSchema = z.object({ seenDate: zDate.optional() }).strict();

export const POST = api(async (e) => {
	const u = me(e);
	const id = e.params.id ?? '';
	// a bare POST (no body) is the old tick; a body must be {"seenDate": "YYYY-MM-DD"}
	const raw = await e.request.json().catch(() => ({}));
	const parsed = cycleSchema.safeParse(raw);
	const seenDate = parsed.success ? parsed.data.seenDate : bad('seenDate must be YYYY-MM-DD');
	const cur = items.mustOwn(u.id, id);
	const r = undoable(u.id, `Status "${cur.title}"`, [{ t: 'items', id: cur.id }], () => {
		const result = items.cycle(u.id, id, seenDate);
		// card 09 C9: a completion creates the done copy — journal it with the series in the same entry
		const made = result.id !== cur.id ? [result.id] : [];
		if (result.doneCopyId) made.push(result.doneCopyId);
		return { result, created: made.map((i) => ({ t: 'items' as const, id: i })) };
	});
	recalcOwner(u.id); // card 09 C8 (D-V4-27): a moved series takes its reminders along
	if (r.result.doneCopyId) afterCompletion(u.id, cur.id);
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
});
