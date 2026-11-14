// Android app sync (mobile/): one GET feeds both widgets and the reminder alarms. The server does the work
// (owner's timezone, hidden types, colours, order) so the native side only draws strings.
import { getCalendar } from './calendar';
import * as itemTypes from './repo/itemtypes';
import * as keep from './repo/keep';
import { upcoming } from './reminders';
import { addDays, clock, prettyDate, todayLocal, utcToLocal } from '$lib/time';

export function nativeSync(me: App.SafeUser, now = Date.now()) {
	const tz = me.timezone;
	const day = todayLocal(tz, now);
	const h12 = me.region === 'us';
	const types = new Map(itemTypes.list(me.id).map((t) => [t.key, t.bg]));
	const hidden = (t: string | null) => me.hiddenTypes.includes(t ?? 'None');
	const cal = getCalendar(me, day, addDays(day, 1), { shared: false });
	// same rules as Today: minutes from the day's 00:00, timed items count as 60 min
	const mins = (iso: string) => {
		const l = utcToLocal(iso, tz);
		return l.minutes + (l.date < day ? -1440 : l.date > day ? 1440 : 0);
	};
	const rows = [
		...cal.blocks.map((b) => ({ start: mins(b.startAt), end: mins(b.endAt), title: b.label, type: b.itemType ?? b.type, done: b.status === 'done' })), // prettier-ignore
		...cal.items
			.filter((i) => i.time && i.date === day && !i.parentId)
			.map((i) => {
				const s = Number(i.time?.slice(0, 2)) * 60 + Number(i.time?.slice(3, 5));
				return { start: s, end: s + 60, title: i.title, type: i.type, done: i.status === 'done' };
			}),
	]
		.filter((r) => r.end > 0 && r.start < 1440 && !hidden(r.type))
		.sort((a, b) => a.start - b.start)
		.slice(0, 30)
		.map((r) => ({
			time: clock(Math.max(r.start, 0), h12),
			start: r.start,
			end: r.end,
			title: r.title || 'Untitled',
			color: types.get(r.type ?? '') ?? null,
			done: r.done,
		}));
	const notes = keep
		.list(me.id)
		.slice(0, 8)
		.map((n) => {
			const text =
				n.type === 'checklist' ? n.items.map((i) => (i.checked ? '✓ ' : '• ') + i.text).join('\n') : n.body;
			return { id: n.id, title: n.title.trim(), text: text.trim().slice(0, 140), pinned: n.pinned };
		});
	return { day, label: prettyDate(day), rows, notes, reminders: upcoming(me.id, now) };
}
