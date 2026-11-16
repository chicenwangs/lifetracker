// Phone Today (FEATURES §10): the day's blocks + timed items for the Now card and the timeline wheel.
// (The "To do today · no time set" list was removed, owner 2026-11-16.)
import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import { addDays, isDate, todayLocal } from '$lib/time';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const d = url.searchParams.get('d');
	const day = d && isDate(d) ? d : today;
	return {
		today,
		day,
		cal: getCalendar(me, day, addDays(day, 1)),
	};
};
