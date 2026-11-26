// Card 03 C8/C9: Skip one occurrence of a repeating item = one EXDATE (no new row). Undo restores the series
// exdates from the journal. C10: the skipped occurrence's reminders stop (relative ones move on).
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { afterSkip } from '$lib/server/reminders';
import { undoable } from '$lib/server/undo';
import { splitOccId } from '$lib/rrule';
import { addDays, diffDays } from '$lib/time';

export const POST = api((e) => {
	const u = me(e);
	const raw = e.params.id ?? '';
	const cur = items.mustOwn(u.id, raw); // 404 for a foreign id
	const { occDate } = splitOccId(raw);
	const r = undoable(u.id, `Skip "${cur.title}"`, [{ t: 'items', id: cur.id }], () => ({
		result: items.skip(u.id, raw),
	}));
	if (occDate) {
		const span = cur.date && cur.endDate ? diffDays(cur.date, cur.endDate) : 0;
		afterSkip(u.id, cur.id, occDate, span > 0 ? addDays(occDate, span) : null);
	}
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
});
