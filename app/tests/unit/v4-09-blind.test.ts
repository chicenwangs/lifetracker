// Blind tests for card 09, from its Done-when lines only: C1 (unsupported matrix + flag clear), C3 (summary copy),
// C4 (one row everywhere incl. shared + @date 404), C5 (done-copy field list), C6 (next date, span shift, clamp),
// C7 (slipped), C8 (reminders), C9 (one undo, reminder back), C10 (ICS), C15 (O-11 normal repeats).
// No builder test was opened.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as sharekeys from '../../src/lib/server/repo/sharekeys';
import * as grants from '../../src/lib/server/repo/grants';
import * as rem from '../../src/lib/server/reminders';
import { itemView } from '../../src/lib/server/itemview';
import { getCalendar } from '../../src/lib/server/calendar';
import { agenda } from '../../src/lib/server/agenda';
import { nativeSync } from '../../src/lib/server/native';
import { buildIcs } from '../../src/lib/server/ics';
import { PATCH } from '../../src/routes/api/items/[id]/+server';
import { POST as CYCLE } from '../../src/routes/api/items/[id]/cycle/+server';
import { POST as UNDO } from '../../src/routes/api/undo/+server';
import { addDays, localToUtc, todayLocal } from '../../src/lib/time';
import {
	describeFromCompletion,
	describeRRule,
	nextFromCompletion,
	qualifiesFromCompletion,
} from '../../src/lib/rrule';
import type { ItemDTO } from '../../src/lib/types';

const TZ = 'Asia/Kuala_Lumpur';
/** fixed clock: KL 2026-11-27 19:00, Kiritimati (+14) already 2026-11-28 01:00 */
const FIXED = '2026-11-27T11:00:00Z';
let meId: string;
let today: string;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(FIXED));
	freshDb({ JOBS_ENABLED: 'false' });
	meId = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	}).id;
	today = todayLocal(TZ);
});
afterEach(() => vi.useRealTimers());

const meUser = (): App.SafeUser => usersRepo.safe(usersRepo.byId(meId)!);
const mkUser = (username: string) =>
	usersRepo.createWithCalendar({ username, displayName: username, passwordHash: 'x', role: 'member' }).id;
const mk = (over: Record<string, unknown> = {}, owner = meId) =>
	items.create(owner, items.itemCreateSchema.parse({ title: 'Blind 09', ...over }));
const row = (id: string) => items.mustOwn(meId, id);
const copyOf = (doneCopyId: string) => row(doneCopyId);

type Payload = {
	item?: ItemDTO;
	undo?: { id: string; label: string };
	error?: { code: string; message: string };
};

/** call the real PATCH route with the signed-in user, as the item sheet does */
async function patchApi(id: string, body: unknown): Promise<{ status: number; json: Payload }> {
	const url = `http://localhost/api/items/${encodeURIComponent(id)}`;
	const res = await PATCH({
		params: { id },
		locals: { user: meUser() },
		url: new URL(url),
		request: new Request(url, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
	} as unknown as Parameters<typeof PATCH>[0]);
	return { status: res.status, json: (await res.json()) as Payload };
}
async function patch(id: string, body: unknown): Promise<Payload> {
	const r = await patchApi(id, body);
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return r.json;
}
async function cycle(id: string): Promise<Payload> {
	const url = `http://localhost/api/items/${encodeURIComponent(id)}/cycle`;
	const res = await CYCLE({
		params: { id },
		locals: { user: meUser() },
		url: new URL(url),
		request: new Request(url, { method: 'POST' }),
	} as unknown as Parameters<typeof CYCLE>[0]);
	expect(res.status).toBe(200);
	return (await res.json()) as Payload;
}
async function undoApi(id: string): Promise<void> {
	const url = 'http://localhost/api/undo';
	const res = await UNDO({
		params: {},
		locals: { user: meUser() },
		url: new URL(url),
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id }),
		}),
	} as unknown as Parameters<typeof UNDO>[0]);
	expect(res.status).toBe(200);
}

