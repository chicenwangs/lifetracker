// ICS feed content: the owner's own items, today −30 d … +365 d, hidden types left out (same rule as the widgets).
// Not agenda(): the feed needs repeating series unexpanded (RRULE + EXDATE) and a 395-day window.
import { buildIcs } from './ics';
import * as calendarsRepo from './repo/calendars';
import * as itemsRepo from './repo/items';
import { parseExdates, parseRRule } from '$lib/rrule';
import { addDays, todayLocal } from '$lib/time';

export function icsFeed(me: App.SafeUser, now = Date.now()): string {
	const day = todayLocal(me.timezone, now);
	const from = addDays(day, -30);
	const rows = itemsRepo.feedRows(calendarsRepo.defaultFor(me.id).id, from, addDays(day, 366));
	const items = rows
		.filter((r) => !me.hiddenTypes.includes(r.type ?? 'None'))
		.filter((r) => {
			const until = r.rrule ? parseRRule(r.rrule)?.until : undefined;
			return !until || until >= from; // a series that ended before the window
		})
		.map((r) => ({
			id: r.id,
			title: r.title,
			date: r.date as string,
			time: r.time,
			endDate: r.endDate,
			private: r.private,
			rrule: r.rrule,
			exdates: parseExdates(r.exdates),
			minutes: r.blockMin ?? undefined,
		}));
	return buildIcs({ tz: me.timezone, items, now });
}
