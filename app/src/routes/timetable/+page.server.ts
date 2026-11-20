// #263: a class-oriented timetable. Reuses the calendar payload (so recurring items, shared calendars
// and access filtering work as everywhere else). getCalendar caps ranges at 62 days, so a six-month
// term is fetched in 8-week chunks and de-duplicated by occurrence id.
import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import type { ItemDTO } from '$lib/types';
import { addDays, isDate, todayLocal, weekStartOf } from '$lib/time';

const WEEKS = 26;
const CHUNK_DAYS = 56;
const MIN_FROM = '0001-01-01';
const MAX_FROM = addDays('9999-12-30', -(WEEKS * 7)); // leave one day for getCalendar's exclusive end (#267)

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const ws = me.region === 'us' ? 7 : 1;
	const q = url.searchParams.get('w');
	const rawFrom = weekStartOf(q && isDate(q) ? q : today, ws);
	const from = rawFrom < MIN_FROM ? MIN_FROM : rawFrom > MAX_FROM ? MAX_FROM : rawFrom;
	const to = addDays(from, WEEKS * 7);

	const found = new Map<string, ItemDTO>();
	let d = from;
	while (d < to) {
		const step = addDays(d, CHUNK_DAYS);
		const end = !isDate(step) || step > to ? to : step;
		for (const i of getCalendar(me, d, end).items) found.set(i.id, i);
		if (end === to) break;
		d = end;
	}
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
