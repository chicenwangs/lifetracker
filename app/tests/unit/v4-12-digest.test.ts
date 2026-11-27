// Card 12 (O-1 item 5, D-V4-13 / D-V4-19 / D-V4-30 / D-V4-37): the daily agenda digest. The same digestText serves
// the settings preview, the web push and the Android alarm; the mark lives in app_meta (user + local date).
import { beforeEach, expect, it, vi } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import * as meta from '../../src/lib/server/repo/meta';
import {
	digestCounts,
	digestDue,
	digestKey,
	digestNext,
	digestText,
	purgeDigest,
} from '../../src/lib/server/digest';
import { runDigests, tick } from '../../src/lib/server/jobs';
import { nativeSync } from '../../src/lib/server/native';
import { zIsoZ } from '../../src/lib/server/validate';

const D = '2026-11-13';

let me: App.SafeUser;

const mk = (username: string) =>
	usersRepo.createWithCalendar({ username, displayName: username, passwordHash: 'x', role: 'member' }).id;
const item = (input: Record<string, unknown>) => items.create(me.id, items.itemCreateSchema.parse(input));
const block = (input: Record<string, unknown>) => blocks.create(me.id, blocks.blockCreateSchema.parse(input));
const refresh = () => {
	me = usersRepo.safe(usersRepo.byId(me.id) as usersRepo.UserRow);
};
const setDigest = (digestTime: string | null) => {
	usersRepo.setPrefs(me.id, { digestTime });
	refresh();
};

beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	me = usersRepo.safe(usersRepo.byId(mk('jeremy')) as usersRepo.UserRow);
});

it('C3 counts that day’s own items and blocks: done, steps, other days and hidden types out; first = earliest', () => {
	const done = item({ title: 'Done', date: D, time: '08:00' });
	items.patch(me.id, done.id, { status: 'done' });
	const trip = item({ title: 'Trip', date: D });
	item({ title: 'Step', date: D, parentId: trip.id });
	item({ title: 'Other day', date: '2026-11-14' });
	item({ title: 'Nine', date: D, time: '09:00' });
	item({ title: 'All day', date: D });
	item({ title: 'Span', date: D, endDate: '2026-11-15' }); // middle day of a multi-day item
	item({ title: 'Gym', date: D, time: '18:00', rrule: 'FREQ=DAILY;COUNT=3' }); // one occurrence on D
	item({ title: 'Hobby', date: D, type: 'Hobby' });
	block({ label: 'Night', startAt: '2026-11-13T14:00:00Z', endAt: '2026-11-13T15:00:00Z' }); // 22:00 KL
	block({ label: 'Sleep', startAt: '2026-11-12T15:00:00Z', endAt: '2026-11-12T23:00:00Z' }); // began on the 12th
	// another account's rows are in another calendar: never counted
	const other = mk('neina');
	items.create(other, items.itemCreateSchema.parse({ title: 'Theirs', date: D }));

	// hidden types are dropped by agenda(), exactly as the planner shows them
	expect(digestCounts({ ...me, hiddenTypes: ['Hobby'] }, D)).toEqual({ items: 5, blocks: 1, first: 540 });
	expect(digestText({ ...me, hiddenTypes: ['Hobby'] }, D)).toBe('5 items · 1 block · first 09:00');
	// each row once on every day it covers: the multi-day item + the repeat occurrence
	expect(digestCounts({ ...me, hiddenTypes: ['Hobby'] }, '2026-11-14')).toEqual({
		items: 3, // Span, Other day, Gym@14
		blocks: 0,
		first: 1080, // Gym's own 18:00 on the 14th
	});
	// a day with only all-day items has no "first"
	item({ title: 'Late', date: '2026-11-20' });
	item({ title: 'All day too', date: '2026-11-20' });
	expect(digestText(me, '2026-11-20')).toBe('2 items');
	// nothing on -> no text (the preview says "Nothing on today." and no notification goes out)
	expect(digestText(me, '2026-11-21')).toBeNull();
});

