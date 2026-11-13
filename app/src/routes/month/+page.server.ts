// Phone Month (FEATURES §10): compact grid, tap a day = that day's Today. ?m=YYYY-MM.
import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import { monthGridRange, todayLocal } from '$lib/time';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const m = url.searchParams.get('m');
	const ym = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
	const range = monthGridRange(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), me.region === 'us' ? 7 : 1);
	return { today, ym, ...range, cal: getCalendar(me, range.from, range.to) };
};
