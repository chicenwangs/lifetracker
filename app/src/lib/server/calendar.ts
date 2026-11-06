// GET /api/calendar?from&to (FR-H2). P1: own calendar only. P2: + overlap grants through access.ts filters.
import * as calendarsRepo from './repo/calendars';
import * as itemsRepo from './repo/items';
import * as blocksRepo from './repo/blocks';
import { bad } from './http';
import { addDays, diffDays, isDate, localToUtc } from '$lib/time';
import type { CalendarPayload } from '$lib/types';

export function getCalendar(me: App.SafeUser, from: string, to: string): CalendarPayload {
	if (!isDate(from) || !isDate(to)) bad('from/to must be YYYY-MM-DD');
	const span = diffDays(from, to);
	if (span <= 0 || span > 62) bad('range 1..62 days');
	const cal = calendarsRepo.defaultFor(me.id);
	const items = itemsRepo.withCounts(itemsRepo.inRange(cal.id, from, to).filter((i) => !i.parentId));
	// blocks: pad a day each side so midnight-crossing pieces show
	const blocks = blocksRepo.inRange(
		cal.id,
		localToUtc(addDays(from, -1), 0, me.timezone),
		localToUtc(addDays(to, 1), 0, me.timezone),
	);
	return { items, blocks };
}
