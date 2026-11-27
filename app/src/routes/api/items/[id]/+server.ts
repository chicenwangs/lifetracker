import { json } from '@sveltejs/kit';
import { api, body, me, notFound } from '$lib/server/http';
import * as items from '$lib/server/repo/items';
import { undoable } from '$lib/server/undo';
import {
	afterCompletion,
	cancelIds,
	exactReminderIds,
	recalcOwner,
	splitSeries,
} from '$lib/server/reminders';
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
	// card 09 MUST 2: a replayed completion changes nothing — answer with the refreshed row, no journal entry
	if (items.isStaleCompletion(cur, p.status, p.seenDate))
		return json({ item: items.withCounts([items.mustOwn(u.id, id)])[0], stale: true });
	const completing = !!cur.rrule && cur.date !== null && cur.repeatFromCompletion && p.status === 'done';
	// the finished occurrence's exact reminders go with it, in this action's undo entry. A request without
	// `seenDate` is an older/API caller (the optional residual): it completes but keeps the old reminder set.
	const siblings = completing && p.seenDate !== undefined ? exactReminderIds(u.id, cur.id) : [];
	const r = undoable(
		u.id,
		`${what(p)} "${cur.title}"`,
		[{ t: 'items', id: cur.id }, ...siblings.map((sid) => ({ t: 'reminders' as const, id: sid }))],
		() => {
			const result = items.patch(u.id, id, p);
			// card 09 C9: a completion creates the done copy — journal it with the series in the same entry
			const made = result.id !== cur.id ? [result.id] : [];
			if (result.doneCopyId) made.push(result.doneCopyId);
			if (result.doneCopyId) {
				// standing relative rules move with the new date; the completed occurrence's exact ones are done
				recalcOwner(u.id);
				cancelIds(u.id, siblings);
			}
			return { result, created: made.map((i) => ({ t: 'items' as const, id: i })) };
		},
	);
	if (p.scope === 'following' && r.result.id !== cur.id) splitSeries(u.id, cur.id, r.result.id); // #296
	if (!r.result.doneCopyId) recalcOwner(u.id);
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
