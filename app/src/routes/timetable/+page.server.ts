// #263: a class-oriented timetable. Reuses the calendar payload (so recurring items, shared calendars
// and access filtering work as everywhere else); eight weeks is the largest term slice getCalendar allows.
import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import type { ItemDTO } from '$lib/types';
import { addDays, isDate, todayLocal, weekStartOf } from '$lib/time';

const WEEKS = 8;

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const ws = me.region === 'us' ? 7 : 1;
	const q = url.searchParams.get('w');
	const from = weekStartOf(q && isDate(q) ? q : today, ws);
	const { items } = getCalendar(me, from, addDays(from, WEEKS * 7));

	const byDate = new Map<string, ItemDTO[]>();
	for (const i of items) {
		if (!i.date) continue;
		const day = byDate.get(i.date) ?? [];
		day.push(i);
		byDate.set(i.date, day);
	}
	for (const day of byDate.values())
		day.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title));

	const weeks = Array.from({ length: WEEKS }, (_, n) => {
		const start = addDays(from, n * 7);
		return {
			start,
			days: Array.from({ length: 7 }, (_, d) => {
				const date = addDays(start, d);
				return { date, items: byDate.get(date) ?? [] };
			}),
		};
	});
	const series = new Map<string, ItemDTO>();
	for (const i of items) if (i.rrule) series.set(i.seriesId ?? i.id, i);

	return { today, from, weeks, classes: [...series.values()].sort((a, b) => a.title.localeCompare(b.title)) };
};
