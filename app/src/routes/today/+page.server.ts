// Phone Today (FEATURES §10): the day's blocks + timed items for the Now card and the timeline wheel,
// plus "No time set" = own top-level items dated (or spanning) the day, no time, not done.
import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import * as itemsRepo from '$lib/server/repo/items';
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
		noTime: itemsRepo.withCounts(itemsRepo.dueOn(me.id, day).filter((i) => !i.time)),
	};
};
