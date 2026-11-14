// Android app sync (mobile/): one GET feeds every widget and the reminder alarms. The server does the work
// (owner's timezone, hidden types, colours, order, countdowns) so the native side only draws strings.
import { getCalendar } from './calendar';
import * as itemTypes from './repo/itemtypes';
import * as itemsRepo from './repo/items';
import * as keep from './repo/keep';
import { upcoming } from './reminders';
import { addDays, clock, examCountdown, prettyDate, todayLocal, utcToLocal, weekdayOf } from '$lib/time';
import type { CalendarPayload } from '$lib/types';

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

	/** Today's rules for one day: minutes from its 00:00, timed items count as 60 min, hidden types out */
	const rowsOn = (cal: CalendarPayload, d: string) => {
		const mins = (iso: string) => {
			const l = utcToLocal(iso, tz);
			return l.minutes + (l.date < d ? -1440 : l.date > d ? 1440 : 0);
		};
		return [
			...cal.blocks.map((b) => ({ id: b.id, kind: 'block', start: mins(b.startAt), end: mins(b.endAt), title: b.label, type: b.itemType ?? b.type, status: b.status })), // prettier-ignore
			...cal.items
				.filter((i) => i.time && i.date === d)
				.map((i) => {
					const s = Number(i.time?.slice(0, 2)) * 60 + Number(i.time?.slice(3, 5));
					return {
						id: i.id,
						kind: 'item',
						start: s,
						end: s + 60,
						title: i.title,
						type: i.type,
						status: i.status,
					};
				}),
		]
			.filter((r) => r.end > 0 && r.start < 1440 && !hidden(r.type))
			.sort((a, b) => a.start - b.start)
			.map((r) => ({
				id: r.id,
				kind: r.kind,
				time: clock(Math.max(r.start, 0), h12),
				endTime: clock(Math.min(r.end, 1440), h12),
				start: r.start,
				end: r.end,
				title: r.title || 'Untitled',
				status: r.status,
				...paint(r.type),
			}));
	};

	const week = getCalendar(me, day, addDays(day, 7), { shared: false });
	const rows = rowsOn(week, day).slice(0, 40);

	// next 7 days at a glance: timed rows + all-day items, 3 titles each
	const days = Array.from({ length: 7 }, (_, n) => {
		const d = addDays(day, n);
		const timed = rowsOn(week, d);
		const allDay = week.items.filter(
			(i) => !i.time && i.date === d && !hidden(i.type) && i.status !== 'done',
		);
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
	};
}
