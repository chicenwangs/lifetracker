// Blind tests for card 12 (daily digest), from its Done-when lines only: C2–C7, C9, C11.
// No builder test was opened. In-memory DB only: the real data folder is never touched.
import { beforeEach, expect, it, vi } from 'vitest';
import { freshDb } from './helpers';
import type { Handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import * as itemTypes from '../../src/lib/server/repo/itemtypes';
import * as sharekeys from '../../src/lib/server/repo/sharekeys';
import * as meta from '../../src/lib/server/repo/meta';
import {
	DEFAULT_DIGEST_TIME,
	digestCounts,
	digestDue,
	digestKey,
	digestMarked,
	digestText,
} from '../../src/lib/server/digest';
import { jobsRunning, pushTo, runDigests, start, stop, subscribe, tick } from '../../src/lib/server/jobs';
import { nativeSync } from '../../src/lib/server/native';
import { getCalendar } from '../../src/lib/server/calendar';
import { PATCH } from '../../src/routes/api/me/prefs/+server';
import { load as notificationsLoad } from '../../src/routes/settings/notifications/+page.server';
import { zIsoZ } from '../../src/lib/server/validate';
import { addDays, localToUtc, todayLocal } from '../../src/lib/time';

const TZ = 'Asia/Kuala_Lumpur';
const DAY = '2026-12-10';

let h: Handle;
let me: App.SafeUser;

const mk = (username: string) => {
	const row = usersRepo.createWithCalendar({
		username,
		displayName: username,
		passwordHash: 'x',
		role: 'member',
	});
	return usersRepo.safe(row);
};
const reload = () => (me = usersRepo.safe(usersRepo.byId(me.id)!));
const item = (owner: string, over: Record<string, unknown> = {}) =>
	items.create(owner, items.itemCreateSchema.parse({ title: 'Blind 12 item', ...over }));
const block = (label: string, date: string, from: string, endDate = date, to = '23:59') =>
	blocks.create(
		me.id,
		blocks.blockCreateSchema.parse({
			label,
			startAt: localToUtc(date, from, TZ),
			endAt: localToUtc(endDate, to, TZ),
		}),
	);
const count = (sql: string) => (h.sqlite.prepare(sql).get() as { n: number }).n;
const journalCount = () => count('SELECT count(*) AS n FROM undo_actions');

const prefs = async (payload: unknown) =>
	PATCH({
		locals: { user: me },
		request: new Request('http://localhost:5173/api/me/prefs', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
		}),
	} as unknown as Parameters<typeof PATCH>[0]);

beforeEach(() => {
	h = freshDb({ JOBS_ENABLED: 'true', REMINDER_POLL_INTERVAL_MS: '1000' });
	me = mk('jeremy');
	usersRepo.setPrefs(me.id, { timezone: TZ });
	reload();
});

// ---- C2 ---------------------------------------------------------------------------------------------------
it('C2 PATCH /api/me/prefs takes digestTime by the strict zTime rule, Off stores NULL, SafeUser exposes it and no table is added', async () => {
	// On: HH:MM stored on the users row and returned to the client
	const on = await prefs({ digestTime: '08:05' });
	expect(on.status).toBe(200);
	const onBody = (await on.json()) as { user: App.SafeUser };
	expect(onBody.user.digestTime).toBe('08:05');
	expect(usersRepo.byId(me.id)?.digestTime).toBe('08:05');
	expect(usersRepo.safe(usersRepo.byId(me.id)!).digestTime).toBe('08:05');
	expect(DEFAULT_DIGEST_TIME).toBe('07:30'); // the client sends this on the first On (C1)

	// Off: NULL
	const off = await prefs({ digestTime: null });
	expect(off.status).toBe(200);
	expect(((await off.json()) as { user: App.SafeUser }).user.digestTime).toBeNull();
	expect(usersRepo.byId(me.id)?.digestTime).toBeNull();

	// the existing strict HH:MM rule: a bad time, a number, a boolean and an unknown key are refused
	for (const [bad, message] of [
		[{ digestTime: '7:30' }, /must be HH:MM/],
		[{ digestTime: '24:00' }, /must be HH:MM/],
		[{ digestTime: '09:60' }, /must be HH:MM/],
		[{ digestTime: 730 }, /./],
		[{ digestTime: true }, /./],
		[{ digestTime: '08:05', junk: 1 }, /Unrecognized key/],
	] as const) {
		const r = await prefs(bad);
		expect(r.status, JSON.stringify(bad)).toBe(400);
		const text = ((await r.json()) as { error: { message: string } }).error.message;
		expect(text).toMatch(message);
	}
	expect(usersRepo.byId(me.id)?.digestTime).toBeNull(); // refused writes changed nothing

	// no new table: dedupe lives in app_meta
	const tables = h.sqlite
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%digest%'`)
		.all() as { name: string }[];
	expect(tables).toEqual([]);
	expect(meta.get(digestKey(me.id, DAY))).toBeUndefined();
});