describe('C1 unsupported rules', () => {
	it('C1 shows the option only for daily/monthly with no BYDAY, UNTIL or COUNT, and a PATCH that stops qualifying clears the flag in the same edit', async () => {
		// the pure matrix the UI and the repo share
		for (const rule of [
			'FREQ=DAILY',
			'FREQ=DAILY;INTERVAL=3',
			'FREQ=MONTHLY',
			'FREQ=MONTHLY;BYMONTHDAY=15',
			'FREQ=MONTHLY;INTERVAL=2',
		])
			expect(qualifiesFromCompletion(rule), rule).toBe(true);
		for (const rule of [
			null,
			undefined,
			'FREQ=YEARLY',
			'FREQ=YEARLY;INTERVAL=2',
			'FREQ=WEEKLY', // a builder weekly rule always carries BYDAY; even bare it never qualifies (D-V4-27)
			'FREQ=WEEKLY;BYDAY=MO',
			'FREQ=DAILY;BYDAY=MO',
			'FREQ=MONTHLY;BYDAY=3TU',
			'FREQ=DAILY;UNTIL=2026-12-31', // O-9
			'FREQ=MONTHLY;UNTIL=2026-12-31',
			'FREQ=DAILY;COUNT=5', // O-9
			'FREQ=MONTHLY;COUNT=5',
		])
			expect(qualifiesFromCompletion(rule), String(rule)).toBe(false);

		const daily = mk({ title: 'C1 daily', date: today, rrule: 'FREQ=DAILY' });
		expect((await patch(daily.id, { repeatFromCompletion: true })).item?.repeatFromCompletion).toBe(true);

		// a rule change in the same edit wins: the stored flag is 0 again
		const weekly = await patch(daily.id, {
			rrule: 'FREQ=WEEKLY;BYDAY=MO',
			repeatFromCompletion: true,
		});
		expect(weekly.item?.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
		expect(weekly.item?.repeatFromCompletion).toBeUndefined();
		expect(row(daily.id).repeatFromCompletion).toBe(false);

		// setting the flag on an already unsupported item is ignored
		const yearly = mk({ title: 'C1 yearly', date: today, rrule: 'FREQ=YEARLY' });
		const saved = await patch(yearly.id, { repeatFromCompletion: true });
		expect(saved.item?.repeatFromCompletion).toBeUndefined();
		expect(row(yearly.id).repeatFromCompletion).toBe(false);

		// monthly BYMONTHDAY has no BYDAY, so it may count from completion
		const monthly = mk({ title: 'C1 monthly', date: today, rrule: 'FREQ=MONTHLY;BYMONTHDAY=15' });
		expect((await patch(monthly.id, { repeatFromCompletion: true })).item?.repeatFromCompletion).toBe(true);
	});
});

describe('C3 summary copy', () => {
	it('C3 says "Daily, counted from when you finish" / "Every 3 days…" and the same shape for months, keeping describeRRule', () => {
		expect(describeFromCompletion('FREQ=DAILY')).toBe('Daily, counted from when you finish');
		expect(describeFromCompletion('FREQ=DAILY;INTERVAL=3')).toBe(
			'Every 3 days, counted from when you finish',
		);
		expect(describeFromCompletion('FREQ=MONTHLY')).toBe('Monthly, counted from when you finish');
		expect(describeFromCompletion('FREQ=MONTHLY;INTERVAL=2')).toBe(
			'Every 2 months, counted from when you finish',
		);
		expect(describeFromCompletion(null)).toBe('');
		// the existing wording is extended, not replaced
		expect(describeRRule('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days');
		expect(describeRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('Monthly on day 15');
	});
});

describe('C4 one row everywhere', () => {
	it('C4 exposes the series once at its stored date in the repo, own/shared calendars, due chips and native, and 404s any other @date', () => {
		const series = mk({ title: 'C4 series', date: today, time: '09:00', rrule: 'FREQ=DAILY' });
		expect(row(series.id).repeatFromCompletion).toBe(false);
		items.patch(meId, series.id, { repeatFromCompletion: true });

		// repo layer: no expanded occurrence on later days
		const cal = items.myCalendarIds(meId)[0]!;
		expect(items.inRange(cal, today, addDays(today, 10)).filter((r) => r.title === 'C4 series')).toHaveLength(
			1,
		);
		expect(items.inRange(cal, addDays(today, 1), addDays(today, 10))).toHaveLength(0);
		// the planner's due chips ride on inRange
		expect(items.dueOn(meId, today).map((r) => r.id)).toEqual([series.id]);
		expect(items.dueOn(meId, addDays(today, 1))).toHaveLength(0);

		// itemView: id@stored is the one occurrence; id@next is a 404
		const view = itemView(meUser(), `${series.id}@${today}`);
		expect(view.item.id).toBe(`${series.id}@${today}`);
		expect(view.item.repeatFromCompletion).toBe(true);
		expect(() => itemView(meUser(), `${series.id}@${addDays(today, 1)}`)).toThrow(/not found/i);

		// own calendar rows
		const own = getCalendar(meUser(), today, addDays(today, 5));
		expect(own.items.filter((i) => i.title === 'C4 series').map((i) => i.date)).toEqual([today]);

		// a shared calendar: the partner's grant sees the same single row
		const other = mkUser('partner09');
		const theirs = items.create(
			other,
			items.itemCreateSchema.parse({ title: 'C4 shared', date: today, rrule: 'FREQ=DAILY' }),
		);
		items.patch(other, theirs.id, { repeatFromCompletion: true });
		sharekeys.redeem(
			meId,
			sharekeys.create(other, { types: ['None'], hiddenAs: 'none', expiry: '24h' }).code,
		);
		const grant = grants.received(meId)[0]!;
		expect(grants.setInOverlap(meId, grant.id, true)).toBe(true);
		const shared = getCalendar(meUser(), today, addDays(today, 5));
		expect(shared.items.filter((i) => i.title === 'C4 shared').map((i) => i.date)).toEqual([today]);

		// Android widgets: one row today, nothing tomorrow
		const native = nativeSync(meUser(), Date.parse(FIXED));
		expect(native.rows.filter((r) => r.title === 'C4 series')).toHaveLength(1);
		expect(native.days[1]?.top.filter((r) => r.title === 'C4 series')).toHaveLength(0);
	});
});

describe('C5 done copy', () => {
	it('C5 files one done copy dated today in the owner timezone with title/type/private/time/notes, shifted end date and no rule, uid or exdates; todo→doing moves nothing', async () => {
		const todayKiritimati = '2026-11-28'; // fixed clock: KL is still 27 Nov, +14 is already 28 Nov
		usersRepo.setPrefs(meId, { timezone: 'Pacific/Kiritimati' });
		const series = mk({
			title: 'C5 plants',
			type: 'Hobby',
			date: addDays(today, 2),
			time: '09:00',
			endDate: addDays(today, 4),
			notes: 'Living room',
			private: true,
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		items.patch(meId, series.id, { repeatFromCompletion: true });

		// todo -> doing is not a completion
		const before = handle().sqlite.prepare('SELECT count(*) AS n FROM items').get() as { n: number };
		const doing = items.patch(meId, series.id, { status: 'doing' });
		expect(doing.date).toBe(addDays(today, 2));
		expect(doing.doneCopyId).toBeUndefined();
		expect((handle().sqlite.prepare('SELECT count(*) AS n FROM items').get() as { n: number }).n).toBe(
			before.n,
		);

		const done = items.patch(meId, series.id, { status: 'done' });
		expect(done.doneCopyId).toBeTruthy();
		const copy = copyOf(done.doneCopyId!);
		expect(copy).toMatchObject({
			title: 'C5 plants',
			type: 'Hobby',
			status: 'done',
			date: todayKiritimati, // owner timezone, not the KL default
			time: '09:00',
			endDate: addDays(todayKiritimati, 2), // the series' 2-day span from today
			notes: 'Living room',
			private: true,
			rrule: null,
			icsUid: null,
			exdates: null,
			repeatFromCompletion: false,
			deletedAt: null,
		});
		expect(copy.completedAt).toBeTruthy();
		expect(Math.abs(Date.parse(copy.completedAt!) - Date.parse(FIXED))).toBeLessThan(60_000);

		// a series without a span makes a copy without an end date
		const plain = mk({ title: 'C5 plain', date: addDays(today, 2), rrule: 'FREQ=DAILY' });
		items.patch(meId, plain.id, { repeatFromCompletion: true });
		const plainDone = items.patch(meId, plain.id, { status: 'done' });
		expect(copyOf(plainDone.doneCopyId!).endDate).toBeNull();
	});

	it('C5 the cycle route (row tick / item sheet / reminder Done) files the same copy only when the resulting status is done', async () => {
		const series = mk({ title: 'C5 cycle', date: addDays(today, 2), rrule: 'FREQ=DAILY' });
		items.patch(meId, series.id, { repeatFromCompletion: true });

		const started = await cycle(series.id);
		expect(started.item?.status).toBe('doing');
		expect(started.item?.id).toBe(series.id);
		expect(row(series.id).date).toBe(addDays(today, 2));
		expect((handle().sqlite.prepare('SELECT count(*) AS n FROM items').get() as { n: number }).n).toBe(1);

		const done = await cycle(series.id);
		expect(done.item?.status).toBe('todo');
		expect(done.item?.date).toBe(addDays(today, 1));
		const copy = handle()
			.sqlite.prepare("SELECT * FROM items WHERE status = 'done' AND title = 'C5 cycle'")
			.get() as { date: string; rrule: string | null; repeat_from_completion: number };
		expect(copy.date).toBe(today);
		expect(copy.rrule).toBeNull();
		expect(copy.repeat_from_completion).toBe(0);

		// the reminder snackbar's Done reaches the same path
		const viaReminder = mk({
			title: 'C5 reminder done',
			date: addDays(today, 5),
			time: '10:00',
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		items.patch(meId, viaReminder.id, { repeatFromCompletion: true });
		const r = rem.add(meId, 'planner_item', viaReminder.id, { offset: '1d' }, Date.now());
		rem.act(meId, r.id, 'done', Date.now());
		expect(row(viaReminder.id).date).toBe(addDays(today, 3));
		expect(row(viaReminder.id).status).toBe('todo');
		expect(
			handle()
				.sqlite.prepare("SELECT 1 FROM items WHERE title = 'C5 reminder done' AND status = 'done'")
				.get(),
		).toBeTruthy();
	});
});

describe('C6 next date', () => {
	it('C6 moves a daily series +N days and a monthly one +N months (clamped), shifts an existing end date and resets status/completed_at', () => {
		// pure next dates: done on the due day, done early, and both month-end clamps
		expect(nextFromCompletion('2026-11-27', 'FREQ=DAILY')).toBe('2026-11-28');
		expect(nextFromCompletion('2026-11-27', 'FREQ=DAILY;INTERVAL=3')).toBe('2026-11-30');
		expect(nextFromCompletion('2026-01-31', 'FREQ=MONTHLY')).toBe('2026-02-28');
		expect(nextFromCompletion('2028-01-31', 'FREQ=MONTHLY')).toBe('2028-02-29'); // leap year
		expect(nextFromCompletion('2026-11-30', 'FREQ=MONTHLY;INTERVAL=3')).toBe('2027-02-28');
		expect(nextFromCompletion('2026-01-15', 'FREQ=YEARLY')).toBeNull();
		expect(nextFromCompletion('2026-01-15', 'FREQ=WEEKLY;BYDAY=MO')).toBeNull();

		// done on the due day
		const dueToday = mk({ title: 'C6 due today', date: today, rrule: 'FREQ=DAILY;INTERVAL=3' });
		items.patch(meId, dueToday.id, { repeatFromCompletion: true });
		const onTime = items.patch(meId, dueToday.id, { status: 'done' });
		expect(onTime.date).toBe(addDays(today, 3));

		// done 2 days early: the interval counts from the completion day, and the span shifts with the date
		const early = mk({
			title: 'C6 early',
			date: addDays(today, 5),
			endDate: addDays(today, 7),
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		items.patch(meId, early.id, { repeatFromCompletion: true });
		items.patch(meId, early.id, { status: 'doing' });
		expect(row(early.id).completedAt).toBeNull();
		const moved = items.patch(meId, early.id, { status: 'done' });
		expect(moved.date).toBe(addDays(today, 3));
		expect(moved.endDate).toBe(addDays(today, 5)); // old 27->29 span shifted by −2 days
		expect(moved.endDate! >= moved.date!).toBe(true);
		const after = row(early.id);
		expect(after.status).toBe('todo');
		expect(after.completedAt).toBeNull();
		expect(after.startedAt).toBeNull();

		// monthly series moves to today + 1 month (the old date does not matter)
		const monthly = mk({ title: 'C6 monthly', date: addDays(today, 9), rrule: 'FREQ=MONTHLY' });
		items.patch(meId, monthly.id, { repeatFromCompletion: true });
		const m = items.patch(meId, monthly.id, { status: 'done' });
		expect(m.date).toBe(nextFromCompletion(today, 'FREQ=MONTHLY'));
	});
});

describe('C7 slipped', () => {
	it('C7 lists an overdue from-completion series once, never a normal repeat or a done row, and leaves a future one out', () => {
		const overdue = mk({ title: 'C7 overdue', date: addDays(today, -2), rrule: 'FREQ=DAILY;INTERVAL=3' });
		items.patch(meId, overdue.id, { repeatFromCompletion: true });
		// normal repeating items still never slip (O-1 item 1), even long overdue
		mk({ title: 'C7 normal', date: addDays(today, -10), rrule: 'FREQ=DAILY;COUNT=3' });
		const done = mk({ title: 'C7 done', date: addDays(today, -3), rrule: 'FREQ=DAILY' });
		items.patch(meId, done.id, { repeatFromCompletion: true });
		items.patch(meId, done.id, { status: 'done' });
		const future = mk({ title: 'C7 future', date: addDays(today, 1), rrule: 'FREQ=DAILY' });
		items.patch(meId, future.id, { repeatFromCompletion: true });

		const slip = items.slipped(meId, today);
		expect(slip.items.map((i) => i.id)).toEqual([overdue.id]);
		expect(slip.total).toBe(1);
	});
});

describe('C8 reminders', () => {
	it('C8 moves an open relative reminder with the PATCH and with /cycle, ignores advanceRepeating, keeps an exact time and recreates a fired rule for the new date', async () => {
		// PATCH path
		const a = mk({
			title: 'C8 patch',
			date: addDays(today, 5),
			time: '10:00',
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		items.patch(meId, a.id, { repeatFromCompletion: true });
		const rel = rem.add(meId, 'planner_item', a.id, { offset: '1d' }, Date.now());
		expect(rel.dueAt).toBe(localToUtc(addDays(today, 4), '10:00', TZ));
		await patch(a.id, { status: 'done' });
		expect(row(a.id).date).toBe(addDays(today, 3));
		expect(rem.list(meId, 'planner_item', a.id).map((r) => r.dueAt)).toEqual([
			localToUtc(addDays(today, 2), '10:00', TZ),
		]);

		// /cycle path recalculates too
		const b = mk({ title: 'C8 cycle', date: addDays(today, 4), time: '10:00', rrule: 'FREQ=DAILY' });
		items.patch(meId, b.id, { repeatFromCompletion: true });
		rem.add(meId, 'planner_item', b.id, { offset: '2h' }, Date.now());
		await cycle(b.id); // todo -> doing
		await cycle(b.id); // doing -> done
		expect(row(b.id).date).toBe(addDays(today, 1));
		expect(rem.list(meId, 'planner_item', b.id).map((r) => r.dueAt)).toEqual([
			localToUtc(addDays(today, 1), '08:00', TZ),
		]);

		// advanceRepeating does nothing: one reminder per scheduled date
		const c = mk({
			title: 'C8 advance',
			date: addDays(today, 5),
			time: '10:00',
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		items.patch(meId, c.id, { repeatFromCompletion: true });
		const cRem = rem.add(meId, 'planner_item', c.id, { offset: '1d' }, Date.now());
		rem.advanceRepeating(cRem.id, meId, Date.now());
		expect(rem.list(meId, 'planner_item', c.id).map((r) => r.id)).toEqual([cRem.id]);
		expect(rem.list(meId, 'planner_item', c.id)[0]?.dueAt).toBe(localToUtc(addDays(today, 4), '10:00', TZ));

		// a fired reminder cannot move; the completion recreates it from the fired rule for the new date
		const d = mk({
			title: 'C8 fired',
			date: addDays(today, 10),
			time: '10:00',
			rrule: 'FREQ=DAILY;INTERVAL=7',
		});
		items.patch(meId, d.id, { repeatFromCompletion: true });
		const dRem = rem.add(meId, 'planner_item', d.id, { offset: '1d' }, Date.now());
		handle().sqlite.prepare("UPDATE reminders SET status = 'sent' WHERE id = ?").run(dRem.id);
		await patch(d.id, { status: 'done' });
		const next = rem.list(meId, 'planner_item', d.id).find((r) => r.status === 'scheduled');
		expect(next?.dueAt).toBe(localToUtc(addDays(today, 6), '10:00', TZ)); // series moved to today+7, minus 1 day

		// an exact-time reminder stays at its chosen instant
		const e = mk({ title: 'C8 exact', date: addDays(today, 5), time: '10:00', rrule: 'FREQ=DAILY' });
		items.patch(meId, e.id, { repeatFromCompletion: true });
		const at = localToUtc(addDays(today, 6), '09:00', TZ);
		rem.add(meId, 'planner_item', e.id, { at }, Date.now());
		await patch(e.id, { status: 'done' });
		expect(rem.list(meId, 'planner_item', e.id).map((r) => r.dueAt)).toEqual([at]);
	});
});

describe('C9 undo', () => {
	it('C9 one undo entry restores the series date/status, deletes the done copy, keeps the response on the series and moves the reminder back', async () => {
		const series = mk({
			title: 'C9 plants',
			date: addDays(today, 5),
			time: '10:00',
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		items.patch(meId, series.id, { repeatFromCompletion: true });
		const rel = rem.add(meId, 'planner_item', series.id, { offset: '1d' }, Date.now());
		const undoBefore = (
			handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }
		).n;

		const replied = await patch(series.id, { status: 'done' });
		expect(replied.item?.id).toBe(series.id); // the sheet and response stay on the series, never the copy
		const copyRow = handle()
			.sqlite.prepare("SELECT id FROM items WHERE title = 'C9 plants' AND rrule IS NULL AND status = 'done'")
			.get() as { id: string };
		const copyId = copyRow.id;
		expect(copyId).toBeTruthy();
		// one journal entry, covering series + copy
		expect((handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n).toBe(
			undoBefore + 1,
		);
		const saved = handle()
			.sqlite.prepare('SELECT rows FROM undo_actions ORDER BY created_at DESC, rowid DESC LIMIT 1')
			.get() as { rows: string };
		const journal = JSON.parse(saved.rows) as { t: string; id: string; before: unknown }[];
		expect(journal.map((r) => r.id).sort()).toEqual([series.id, copyId].sort());
		expect(journal.find((r) => r.id === copyId)?.before).toBeNull();

		expect(row(series.id).date).toBe(addDays(today, 3));
		expect(rem.list(meId, 'planner_item', series.id)[0]?.dueAt).toBe(
			localToUtc(addDays(today, 2), '10:00', TZ),
		);

		await undoApi(replied.undo!.id);

		const back = row(series.id);
		expect(back.date).toBe(addDays(today, 5));
		expect(back.status).toBe('todo');
		expect(back.completedAt).toBeNull();
		expect(
			(handle().sqlite.prepare('SELECT count(*) AS n FROM items WHERE id = ?').get(copyId) as { n: number })
				.n,
		).toBe(0);
		// the undo route's recalcOwner puts the reminder back on the restored date
		expect(rem.list(meId, 'planner_item', series.id)[0]?.dueAt).toBe(rel.dueAt);
	});
});

describe('C10 ICS', () => {
	it('C10 exports one VEVENT at the stored date with no RRULE and no EXDATE (old exdates dormant), and nothing outside the −30…+365 feed range', () => {
		const series = mk({ title: 'C10 feed', date: addDays(today, 2), rrule: 'FREQ=DAILY;INTERVAL=3' });
		// an old exdate from before the flag: it stays stored but must not reach the feed
		items.patch(meId, `${series.id}@${addDays(today, 5)}`, { title: 'C10 moved', scope: 'this' });
		items.patch(meId, series.id, { repeatFromCompletion: true });
		expect(row(series.id).exdates).toEqual([addDays(today, 5)]);

		const far = mk({ title: 'C10 far', date: addDays(today, 400), rrule: 'FREQ=DAILY' });
		items.patch(meId, far.id, { repeatFromCompletion: true });

		const rows = agenda(meUser(), addDays(today, -30), addDays(today, 366), { maxDays: 400 }).items;
		const body = buildIcs({ timezone: TZ, rows, notes: new Map() }, Date.parse(FIXED));
		const events = eventLines(body);
		const mine = events.filter((e) => e.includes(`UID:${series.id}@lifetracker`));
		expect(mine).toHaveLength(1);
		expect(mine[0]).toContain(`DTSTART;VALUE=DATE:${addDays(today, 2).replace(/-/g, '')}`);
		expect(mine[0]?.some((l) => l.startsWith('RRULE'))).toBe(false);
		expect(mine[0]?.some((l) => l.startsWith('EXDATE'))).toBe(false);
		// a date outside the feed window is not exported at all
		expect(events.some((e) => e.includes(`UID:${far.id}@lifetracker`))).toBe(false);
	});
});

describe('C15 O-11 normal repeats', () => {
	it('C15 finishing one occurrence of a scheduled-date series leaves the series at todo with no completed_at while the detached copy stays done', async () => {
		const series = mk({ title: 'C15 row tick', date: today, rrule: 'FREQ=DAILY' });
		await patch(`${series.id}@${today}`, { status: 'done' });
		const s = row(series.id);
		expect(s.status).toBe('todo');
		expect(s.completedAt).toBeNull();
		expect(s.startedAt).toBeNull();
		const copy = handle()
			.sqlite.prepare(
				"SELECT * FROM items WHERE parent_id IS NULL AND title = 'C15 row tick' AND status = 'done'",
			)
			.get() as { date: string; rrule: string | null };
		expect(copy.date).toBe(today);
		expect(copy.rrule).toBeNull();

		// /cycle: a doing series that finishes one occurrence is reset too
		const cycled = mk({ title: 'C15 cycle', date: today, rrule: 'FREQ=DAILY', status: 'doing' });
		await cycle(cycled.id);
		const c = row(cycled.id);
		expect(c.status).toBe('todo');
		expect(c.completedAt).toBeNull();
		expect(
			(
				handle()
					.sqlite.prepare("SELECT status FROM items WHERE title = 'C15 cycle' AND rrule IS NULL")
					.get() as {
					status: string;
				}
			).status,
		).toBe('done');

		// a series row that was done is reset the same way
		const wasDone = mk({ title: 'C15 was done', date: today, rrule: 'FREQ=DAILY', status: 'done' });
		expect(row(wasDone.id).completedAt).toBeTruthy();
		await patch(`${wasDone.id}@${today}`, { status: 'done' });
		const w = row(wasDone.id);
		expect(w.status).toBe('todo');
		expect(w.completedAt).toBeNull();
	});
});

/** VEVENT logical lines; folded continuation lines stay attached */
function eventLines(body: string): string[][] {
	const out: string[][] = [];
	let cur: string[] | null = null;
	for (const line of body.split('\r\n')) {
		if (line === 'BEGIN:VEVENT') {
			cur = [];
			continue;
		}
		if (line === 'END:VEVENT') {
			if (cur) out.push(cur);
			cur = null;
			continue;
		}
		if (cur) cur.push(line);
	}
	return out;
}