it('C3 a block counts for the day it starts: a midnight-crossing block is not counted again on the next day', () => {
	block({ label: 'Sleep', startAt: '2026-11-13T14:00:00Z', endAt: '2026-11-13T23:00:00Z' }); // 22:00-07:00 KL

	expect(digestCounts(me, D)).toEqual({ items: 0, blocks: 1, first: 1320 });
	expect(digestText(me, D)).toBe('1 block · first 22:00');
	expect(digestText(me, '2026-11-14')).toBeNull();
});

it('C4 the Android date is at’s local date and uses the same text function', () => {
	setDigest('07:30');
	item({ title: 'Tomorrow', date: '2026-11-14', time: '09:00' });
	// 23:00 KL on the 13th: the next digest is the 14th's 07:30 (at's own local date)
	const now = Date.parse('2026-11-13T15:00:00Z');
	const next = digestNext(me, now);
	expect(next).toEqual({ at: '2026-11-13T23:30:00Z', text: '1 item · first 09:00' });
	expect(next?.text).toBe(digestText(me, '2026-11-14'));
	expect(zIsoZ.parse(next?.at as string)).toBe(next?.at);
});

it('C9 due now? 07:30 on the dot, the next local date after midnight, a marked date, tz, DST, no subscription', async () => {
	setDigest('07:30');
	item({ title: 'Today', date: D });
	item({ title: 'Tomorrow', date: '2026-11-14' });
	const at = (iso: string) => Date.parse(iso);

	expect(digestDue(me, at('2026-11-12T23:29:00Z'))).toBeNull(); // 07:29 KL, a minute early
	expect(digestDue(me, at('2026-11-12T23:30:00Z'))).toBe(D); // 07:30 KL
	// at 23:50 KL the day's push went out at 07:30, so it is not due again
	meta.set(digestKey(me.id, D), '2026-11-12T23:30:00Z');
	expect(digestDue(me, at('2026-11-13T15:50:00Z'))).toBeNull();
	// after midnight the next local date is a fresh key: its 07:30 is the next digest
	expect(digestDue(me, at('2026-11-13T16:05:00Z'))).toBeNull(); // 00:05 KL, 07:30 still ahead
	expect(digestNext(me, at('2026-11-13T16:05:00Z'))).toEqual({
		at: '2026-11-13T23:30:00Z',
		text: '1 item',
	});
	expect(digestDue(me, at('2026-11-13T23:30:00Z'))).toBe('2026-11-14');
	// a failed send or no live subscription leaves the date unmarked and due (D-V4-19)
	meta.del(digestKey(me.id, '2026-11-14'));
	const none: Send = async () => ({ sent: 0, failed: 0 });
	expect(await runDigests(at('2026-11-13T23:30:00Z'), none)).toBe(0);
	expect(meta.get(digestKey(me.id, '2026-11-14'))).toBeUndefined();
	expect(digestDue(me, at('2026-11-13T23:31:00Z'))).toBe('2026-11-14');
	// the same instant in another timezone is a different local clock (and date)
	meta.del(digestKey(me.id, D));
	expect(digestDue({ ...me, timezone: 'America/New_York' }, at('2026-11-13T20:00:00Z'))).toBe(D); // 15:00 EST
	expect(digestDue(me, at('2026-11-13T20:00:00Z'))).toBeNull(); // 04:00 KL on the 14th, 07:30 ahead
	// a DST transition day still sends once per local date
	usersRepo.setPrefs(me.id, { timezone: 'Europe/London' });
	refresh();
	item({ title: 'Spring', date: '2026-03-29' });
	item({ title: 'Monday', date: '2026-03-30' });
	const dstAt = Date.parse('2026-03-29T06:30:00Z'); // 07:30 BST
	expect(digestDue(me, dstAt - 60_000)).toBeNull();
	expect(digestDue(me, dstAt)).toBe('2026-03-29');
	meta.set(digestKey(me.id, '2026-03-29'), 'x');
	expect(digestDue(me, Date.parse('2026-03-29T22:00:00Z'))).toBeNull(); // 23:00 BST, same local date
	expect(digestDue(me, Date.parse('2026-03-30T06:30:00Z'))).toBe('2026-03-30');
});

type Send = Parameters<typeof runDigests>[1];