// ---- C3 ---------------------------------------------------------------------------------------------------
it('C3 digestText counts that day’s own top-level items and blocks once, hides hidden/partner/Slipped/steps/done/other days, and a midnight block counts on its start day', () => {
	const partner = mk('partner');
	const offCal = itemTypes.create(me.id, itemTypes.createSchema.parse({ name: 'BlindOff', bg: '#123456' }));
	itemTypes.patch(me.id, offCal.id, { onCalendar: false });
	usersRepo.setPrefs(me.id, { hiddenTypes: ['Hobby'], overlapOn: true });
	sharekeys.redeem(
		me.id,
		sharekeys.create(partner.id, { types: ['Work'], hiddenAs: 'none', expiry: '7d' }).code,
	);
	reload();
	// the partner row really is visible through the existing overlap path; the digest must still skip it
	item(partner.id, { title: 'C3 partner', type: 'Work', date: DAY });
	expect(getCalendar(me, DAY, addDays(DAY, 1)).items.map((i) => i.title)).toContain('C3 partner');

	const allDay = item(me.id, { title: 'C3 all day', date: DAY });
	const timed = item(me.id, { title: 'C3 timed', date: DAY, time: '09:30' });
	item(me.id, { title: 'C3 off calendar', type: offCal.key, date: DAY }); // on_calendar = 0 still counts
	item(me.id, { title: 'C3 span', date: addDays(DAY, -1), endDate: addDays(DAY, 1) }); // one row
	item(me.id, { title: 'C3 repeat', date: addDays(DAY, -1), rrule: 'FREQ=DAILY;COUNT=3' }); // occurrence DAY once
	item(me.id, { title: 'C3 done', date: DAY, status: 'done' });
	item(me.id, { title: 'C3 step', date: DAY, parentId: allDay.id });
	item(me.id, { title: 'C3 hidden', type: 'Hobby', date: DAY });
	item(me.id, { title: 'C3 slipped', date: addDays(DAY, -1) }); // overdue, not on the day
	item(me.id, { title: 'C3 next day', date: addDays(DAY, 1) });

	// blocks: one on the day, one that began the night before (start-day rule), one crossing out of the day
	block('C3 morning', DAY, '08:00', DAY, '09:00');
	block('C3 overnight', addDays(DAY, -1), '23:00', DAY, '01:00');
	block('C3 late', DAY, '23:00', addDays(DAY, 1), '01:00');
	block('C3 next', addDays(DAY, 1), '10:00', addDays(DAY, 1), '11:00');

	expect(digestCounts(me, DAY)).toEqual({ items: 5, blocks: 2, first: 8 * 60 });
	expect(digestText(me, DAY)).toBe('5 items · 2 blocks · first 08:00');
	// the 23:00 block counts only on DAY; the night-before block never appears again
	expect(digestCounts(me, addDays(DAY, 1)).blocks).toBe(1);
	expect(digestCounts(me, addDays(DAY, -1)).blocks).toBe(1);

	// nothing on: no text (the preview's fallback is "Nothing on today.")
	expect(digestText(me, addDays(DAY, 30))).toBeNull();
	// and the timed item's own time really is part of "first"
	expect(timed.time).toBe('09:30');
});

