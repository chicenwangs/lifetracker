import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import * as itemsRepo from '$lib/server/repo/items';
import * as goalsRepo from '$lib/server/repo/goals';
import { addDays, isDate, monthGridRange, quarterKey, todayLocal } from '$lib/time';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser; // guard ensures
	const today = todayLocal(me.timezone);
	const d = url.searchParams.get('d');
	const day = d && isDate(d) ? d : today;
	const m = url.searchParams.get('m');
	const mm = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : day.slice(0, 7);
	const year = Number(mm.slice(0, 4));
	const month = Number(mm.slice(5, 7));
	const range = monthGridRange(year, month);
	const period = quarterKey(today);
	return {
		today,
		day,
		year,
		month,
		month_: getCalendar(me, range.from, range.to),
		planner: getCalendar(me, day, addDays(day, 1)),
		due: itemsRepo.withCounts(itemsRepo.dueOn(me.id, day)),
		period,
		goals: goalsRepo.forPeriod(me.id, period),
	};
};
