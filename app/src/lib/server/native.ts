// Android app sync (mobile/): one GET feeds every widget and the reminder alarms. The server does the work
// (owner's timezone, hidden types, colours, order, countdowns) so the native side only draws strings.
import { agenda, rowsOn } from './agenda';
import { getCalendar } from './calendar';
import * as itemTypes from './repo/itemtypes';
import * as itemsRepo from './repo/items';
import * as keep from './repo/keep';
import { upcoming } from './reminders';
import { nativeDigest } from './digest';
import { addDays, examCountdown, prettyDate, todayLocal, weekdayOf } from '$lib/time';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function nativeSync(me: App.SafeUser, now = Date.now()) {
	const tz = me.timezone;
	const day = todayLocal(tz, now);
	const h12 = me.region === 'us';
	const types = new Map(itemTypes.list(me.id).map((t) => [t.key, t]));
	const hidden = (t: string | null) => me.hiddenTypes.includes(t ?? 'None');
	const paint = (t: string | null) => {
		const x = types.get(t ?? '');
		return { bg: x?.bg ?? null, ink: x?.ink ?? null };
	};

	const week = agenda(me, day, addDays(day, 7));
	const rows = rowsOn(week, day, tz, h12, paint).slice(0, 40);

	// next 7 days at a glance: timed rows + all-day items, 3 titles each
	const days = Array.from({ length: 7 }, (_, n) => {
		const d = addDays(day, n);
		const timed = rowsOn(week, d, tz, h12, paint);
		const allDay = week.items.filter((i) => !i.time && i.date === d && i.status !== 'done');
		return {
			date: d,
			label: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${WD[weekdayOf(d) - 1]} ${Number(d.slice(8))}`,
			count: timed.length + allDay.length,
			top: [...allDay.map((i) => ({ time: '', title: i.title, ...paint(i.type) })), ...timed]
				.slice(0, 3)
				.map((r) => ({ time: r.time, title: r.title || 'Untitled', bg: r.bg })),
		};
	});

	// "No time set today": what still needs doing today, tickable
	const todos = itemsRepo
		.dueOn(me.id, day)
		.filter((i) => !i.time && !i.parentId && !hidden(i.type))
		.slice(0, 20)
		.map((i) => ({ id: i.id, title: i.title || 'Untitled', status: i.status, ...paint(i.type) }));

	// countdowns: items of "counts down" types, next 60 days, soonest first
	const ahead = getCalendar(me, day, addDays(day, 60), { shared: false });
	const countdowns = ahead.items
		.flatMap((i) => {
			const cd = examCountdown(i, day, !!types.get(i.type ?? '')?.countsDown);
			return cd && cd.days >= 0 ? [{ id: i.id, title: i.title || 'Untitled', date: i.date as string, days: cd.days, label: cd.long, when: prettyDate(i.date as string).replace(/ \d{4}$/, ''), ...paint(i.type) }] : []; // prettier-ignore
		})
		.sort((a, b) => a.days - b.days)
		.slice(0, 10);

	const notes = keep
		.list(me.id)
		.slice(0, 20)
		.map((n) => {
			const items = n.items.filter((i) => !i.parentId).slice(0, 6);
			const text =
				n.type === 'checklist' ? items.map((i) => (i.checked ? '☑ ' : '☐ ') + i.text).join('\n') : n.body;
			return { id: n.id, title: n.title.trim(), text: text.trim().slice(0, 240), pinned: n.pinned, color: n.color, checklist: n.type === 'checklist' }; // prettier-ignore
		});

	return {
		day,
		label: prettyDate(day),
		theme: { mode: me.themeMode, lightStart: me.themeLightStart, darkStart: me.themeDarkStart },
		rows,
		days,
		todos,
		countdowns,
		notes,
		reminders: upcoming(me.id, now),
		digest: nativeDigest(me, now),
	};
}
