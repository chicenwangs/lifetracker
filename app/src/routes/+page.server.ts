import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import * as itemsRepo from '$lib/server/repo/items';
import { addDays, isDate, monthGridRange, todayLocal } from '$lib/time';
import { itemSpans, planDay } from '$lib/planahead';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser; // guard ensures
	const today = todayLocal(me.timezone);
	const d = url.searchParams.get('d');
	let day = today;
	let planAhead = false;
	if (d && isDate(d)) day = d;
	else if (me.planMode === 'night') {
		// plan-ahead: no ?d= -> maybe open tomorrow (before-bed planners)
		const near = getCalendar(me, today, addDays(today, 2), { shared: false });
		const own = near.items.filter((i) => i.editable);
		day = planDay(me.planMode, today, me.timezone, [...near.blocks, ...itemSpans(own, me.timezone)]);
		planAhead = day !== today;
	}
	const m = url.searchParams.get('m');
	const mm = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : day.slice(0, 7);
	const year = Number(mm.slice(0, 4));
	const month = Number(mm.slice(5, 7));
	const range = monthGridRange(year, month);
	return {
		today,
		day,
		planAhead,
		year,
		month,
		month_: getCalendar(me, range.from, range.to),
		planner: getCalendar(me, day, addDays(day, 1)),
		due: itemsRepo.withCounts(itemsRepo.dueOn(me.id, day)),
	};
};