// ---- C4 ---------------------------------------------------------------------------------------------------
it('C4 first HH:MM is the earliest timed item or block start, zero segments are omitted, and the preview, push and Android text all come from digestText', async () => {
	const D = '2026-12-20';
	// all-day only: first is omitted
	item(me.id, { title: 'C4 a', date: D });
	item(me.id, { title: 'C4 b', date: D });
	expect(digestText(me, D)).toBe('2 items');

	// block 09:15 is earlier than the timed item 10:45
	item(me.id, { title: 'C4 timed', date: D, time: '10:45' });
	block('C4 nine', D, '09:15', D, '10:00');
	expect(digestText(me, D)).toBe('3 items · 1 block · first 09:15');

	// a timed item earlier than the block wins
	item(me.id, { title: 'C4 early', date: D, time: '08:05' });
	expect(digestText(me, D)).toBe('4 items · 1 block · first 08:05');

	// only one block, no items: zero segments are omitted (D-V4-52)
	const E = '2026-12-21';
	block('C4 only block', E, '07:05', E, '08:00');
	expect(digestText(me, E)).toBe('1 block · first 07:05');

	// preview (today) is the same function for the signed-in user; a real today row proves it is not empty
	const today = todayLocal(TZ);
	item(me.id, { title: 'C4 today', date: today });
	const todayText = digestText(me, today);
	const loaded = (await notificationsLoad({ locals: { user: me } } as unknown as Parameters<
		typeof notificationsLoad
	>[0])) as { digestPreview: string | null };
	expect(loaded.digestPreview).toBe(todayText);

	// the push at 07:30 today uses the same text (entry under jobs.tick)
	const NOW = Date.parse(localToUtc(today, DEFAULT_DIGEST_TIME, TZ));
	usersRepo.setPrefs(me.id, { digestTime: DEFAULT_DIGEST_TIME, notifyPlanner: true });
	reload();
	const calls: { title: string }[] = [];
	await runDigests(NOW, async (_id, payload) => {
		calls.push({ title: payload.title });
		return { sent: 1, failed: 0 };
	});
	expect(calls[0]?.title).toBe(todayText);

	// Android: the text describes the local date of `at` (today ahead, tomorrow after the time)
	const D2 = '2026-12-22';
	usersRepo.setPrefs(me.id, { digestTime: '07:30', notifyPlanner: true, timezone: TZ });
	reload();
	item(me.id, { title: 'C4 d2', date: D2 });
	item(me.id, { title: 'C4 d3', date: addDays(D2, 1) });
	const ahead = nativeSync(me, Date.parse(localToUtc(D2, '06:00', TZ))).digest!;
	expect(ahead.text).toBe(digestText(me, D2));
	const after = nativeSync(me, Date.parse(localToUtc(D2, '09:00', TZ))).digest!;
	expect(after.text).toBe(digestText(me, addDays(D2, 1)));
});