it('C5 the tick sends once per local day, marks only after a live send, retries a failure, purges old keys', async () => {
	const calls: { id: string; title: string; route: string }[] = [];
	const live: Send = async (id, p) => {
		calls.push({ id, title: p.title, route: p.route });
		return { sent: 1, failed: 0 };
	};
	item({ title: 'Today', date: D, time: '09:00' });
	item({ title: 'Nine', date: D });
	const now = Date.parse('2026-11-12T23:35:00Z'); // 07:35 KL

	// no digest time -> no push
	expect(await runDigests(now, live)).toBe(0);
	// notify_planner off -> no push
	usersRepo.setPrefs(me.id, { digestTime: '07:30', notifyPlanner: false });
	refresh();
	expect(await runDigests(now, live)).toBe(0);
	usersRepo.setPrefs(me.id, { notifyPlanner: true });
	refresh();

	expect(await runDigests(now, live)).toBe(1);
	expect(calls[0]).toEqual({ id: me.id, title: '2 items · first 09:00', route: '/today' });
	expect(meta.get(digestKey(me.id, D))).toBe('2026-11-12T23:35:00Z');
	// a marked date is never sent again
	expect(await runDigests(Date.parse('2026-11-13T01:00:00Z'), live)).toBe(0);
	expect(calls).toHaveLength(1);
});

it('C5 a failed send is logged and retried, and no live subscription leaves the date unmarked', async () => {
	item({ title: 'Today', date: D });
	setDigest('07:30');
	const now = Date.parse('2026-11-12T23:35:00Z');
	const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
	const failing: Send = async () => ({ sent: 0, failed: 1, error: 'push service error' });
	try {
		expect(await runDigests(now, failing)).toBe(0);
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('digest push failed'));
		expect(meta.get(digestKey(me.id, D))).toBeUndefined();
		expect(digestDue(me, now)).toBe(D); // still due for the next tick
		// an app-only user (no live subscription) keeps the date unmarked, so /api/native can set the alarm
		const quiet: Send = async () => ({ sent: 0, failed: 0 });
		expect(await runDigests(now, quiet)).toBe(0);
		expect(meta.get(digestKey(me.id, D))).toBeUndefined();
	} finally {
		spy.mockRestore();
	}
	// the real pushTo has no VAPID keys in tests: nothing sent, nothing marked
	usersRepo.setPrefs(me.id, { digestTime: '07:30' });
	refresh();
	await tick(now);
	expect(meta.get(digestKey(me.id, D))).toBeUndefined();
	expect(digestDue(me, now)).toBe(D);
});

it('C5 the tick purges digest keys older than a day and keeps today’s', () => {
	meta.set(digestKey('usr_old', '2026-11-01'), 'x');
	meta.set(digestKey('usr_old', '2026-11-12'), 'x');
	purgeDigest(Date.parse('2026-11-13T02:00:00Z'));
	expect(meta.keys('digest_sent:')).toEqual([digestKey('usr_old', '2026-11-12')]);
});

it('C7 /api/native digest = next local time + the text for its own date; null when off, marked or empty', () => {
	item({ title: 'Today', date: D, time: '09:00' });
	const now = Date.parse('2026-11-12T23:00:00Z'); // 07:00 KL, today's 07:30 is still ahead
	expect(nativeSync({ ...me, digestTime: null }, now).digest).toBeNull();
	expect(nativeSync({ ...me, digestTime: '07:30', notifyPlanner: false }, now).digest).toBeNull();
	expect(nativeSync({ ...me, digestTime: '07:30' }, now).digest).toEqual({
		at: '2026-11-12T23:30:00Z',
		text: '1 item · first 09:00',
	});
	// 07:30 passed: the next one is tomorrow, and tomorrow has nothing on -> no alarm
	const later = Date.parse('2026-11-13T00:00:00Z'); // 08:00 KL
	expect(nativeSync({ ...me, digestTime: '07:30' }, later).digest).toBeNull();
	item({ title: 'Tomorrow', date: '2026-11-14', time: '18:00' });
	expect(nativeSync({ ...me, digestTime: '07:30' }, later).digest).toEqual({
		at: '2026-11-13T23:30:00Z',
		text: '1 item · first 18:00',
	});
	// the web job marked that date: the app must not send a second one (D-V4-13)
	meta.set(digestKey(me.id, '2026-11-14'), 'x');
	expect(nativeSync({ ...me, digestTime: '07:30' }, later).digest).toBeNull();
});
