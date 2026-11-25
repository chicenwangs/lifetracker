// v3.3 PR 12: the daily agenda push (DESIGN §1.4). Counts + the first time only — never titles.
// Today = owner-local day; own calendar only (no partner items), hidden types dropped by agenda(), no Slipped.
import { addDays, clipToDay, hhmm, localToUtc, nowLocalMinutes, todayLocal } from '$lib/time';
import { handle } from './db';
import { agenda } from './agenda';
import * as meta from './repo/meta';
import * as usersRepo from './repo/users';

/** "4 items · 2 blocks · first 09:00" for one local day, or null when nothing is on. */
export function digestText(me: App.SafeUser, day: string): string | null {
	const cal = agenda(me, day, addDays(day, 1));
	const items = cal.items.filter(
		(i) => i.date && i.date <= day && (i.endDate ?? i.date) >= day && i.status !== 'done',
	);
	const blocks = cal.blocks
		.map((b) => clipToDay(b.startAt, b.endAt, day, me.timezone))
		.filter((c): c is NonNullable<typeof c> => !!c);
	const first = [
		...items.filter((i) => i.time).map((i) => i.time as string),
		...blocks.map((c) => hhmm(c.top)),
	].sort()[0];
	const parts: string[] = [];
	if (items.length) parts.push(`${items.length} item${items.length === 1 ? '' : 's'}`);
	if (blocks.length) parts.push(`${blocks.length} block${blocks.length === 1 ? '' : 's'}`);
	if (!parts.length) return null;
	return parts.join(' · ') + (first ? ` · first ${first}` : '');
}

/** the next time this user's digest fires: today HH:MM if still ahead, else tomorrow HH:MM (owner tz). */
export function nextDigestAt(me: App.SafeUser, now = Date.now()): { at: string; date: string } | null {
	if (!me.digestTime) return null;
	const hm = me.digestTime.split(':');
	const h = Number(hm[0]);
	const m = Number(hm[1]);
	const today = todayLocal(me.timezone, now);
	let date = today;
	let at = localToUtc(today, h * 60 + m, me.timezone);
	if (Date.parse(at) <= now) {
		date = addDays(today, 1);
		at = localToUtc(date, h * 60 + m, me.timezone);
	}
	return { at, date };
}

/** Android payload: the next alarm and the text for that day; null = do not schedule one. */
export function nativeDigest(me: App.SafeUser, now = Date.now()): { at: string; text: string } | null {
	if (!me.notifyPlanner) return null;
	const next = nextDigestAt(me, now);
	if (!next) return null;
	const text = digestText(me, next.date);
	return text ? { at: next.at, text } : null;
}

/** Digests to send now: local time ≥ digest_time, not sent today, planner reminders on, something on.
 *  Marks the day in app_meta (no new table) before the caller sends, so a slow push cannot double-send. */
export function digestsDue(now = Date.now()): { userId: string; text: string }[] {
	const rows = handle()
		.sqlite.prepare(
			`SELECT id, timezone, digest_time, notify_planner FROM users WHERE digest_time IS NOT NULL`,
		)
		.all() as { id: string; timezone: string; digest_time: string; notify_planner: number }[];
	const out: { userId: string; text: string }[] = [];
	for (const r of rows) {
		if (!r.notify_planner) continue;
		const hm = r.digest_time.split(':');
		if (nowLocalMinutes(r.timezone, now) < Number(hm[0]) * 60 + Number(hm[1])) continue;
		const day = todayLocal(r.timezone, now);
		const key = `digest:${r.id}:${day}`;
		if (meta.get(key)) continue;
		const row = usersRepo.byId(r.id);
		const text = row ? digestText(usersRepo.safe(row), day) : null;
		meta.set(key, text ? '1' : '0'); // a day with nothing on is also done
		if (text) out.push({ userId: r.id, text });
	}
	return out;
}
