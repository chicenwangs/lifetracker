// Phone Today (FEATURES §10): the day's blocks + timed items for the Now card and the timeline wheel.
// (The "To do today · no time set" list was removed, owner 2026-11-16.)
import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import { addDays, clipToDay, isDate, todayLocal, weekStartOf } from '$lib/time';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const d = url.searchParams.get('d');
	const day = d && isDate(d) ? d : today;
	// week strip (#94): which days of this week have something on them
	const from = weekStartOf(day, me.region === 'us' ? 7 : 1);
	const wk = getCalendar(me, from, addDays(from, 7));
	// #160: every day a block or a multi-day item touches, not just its first
	const busy: string[] = [];
	for (let d = from; d < addDays(from, 7); d = addDays(d, 1))
		if (
			wk.items.some((i) => i.date && i.date <= d && (i.endDate ?? i.date) >= d) ||
			wk.blocks.some((b) => clipToDay(b.startAt, b.endAt, d, me.timezone))
		)
			busy.push(d);
	return {
		today,
		day,
		week: { from, busy },
		cal: getCalendar(me, day, addDays(day, 1)),
	};
};
