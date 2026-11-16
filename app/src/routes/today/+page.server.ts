// Phone Today (FEATURES §10): the day's blocks + timed items for the Now card and the timeline wheel.
// (The "To do today · no time set" list was removed, owner 2026-11-16.)
import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import { addDays, isDate, todayLocal, utcToLocal, weekStartOf } from '$lib/time';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const d = url.searchParams.get('d');
	const day = d && isDate(d) ? d : today;
	// week strip (#94): which days of this week have something on them
	const from = weekStartOf(day, me.region === 'us' ? 7 : 1);
	const wk = getCalendar(me, from, addDays(from, 7));
	const busy = [
		...new Set([
			...wk.items.flatMap((i) => (i.date ? [i.date] : [])),
			...wk.blocks.map((b) => utcToLocal(b.startAt, me.timezone).date),
		]),
	];
	return {
		today,
		day,
		week: { from, busy },
		cal: getCalendar(me, day, addDays(day, 1)),
	};
};
