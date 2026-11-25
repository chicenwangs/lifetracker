// Shared range query for the Android sync (/api/native): the owner's own calendar
// only, repeats expanded, hidden types dropped, private flag kept for the caller.
import * as calendarsRepo from './repo/calendars';
import * as itemsRepo from './repo/items';
import * as blocksRepo from './repo/blocks';
import { addDays, clock, localToUtc, utcToLocal } from '$lib/time';
import type { CalendarPayload } from '$lib/types';

export function agenda(me: App.SafeUser, from: string, to: string): CalendarPayload {
	const cal = calendarsRepo.defaultFor(me.id);
	const hidden = (t: string | null) => me.hiddenTypes.includes(t ?? 'None');
	const items = itemsRepo.withCounts(
		itemsRepo.inRange(cal.id, from, to).filter((i) => !i.parentId && !hidden(i.type)),
	);
	// blocks: pad a day each side so midnight-crossing pieces show (same as getCalendar)
	const fromZ = localToUtc(addDays(from, -1), 0, me.timezone);
	const toZ = localToUtc(addDays(to, 1), 0, me.timezone);
	const blocks = blocksRepo.inRange(cal.id, fromZ, toZ).filter((b) => !hidden(b.itemType ?? b.type));
	return { items, blocks };
}

/** One day's rows: minutes from its 00:00, timed items count as 60 min */
export function rowsOn(
	cal: CalendarPayload,
	d: string,
	tz: string,
	h12: boolean,
	paint: (t: string | null) => { bg: string | null; ink: string | null },
) {
	const mins = (iso: string) => {
		const l = utcToLocal(iso, tz);
		return l.minutes + (l.date < d ? -1440 : l.date > d ? 1440 : 0);
	};
	return [
		...cal.blocks.map((b) => ({ id: b.id, kind: 'block', start: mins(b.startAt), end: mins(b.endAt), title: b.label, type: b.itemType ?? b.type, status: b.status })), // prettier-ignore
		...cal.items
			.filter((i) => i.time && i.date === d)
			.map((i) => {
				const s = Number(i.time?.slice(0, 2)) * 60 + Number(i.time?.slice(3, 5));
				return {
					id: i.id,
					kind: 'item',
					start: s,
					end: s + 60,
					title: i.title,
					type: i.type,
					status: i.status,
				};
			}),
	]
		.filter((r) => r.end > 0 && r.start < 1440)
		.sort((a, b) => a.start - b.start)
		.map((r) => ({
			id: r.id,
			kind: r.kind,
			time: clock(Math.max(r.start, 0), h12),
			endTime: clock(Math.min(r.end, 1440), h12),
			start: r.start,
			end: r.end,
			title: r.title || 'Untitled',
			status: r.status,
			...paint(r.type),
		}));
}
