import type { PageServerLoad } from './$types';
import { getCalendar } from '$lib/server/calendar';
import * as itemsRepo from '$lib/server/repo/items';
import { addDays, durationMin, isDate, todayLocal, weekRange } from '$lib/time';

export const load: PageServerLoad = ({ locals, url }) => {
	const me = locals.user as App.SafeUser;
	const today = todayLocal(me.timezone);
	const w = url.searchParams.get('w');
	const { from, to } = weekRange(w && isDate(w) ? w : today);
	const cal = getCalendar(me, from, to);
	const done = cal.items.filter((i) => i.status === 'done').length;
	const doing = cal.items.filter((i) => i.status === 'doing').length;
	const blockedMin = cal.blocks.reduce((s, b) => s + Math.max(0, durationMin(b.startAt, b.endAt)), 0);
	return {
		today,
		from,
		to,
		cal,
		dueSoon: itemsRepo.withCounts(
			itemsRepo.dueSoonUnblocked(me.id, today < from ? from : today, addDays(to, 7)),
		),
		unscheduled: itemsRepo.withCounts(itemsRepo.unscheduled(me.id)),
		stats: { done, doing, blockedH: Math.round((blockedMin / 60) * 10) / 10 },
	};
};
