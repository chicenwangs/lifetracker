// GET /api/calendar?from&to (FR-H2). Own calendar + (overlap on) calendars shared with me, filtered in access.ts.
import * as calendarsRepo from './repo/calendars';
import * as itemsRepo from './repo/items';
import * as blocksRepo from './repo/blocks';
import * as grantsRepo from './repo/grants';
import { filterBlock, filterItem, type Access } from './access';
import { bad } from './http';
import { addDays, diffDays, isDate, localToUtc } from '$lib/time';
import type { CalendarPayload } from '$lib/types';

export function getCalendar(
	me: App.SafeUser,
	from: string,
	to: string,
	opts: { shared?: boolean } = {},
): CalendarPayload {
	if (!isDate(from) || !isDate(to)) bad('from/to must be YYYY-MM-DD');
	const span = diffDays(from, to);
	if (span <= 0 || span > 62) bad('range 1..62 days');
	const cal = calendarsRepo.defaultFor(me.id);
	const items = itemsRepo.withCounts(itemsRepo.inRange(cal.id, from, to).filter((i) => !i.parentId));
	// blocks: pad a day each side so midnight-crossing pieces show
	const fromZ = localToUtc(addDays(from, -1), 0, me.timezone);
	const toZ = localToUtc(addDays(to, 1), 0, me.timezone);
	const blocks = blocksRepo.inRange(cal.id, fromZ, toZ);
	if (opts.shared === false || !me.overlapOn) return { items, blocks };

	for (const g of grantsRepo.received(me.id)) {
		if (!g.inOverlap) continue;
		const a: Access = {
			visible: new Set(g.visibleTypes),
			hiddenAs: g.hiddenAs,
			owner: {
				id: g.ownerId,
				name: g.name,
				initial: g.name.slice(0, 1).toUpperCase(),
				color: g.color,
			},
		};
		for (const it of itemsRepo.inRange(g.calendarId, from, to)) {
			const f = filterItem(it, a, me.id);
			if (f) items.push(f);
		}
		for (const r of blocksRepo.inRangeForShare(g.calendarId, fromZ, toZ)) {
			const f = filterBlock(r.block, r.linked, a, me.id);
			if (f) blocks.push(f);
		}
	}
	return { items, blocks };
}
