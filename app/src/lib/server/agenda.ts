// The own-calendar range query behind the Android week widgets (ICS export and digest later — PLAN §3B,
// D-V4-06). Read-only.
import * as calendarsRepo from './repo/calendars';
import * as itemsRepo from './repo/items';
import * as blocksRepo from './repo/blocks';
import { bad } from './http';
import { addDays, diffDays, isDate, localToUtc } from '$lib/time';
import type { CalendarPayload } from '$lib/types';

export function agenda(
	me: App.SafeUser,
	from: string,
	to: string,
	opts: { maxDays?: number } = {},
): CalendarPayload {
	if (!isDate(from) || !isDate(to)) bad('from/to must be YYYY-MM-DD');
	const span = diffDays(from, to);
	const maxDays = opts.maxDays ?? 62;
	if (span <= 0 || span > maxDays) bad(`range 1..${maxDays} days`);
	const cal = calendarsRepo.defaultFor(me.id);
	const items = itemsRepo
		.withCounts(itemsRepo.inRange(cal.id, from, to).filter((i) => !i.parentId))
		.filter((i) => !me.hiddenTypes.includes(i.type ?? 'None'));
	// blocks: pad a day each side so midnight-crossing pieces show
	const fromZ = localToUtc(addDays(from, -1), 0, me.timezone);
	const toZ = localToUtc(addDays(to, 1), 0, me.timezone);
	const blocks = blocksRepo.inRange(cal.id, fromZ, toZ);
	return { items, blocks };
}
