import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import * as itemsRepo from '$lib/server/repo/items';
import type { HeatDay } from '$lib/types';
import { addDays, clipToDay, durationMin, isDate, monthGridRange, todayLocal, weekRange } from '$lib/time';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const w = url.searchParams.get('w');
	const { from, to } = weekRange(w && isDate(w) ? w : today);
	const cal = getCalendar(me, from, to);
	const ownItems = cal.items.filter((i) => !i.theirs);
	const done = ownItems.filter((i) => i.status === 'done').length;
	const doing = ownItems.filter((i) => i.status === 'doing').length;
	const blockedMin = cal.blocks
		.filter((b) => !b.theirs)
		.reduce((s, b) => s + Math.max(0, durationMin(b.startAt, b.endAt)), 0);

	// month heatmap: the month this week belongs to (its Thursday, ISO style)
	const thu = addDays(from, 3);
	const year = Number(thu.slice(0, 4));
	const month = Number(thu.slice(5, 7));
	const grid = monthGridRange(year, month);
	const mcal = getCalendar(me, grid.from, grid.to, { shared: false });
	const unblocked = itemsRepo.allDayUnblocked(me.id, grid.from, grid.to);
	const heat: HeatDay[] = [];
	for (let d = grid.from; d < grid.to; d = addDays(d, 1)) {
		let min = 0;
		for (const b of mcal.blocks) {
			const c = clipToDay(b.startAt, b.endAt, d, me.timezone);
			if (c) min += c.bottom - c.top;
		}
		heat.push({
			date: d,
			inMonth: Number(d.slice(5, 7)) === month,
			blockedMin: min,
			unblocked: unblocked.filter((i) => i.date && i.date <= d && (i.endDate ?? i.date) >= d).length,
		});
	}

	return {
		today,
		from,
		to,
		cal,
		// undated items have no other home in the UI: list them here too
		notBlocked: itemsRepo.withCounts([
			...itemsRepo.allDayUnblocked(me.id, from, to),
			...itemsRepo.unscheduled(me.id),
		]),
		month: { year, month, heat },
		stats: { done, doing, blockedH: Math.round((blockedMin / 60) * 10) / 10 },
	};
};
