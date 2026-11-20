// #263: a class-oriented timetable. Reuses the calendar payload (so recurring items, shared calendars
// and access filtering work as everywhere else). getCalendar caps ranges at 62 days, so a six-month
// term is fetched in 8-week chunks and de-duplicated by occurrence id.
import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import type { ItemDTO } from '$lib/types';
import { addDays, isDate, todayLocal, weekStartOf } from '$lib/time';

const WEEKS = 26;
const CHUNK_DAYS = 56;

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const ws = me.region === 'us' ? 7 : 1;
	const q = url.searchParams.get('w');
	const from = weekStartOf(q && isDate(q) ? q : today, ws);
	const to = addDays(from, WEEKS * 7);

	const found = new Map<string, ItemDTO>();
	for (let d = from; d < to; d = addDays(d, CHUNK_DAYS))
		for (const i of getCalendar(me, d, addDays(d, CHUNK_DAYS) > to ? to : addDays(d, CHUNK_DAYS)).items)
			found.set(i.id, i);
	const items = [...found.values()];

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
	const classes = [...series.values()].sort((a, b) => a.title.localeCompare(b.title));

	// jump-to-class links: nearest occurrence before/after the day in view
	const focus = today >= from && today < to ? today : from;
	const classDays = items
		.filter((i) => i.rrule && i.date && i.date >= from && i.date < to)
		.map((i) => i.date as string)
		.sort();
	const prevClass = classDays.filter((d) => d < focus).at(-1) ?? null;
	const nextClass = classDays.find((d) => d > focus) ?? null;

	return {
		today,
		from,
		weeks,
		classes,
		prevClass,
		nextClass,
	};
};