// ---- C5 ---------------------------------------------------------------------------------------------------
it('C5 the job sends once per local day, marks only a real send, retries a failure or no subscription, purges old marks and keeps the poll interval', async () => {
	const today = todayLocal(TZ);
	item(me.id, { title: 'C5 today', date: today });
	usersRepo.setPrefs(me.id, { digestTime: DEFAULT_DIGEST_TIME, notifyPlanner: true });
	reload();
	const dueAt = Date.parse(localToUtc(today, DEFAULT_DIGEST_TIME, TZ));

	// one minute early: nothing
	const early: { id: string }[] = [];
	await runDigests(dueAt - 60_000, async (id) => {
		early.push({ id });
		return { sent: 1, failed: 0 };
	});
	expect(early).toEqual([]);
	expect(digestMarked(me.id, today)).toBe(false);

	// a live subscription took it: mark and never again
	const sent: { id: string }[] = [];
	const sendOne: typeof pushTo = async (id) => {
		sent.push({ id });
		return { sent: 1, failed: 0 };
	};
	expect(await runDigests(dueAt, sendOne)).toBe(1);
	expect(sent).toHaveLength(1);
	expect(digestMarked(me.id, today)).toBe(true);
	expect(digestDue(me, dueAt)).toBeNull();
	expect(await runDigests(dueAt + 60_000, sendOne)).toBe(0);
	expect(sent).toHaveLength(1); // a marked date is never sent again

	// failed send: logged, unmarked, due again and retried
	meta.del(digestKey(me.id, today));
	const err = vi.spyOn(console, 'error').mockImplementation(() => {});
	const failures: number[] = [];
	const sendFail: typeof pushTo = async () => {
		failures.push(1);
		return { sent: 0, failed: 1, error: 'push service error' };
	};
	expect(await runDigests(dueAt, sendFail)).toBe(0);
	expect(failures).toHaveLength(1);
	expect(digestMarked(me.id, today)).toBe(false);
	expect(digestDue(me, dueAt)).toBe(today);
	await runDigests(dueAt + 60_000, sendFail); // the next tick retries
	expect(failures).toHaveLength(2);
	expect(err.mock.calls.some((c) => String(c[0]).includes('digest push failed'))).toBe(true);
	err.mockRestore();

	// no live subscription: unmarked and due, so /api/native can still set the Android alarm
	meta.del(digestKey(me.id, today));
	expect(await runDigests(dueAt, async () => ({ sent: 0, failed: 0 }))).toBe(0);
	expect(digestMarked(me.id, today)).toBe(false);
	expect(digestDue(me, dueAt)).toBe(today);

	// the send conditions gate it: notify_planner off, and an empty day, neither marks
	usersRepo.setPrefs(me.id, { notifyPlanner: false });
	reload();
	expect(digestDue(me, dueAt)).toBeNull();
	usersRepo.setPrefs(me.id, { notifyPlanner: true, digestTime: null });
	reload();
	expect(digestDue(me, dueAt)).toBeNull();
	usersRepo.setPrefs(me.id, { digestTime: DEFAULT_DIGEST_TIME });
	reload();
	const other = mk('empty');
	usersRepo.setPrefs(other.id, { timezone: TZ, digestTime: DEFAULT_DIGEST_TIME, notifyPlanner: true });
	const emptySend: string[] = [];
	await runDigests(dueAt, async (id) => {
		emptySend.push(id);
		return { sent: 1, failed: 0 };
	});
	expect(emptySend).not.toContain(other.id);

	// the same tick purges marks older than a day; yesterday and today stay
	const oldKey = digestKey('usr_old', '2026-12-01');
	const yesterdayKey = digestKey('usr_old', '2026-12-08');
	const todayKey = digestKey('usr_old', '2026-12-09');
	meta.set(oldKey, 'x');
	meta.set(yesterdayKey, 'y');
	meta.set(todayKey, 'z');
	await tick(Date.parse('2026-12-09T12:00:00Z'));
	expect(meta.get(oldKey)).toBeUndefined();
	expect(meta.get(yesterdayKey)).toBe('y');
	expect(meta.get(todayKey)).toBe('z');

	// jobs.start keeps the interval from REMINDER_POLL_INTERVAL_MS (1000 here, not the 30 s default)
	h.sqlite
		.prepare(
			`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, due_at, status, created_at, updated_at) VALUES (?, ?, 'planner_item', 'itm_missing', 'absolute', '2020-01-01T00:00:00Z', 'scheduled', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`,
		)
		.run('rem_blind12', me.id);
	start();
	try {
		expect(jobsRunning()).toBe(true);
		await new Promise((r) => setTimeout(r, 1600));
		expect(
			(
				h.sqlite.prepare(`SELECT status FROM reminders WHERE id = 'rem_blind12'`).get() as {
					status: string;
				}
			).status,
		).toBe('cancelled');
	} finally {
		stop();
	}
	expect(jobsRunning()).toBe(false);
});

