// Daily agenda digest (card 12, O-1 item 5, D-V4-13 / D-V4-19 / D-V4-30 / D-V4-37). Own items + own planner
// blocks only, never partner/shared rows or steps. One text function serves the settings preview, the web push
// and the Android alarm; the mark lives in app_meta (one key per user + local date), never a table.
import { agenda } from './agenda';
import * as meta from './repo/meta';
import * as usersRepo from './repo/users';
import { addDays, hhmm, localToUtc, minutesOf, nowLocalMinutes, todayLocal, utcToLocal } from '$lib/time';

/** the client sends this on the first switch to On (D-V4-30: no server-side default write) */
export const DEFAULT_DIGEST_TIME = '07:30';

/** own rows on that local date: top-level, not done, each row once; blocks count for the day they start */
export interface DigestCounts {
	items: number;
	blocks: number;
	/** minutes from the local 00:00 of the earliest timed item / block start; null = all-day only */
	first: number | null;
}

export function digestCounts(me: App.SafeUser, date: string): DigestCounts {
	const day = agenda(me, date, addDays(date, 1));
	const rows = day.items.filter((i) => !i.parentId && i.status !== 'done');
	// a multi-day repeat whose span is longer than its interval overlaps one day with several occurrences:
	// count its series once (C3, D-V4-37), like the one row the planner draws for it
	const seen = new Set<string>();
	const items = rows.filter((i) => {
		const key = i.seriesId ?? i.id;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	const blocks = day.blocks.filter((b) => utcToLocal(b.startAt, me.timezone).date === date);
	let first: number | null = null;
	const earlier = (m: number) => {
		if (first === null || m < first) first = m;
	};
	for (const i of rows) if (i.date === date && i.time) earlier(minutesOf(i.time));
	for (const b of blocks) earlier(utcToLocal(b.startAt, me.timezone).minutes);
	return { items: items.length, blocks: blocks.length, first };
}

/** "4 items · 2 blocks · first 09:00"; null = nothing on that day (no push, preview says so) */
export function digestText(me: App.SafeUser, date: string): string | null {
	const c = digestCounts(me, date);
	if (!c.items && !c.blocks) return null;
	const n = (v: number, word: string) => `${v} ${word}${v === 1 ? '' : 's'}`;
	const parts: string[] = [];
	if (c.items) parts.push(n(c.items, 'item'));
	if (c.blocks) parts.push(n(c.blocks, 'block'));
	if (c.first !== null) parts.push(`first ${hhmm(c.first)}`);
	return parts.join(' · ');
}

export const DIGEST_KEY = 'digest_sent:';
export const digestKey = (userId: string, date: string) => `${DIGEST_KEY}${userId}:${date}`;
export const digestMarked = (userId: string, date: string) => !!meta.get(digestKey(userId, date));

/** the local date a push is due for now, or null (C5): time passed, notify on, unmarked, day not empty */
export function digestDue(me: App.SafeUser, now: number = Date.now()): string | null {
	if (!me.digestTime || !me.notifyPlanner) return null;
	const date = todayLocal(me.timezone, now);
	if (nowLocalMinutes(me.timezone, now) < minutesOf(me.digestTime)) return null;
	if (digestMarked(me.id, date)) return null;
	return digestText(me, date) ? date : null;
}

/** /api/native: the next local digest instant + the text for its own local date (C7); null = nothing to alarm */
export function digestNext(me: App.SafeUser, now: number = Date.now()): { at: string; text: string } | null {
	if (!me.digestTime || !me.notifyPlanner) return null;
	const today = todayLocal(me.timezone, now);
	let date = today;
	let at = localToUtc(today, me.digestTime, me.timezone);
	if (Date.parse(at) <= now) {
		date = addDays(today, 1);
		at = localToUtc(date, me.digestTime, me.timezone);
	}
	if (digestMarked(me.id, date)) return null;
	const text = digestText(me, date);
	return text ? { at, text } : null;
}

/** drop marks older than a day (D-V4-30): the key set would otherwise grow forever. The cutoff follows each
 *  owner's local date, so a key west of UTC is not dropped while it is less than a day old. */
export function purgeDigest(now: number = Date.now()): void {
	const utcCutoff = addDays(new Date(now).toISOString().slice(0, 10), -1);
	for (const key of meta.keys(DIGEST_KEY)) {
		const rest = key.slice(DIGEST_KEY.length);
		const at = rest.lastIndexOf(':');
		const owner = at > 0 ? usersRepo.byId(rest.slice(0, at)) : undefined;
		const cutoff = owner ? addDays(todayLocal(owner.timezone, now), -1) : utcCutoff;
		if (rest.slice(at + 1) < cutoff) meta.del(key);
	}
}
