// Card 03 C8/C9: Skip one occurrence of a repeating item = one EXDATE (no new row). Undo restores the series
// exdates from the journal. C10: the skipped occurrence's absolute reminders are in the same undo entry, so
// Undo brings them back too; relative ones move on through recalc.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { absoluteInRange, afterSkip, removeIds } from '$lib/server/reminders';
import { undoable } from '$lib/server/undo';
import { splitOccId } from '$lib/rrule';
import { addDays, diffDays } from '$lib/time';

export const POST = api((e) => {
	const u = me(e);
	const raw = e.params.id ?? '';
	const cur = items.mustOwn(u.id, raw); // 404 for a foreign id
	const { occDate } = splitOccId(raw);
	const span = cur.date && cur.endDate ? diffDays(cur.date, cur.endDate) : 0;
	const end = occDate ? (span > 0 ? addDays(occDate, span) : occDate) : null;
	const reminderIds = occDate && end ? absoluteInRange(u.id, cur.id, occDate, end) : [];
	const r = undoable(
		u.id,
		`Skip "${cur.title}"`,
		[{ t: 'items', id: cur.id }, ...reminderIds.map((id) => ({ t: 'reminders' as const, id }))],
		() => {
			const result = items.skip(u.id, raw); // a non-occurrence throws: the whole entry rolls back
			removeIds(u.id, reminderIds);
			return { result };
		},
	);
	afterSkip(u.id);
	return json({ item: items.withCounts([r.result])[0], undo: r.undo });
});