// ---- C6 ---------------------------------------------------------------------------------------------------
it('C6 push payload is title = digest text with no body and route /today, a failure is logged without throwing, and no reminder or undo row is written', async () => {
	const today = todayLocal(TZ);
	item(me.id, { title: 'C6 today', date: today });
	usersRepo.setPrefs(me.id, { digestTime: DEFAULT_DIGEST_TIME, notifyPlanner: true });
	reload();
	const dueAt = Date.parse(localToUtc(today, DEFAULT_DIGEST_TIME, TZ));
	const remindersBefore = count('SELECT count(*) AS n FROM reminders');
	const journalBefore = journalCount();
	const payloads: Parameters<typeof pushTo>[1][] = [];
	const send: typeof pushTo = async (_id, payload) => {
		payloads.push(payload);
		return { sent: 1, failed: 0 };
	};

	await runDigests(dueAt, send);
	expect(payloads).toHaveLength(1);
	expect(payloads[0]).toEqual({ title: digestText(me, today), route: '/today' });
	expect(payloads[0]).not.toHaveProperty('body');
	expect(count('SELECT count(*) AS n FROM reminders')).toBe(remindersBefore);
	expect(journalCount()).toBe(journalBefore);

	// a failed push is logged and never throws
	meta.del(digestKey(me.id, today));
	const err = vi.spyOn(console, 'error').mockImplementation(() => {});
	await expect(
		runDigests(dueAt, async () => ({ sent: 0, failed: 1, error: 'push service error' })),
	).resolves.toBe(0);
	expect(err.mock.calls.some((c) => String(c[0]).includes('digest push failed'))).toBe(true);
	err.mockRestore();

	// devices still go through the existing host allowlist: a non push-service URL is revoked, never posted
	h = freshDb({ VAPID_PUBLIC_KEY: 'blind-public-key', VAPID_PRIVATE_KEY: 'blind-private-key' });
	const a = mk('alice');
	subscribe(
		a.id,
		{ endpoint: 'https://127.0.0.1/not-a-push-service', keys: { p256dh: 'p', auth: 'a' } },
		null,
	);
	expect(await pushTo(a.id, { title: 'x', route: '/today' })).toEqual({ sent: 0, failed: 0 });
	expect(
		(
			h.sqlite.prepare(`SELECT revoked_at FROM push_subscriptions WHERE user_id = ?`).get(a.id) as {
				revoked_at: string | null;
			}
		).revoked_at,
	).toBeTruthy();
});

// ---- C7 ---------------------------------------------------------------------------------------------------
it('C7 /api/native digest.at is the next local time as a valid UTC ISO, text is digestText for its own date, and null for off, notify off, marked or empty', () => {
	const D = '2026-12-23';
	item(me.id, { title: 'C7 today', date: D });
	item(me.id, { title: 'C7 tomorrow', date: addDays(D, 1) });
	const before = Date.parse(localToUtc(D, '06:00', TZ));
	const after = Date.parse(localToUtc(D, '09:00', TZ));

	// off
	expect(nativeSync(me, before).digest).toBeNull();

	// notify off
	usersRepo.setPrefs(me.id, { digestTime: '07:30', notifyPlanner: false, timezone: TZ });
	reload();
	expect(nativeSync(me, before).digest).toBeNull();

	// still ahead: today's instant and today's text
	usersRepo.setPrefs(me.id, { notifyPlanner: true });
	reload();
	const ahead = nativeSync(me, before).digest!;
	expect(ahead.at).toBe(localToUtc(D, '07:30', TZ));
	expect(ahead.text).toBe(digestText(me, D));
	expect(zIsoZ.safeParse(ahead.at).success).toBe(true);
	expect(Date.parse(ahead.at)).toBeGreaterThan(before);

	// past the time: tomorrow's instant and tomorrow's text
	const later = nativeSync(me, after).digest!;
	expect(later.at).toBe(localToUtc(addDays(D, 1), '07:30', TZ));
	expect(later.text).toBe(digestText(me, addDays(D, 1)));
	expect(zIsoZ.safeParse(later.at).success).toBe(true);

	// a date the web push already marked is not also alarmed
	meta.set(digestKey(me.id, D), 'x');
	expect(nativeSync(me, before).digest).toBeNull();

	// nothing on that date: no alarm
	const empty = mk('empty native');
	usersRepo.setPrefs(empty.id, { timezone: TZ, digestTime: '07:30', notifyPlanner: true });
	expect(nativeSync(usersRepo.safe(usersRepo.byId(empty.id)!), before).digest).toBeNull();
});

// ---- C9 ---------------------------------------------------------------------------------------------------
it('C9 due-now: 07:30 is due, a marked 23:50 is not while an unmarked 23:50 sends once, 00:05 is the next day, a failed/no-sub send stays due, the timezone moves it and a DST day still sends once', async () => {
	item(me.id, { title: 'C9 day', date: DAY });
	item(me.id, { title: 'C9 next', date: addDays(DAY, 1) });
	usersRepo.setPrefs(me.id, { digestTime: '07:30', notifyPlanner: true, timezone: TZ });
	reload();
	const at = (date: string, time: string) => Date.parse(localToUtc(date, time, TZ));

	// at the time it is due; a minute early is not
	expect(digestDue(me, at(DAY, '07:30'))).toBe(DAY);
	expect(digestDue(me, at(DAY, '07:29'))).toBeNull();

	// 23:50 with the date already marked: not due (the C9 example, D-V4-51)
	meta.set(digestKey(me.id, DAY), 'x');
	expect(digestDue(me, at(DAY, '23:50'))).toBeNull();
	// an unmarked 23:50 sends once, late (D-V4-51)
	meta.del(digestKey(me.id, DAY));
	expect(digestDue(me, at(DAY, '23:50'))).toBe(DAY);
	expect(await runDigests(at(DAY, '23:50'), async () => ({ sent: 1, failed: 0 }))).toBe(1);
	expect(digestMarked(me.id, DAY)).toBe(true);
	expect(digestDue(me, at(DAY, '23:50'))).toBeNull();

	// 00:05 is the next local date and due again (with a digest time that has passed, D-V4-51)
	usersRepo.setPrefs(me.id, { digestTime: '00:00' });
	reload();
	expect(digestDue(me, at(addDays(DAY, 1), '00:05'))).toBe(addDays(DAY, 1));
	usersRepo.setPrefs(me.id, { digestTime: '07:30' });
	reload();

	// a failed send / no live subscription left the date unmarked and due
	meta.del(digestKey(me.id, DAY));
	await runDigests(at(DAY, '12:00'), async () => ({ sent: 0, failed: 1, error: 'push service error' }));
	expect(digestDue(me, at(DAY, '12:00'))).toBe(DAY);
	await runDigests(at(DAY, '12:05'), async () => ({ sent: 0, failed: 0 }));
	expect(digestDue(me, at(DAY, '12:05'))).toBe(DAY);

	// changing the timezone moves the check: 11:00Z = 19:00 KL (due), 06:00 New York (not due)
	const z = Date.parse('2026-12-10T11:00:00Z');
	meta.del(digestKey(me.id, DAY));
	expect(digestDue(me, z)).toBe(DAY);
	usersRepo.setPrefs(me.id, { timezone: 'America/New_York' });
	reload();
	expect(digestDue(me, z)).toBeNull();

	// a DST transition day still sends once per local date
	const dst = '2026-03-08'; // America/New_York springs forward at 02:00
	item(me.id, { title: 'C9 dst', date: dst });
	item(me.id, { title: 'C9 dst next', date: addDays(dst, 1) });
	usersRepo.setPrefs(me.id, { digestTime: '07:30', notifyPlanner: true });
	reload();
	const dstAt = (date: string, time: string) => Date.parse(localToUtc(date, time, 'America/New_York'));
	expect(digestDue(me, dstAt(dst, '07:30'))).toBe(dst);
	expect(await runDigests(dstAt(dst, '07:30'), async () => ({ sent: 1, failed: 0 }))).toBe(1);
	expect(digestMarked(me.id, dst)).toBe(true);
	expect(digestDue(me, dstAt(dst, '23:50'))).toBeNull(); // same local date, already sent
	expect(digestDue(me, dstAt(addDays(dst, 1), '07:30'))).toBe(addDays(dst, 1));
});

// ---- C11 --------------------------------------------------------------------------------------------------
it('C11 changing digest_time writes the users column only: no undo journal row, no toast-shaped mutation, no planner data touched', async () => {
	const itemsBefore = count('SELECT count(*) AS n FROM items');
	const blocksBefore = count('SELECT count(*) AS n FROM blocks');
	const journalBefore = journalCount();

	const r = await prefs({ digestTime: '09:45' });
	expect(r.status).toBe(200);
	expect(usersRepo.byId(me.id)?.digestTime).toBe('09:45');
	expect(journalCount()).toBe(journalBefore);
	expect(count('SELECT count(*) AS n FROM items')).toBe(itemsBefore);
	expect(count('SELECT count(*) AS n FROM blocks')).toBe(blocksBefore);

	const off = await prefs({ digestTime: null });
	expect(off.status).toBe(200);
	expect(usersRepo.byId(me.id)?.digestTime).toBeNull();
	expect(journalCount()).toBe(journalBefore); // Off is the reversal, not an undo entry
});
