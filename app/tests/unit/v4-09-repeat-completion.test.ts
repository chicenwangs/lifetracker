// Card 09 (O-9, O-11, D-V4-10, D-V4-27): repeat from completion — next-date arithmetic (early, late,
// month end), the unsupported matrix, one-row display (own + shared calendar), the done copy with its
// full field list, one undo entry over series + copy, reminders (open, fired, exact-time) and O-11.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as keys from '../../src/lib/server/repo/sharekeys';
import * as rem from '../../src/lib/server/reminders';
import { undo, undoable } from '../../src/lib/server/undo';
import { getCalendar } from '../../src/lib/server/calendar';
import { agenda } from '../../src/lib/server/agenda';
import { buildIcs } from '../../src/lib/server/ics';
import { itemView } from '../../src/lib/server/itemview';
import { GET } from '../../src/routes/api/items/[id]/+server';
import { describeFromCompletion, nextFromCompletion, qualifiesFromCompletion } from '../../src/lib/rrule';
import { addDays, addMonths, isoPlus, localToUtc, nowUtcIso, todayLocal } from '../../src/lib/time';

const TZ = 'Asia/Kuala_Lumpur';
const NOW = Date.parse('2028-06-05T10:00:00Z');

let me: string;
let user: App.SafeUser;
const mkUser = (username: string) =>
	usersRepo.createWithCalendar({ username, displayName: username, passwordHash: 'x', role: 'member' });
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	const r = mkUser('jeremy');
	me = r.id;
	user = usersRepo.safe(r);
});

const today = () => todayLocal(TZ);
/** inRange rows -> the DTOs the feed consumes (same mapping as agenda, without the type filter) */
const withDto = (rows: items.ItemRow[]) => items.withCounts(rows);
const mk = (over: Record<string, unknown> = {}) =>
	items.create(me, items.itemCreateSchema.parse({ title: 'Series', date: '2028-06-05', ...over }));
/** a qualifying series with the from-completion flag set (the only way the item sheet sets it) */
const mkComplete = (over: Record<string, unknown> = {}) => {
	const i = mk({ rrule: 'FREQ=DAILY', ...over });
	return items.patch(me, i.id, { repeatFromCompletion: true });
};
const myCal = () => items.myCalendarIds(me)[0] as string;
/** call the row GET route as the signed-in user (card 09 SHOULD 4) */
const getRow = async (raw: string): Promise<number> => {
	const url = `http://localhost/api/items/${encodeURIComponent(raw)}`;
	const res = await GET({
		params: { id: raw },
		locals: { user },
		url: new URL(url),
	} as unknown as Parameters<typeof GET>[0]);
	return res.status;
};

describe('C6 next date: counts from the completion day', () => {
	it('daily: on the due day, early, late, interval 1 and N', () => {
		expect(nextFromCompletion('2028-06-05', 'FREQ=DAILY;INTERVAL=3')).toBe('2028-06-08'); // done on the due day
		expect(nextFromCompletion('2028-06-08', 'FREQ=DAILY;INTERVAL=3')).toBe('2028-06-11'); // 2 days early
		expect(nextFromCompletion('2028-06-13', 'FREQ=DAILY;INTERVAL=3')).toBe('2028-06-16'); // 5 days late
		expect(nextFromCompletion('2028-06-05', 'FREQ=DAILY')).toBe('2028-06-06');
		expect(nextFromCompletion('2028-06-05', 'FREQ=WEEKLY;BYDAY=MO')).toBeNull(); // never qualifies
	});

	it('monthly: 31 Jan done 31 Jan clamps to the last day of February; interval 1 and N', () => {
		expect(nextFromCompletion('2028-01-31', 'FREQ=MONTHLY;BYMONTHDAY=31')).toBe('2028-02-29'); // leap year
		expect(nextFromCompletion('2027-01-31', 'FREQ=MONTHLY;BYMONTHDAY=31')).toBe('2027-02-28');
		expect(nextFromCompletion('2028-03-31', 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=31')).toBe('2028-06-30');
		expect(nextFromCompletion('2028-01-15', 'FREQ=MONTHLY')).toBe('2028-02-15');
	});
});

describe('C1 the rule must qualify (O-9)', () => {
	it('daily/monthly only: no BYDAY, no UNTIL, no COUNT — weekly and yearly never', () => {
		for (const rule of [
			'FREQ=DAILY',
			'FREQ=DAILY;INTERVAL=3',
			'FREQ=MONTHLY',
			'FREQ=MONTHLY;BYMONTHDAY=31',
			'FREQ=MONTHLY;INTERVAL=2',
		])
			expect(qualifiesFromCompletion(rule)).toBe(true);
		for (const rule of [
			'FREQ=WEEKLY', // the builder always sets BYDAY, so a weekly rule can never qualify
			'FREQ=WEEKLY;BYDAY=MO',
			'FREQ=YEARLY',
			'FREQ=DAILY;BYDAY=MO',
			'FREQ=MONTHLY;BYDAY=1MO',
			'FREQ=DAILY;UNTIL=2028-12-31',
			'FREQ=DAILY;COUNT=5',
			'FREQ=MONTHLY;COUNT=3',
			'',
		])
			expect(qualifiesFromCompletion(rule)).toBe(false);
		expect(qualifiesFromCompletion(null)).toBe(false);
	});

	it('a PATCH that stops qualifying clears the flag in the same edit', () => {
		const i = mkComplete();
		expect(items.mustOwn(me, i.id).repeatFromCompletion).toBe(true);
		items.patch(me, i.id, { rrule: 'FREQ=WEEKLY;BYDAY=MO' });
		expect(items.mustOwn(me, i.id).repeatFromCompletion).toBe(false);
		items.patch(me, i.id, { rrule: 'FREQ=DAILY' });
		expect(items.mustOwn(me, i.id).repeatFromCompletion).toBe(false); // a new qualifying rule does not resurrect it
		items.patch(me, i.id, { repeatFromCompletion: true });
		expect(items.mustOwn(me, i.id).repeatFromCompletion).toBe(true);
		items.patch(me, i.id, { rrule: 'FREQ=DAILY;UNTIL=2028-12-31' });
		expect(items.mustOwn(me, i.id).repeatFromCompletion).toBe(false);
		items.patch(me, i.id, { rrule: 'FREQ=YEARLY' });
		items.patch(me, i.id, { repeatFromCompletion: true }); // never trusted for a non-qualifying rule
		expect(items.mustOwn(me, i.id).repeatFromCompletion).toBe(false);
	});
});

describe('C4 one row everywhere (D-V4-10)', () => {
	it('inRange shows the stored date only; every other @date is a 404', async () => {
		const i = mkComplete({ date: '2028-06-05', rrule: 'FREQ=DAILY;INTERVAL=3' });
		const cal = myCal();
		const rows = items.inRange(cal, '2028-06-01', '2028-07-01');
		expect(rows.map((r) => [r.id, r.date])).toEqual([[i.id, '2028-06-05']]);
		expect(rows[0]?.repeatFromCompletion).toBe(true);
		expect(items.inRange(cal, '2028-06-06', '2028-07-01')).toEqual([]); // no future ghosts

		expect(itemView(user, `${i.id}@2028-06-05`).item.date).toBe('2028-06-05'); // the one valid date
		expect(() => itemView(user, `${i.id}@2028-06-08`)).toThrow();
		expect(() => items.cycle(me, `${i.id}@2028-06-08`)).toThrow();
		// SHOULD 4: the row API rejects a made-up @date too, not only the item view
		expect(await getRow(`${i.id}@2028-06-05`)).toBe(200);
		expect(await getRow(`${i.id}@2028-06-08`)).toBe(404);

		const dto = getCalendar(user, '2028-06-01', '2028-06-30').items.filter((x) => x.id === i.id);
		expect(dto).toHaveLength(1);
		expect(dto[0]).toMatchObject({ date: '2028-06-05', repeatFromCompletion: true });
	});

	it('a shared calendar shows the same single row; a partner cannot set the flag', () => {
		const other = mkUser('neina').id;
		const theirs = items.create(
			other,
			items.itemCreateSchema.parse({
				title: 'Their plants',
				date: '2028-06-05',
				type: 'Hobby',
				rrule: 'FREQ=DAILY;INTERVAL=3',
			}),
		);
		items.patch(other, theirs.id, { repeatFromCompletion: true });
		keys.redeem(me, keys.create(other, { types: ['Hobby'], hiddenAs: 'none', expiry: '7d' }).code);
		usersRepo.setPrefs(me, { overlapOn: true });

		const shared = getCalendar(user, '2028-06-01', '2028-06-30').items.filter(
			(x) => x.title === 'Their plants',
		);
		expect(shared).toHaveLength(1);
		expect(shared[0]).toMatchObject({ date: '2028-06-05', theirs: true });

		expect(() => items.patch(me, theirs.id, { repeatFromCompletion: false })).toThrow(); // owner only
		expect(items.mustOwn(other, theirs.id).repeatFromCompletion).toBe(true);
	});

	it('old EXDATEs stay stored but dormant while the flag is 1', () => {
		const i = mkComplete({ date: '2028-06-05', rrule: 'FREQ=DAILY;INTERVAL=3' });
		handle()
			.sqlite.prepare('UPDATE items SET exdates = ? WHERE id = ?')
			.run(JSON.stringify(['2028-06-05']), i.id);
		expect(items.inRange(myCal(), '2028-06-05', '2028-06-06')).toHaveLength(1);
		expect(items.mustOwn(me, i.id).exdates).toEqual(['2028-06-05']); // still stored
	});
});

describe('C5/C6 the done copy and the moved series', () => {
	it('the copy carries the series fields, no rule/uid/exdates; the series moves +N and resets', () => {
		const t = today();
		const i = mkComplete({
			title: 'Water plants',
			type: 'Hobby',
			date: t,
			time: '09:00',
			endDate: addDays(t, 2),
			notes: 'the ferns too',
			private: true,
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		const series = items.patch(me, i.id, { status: 'done' });
		expect(series.id).toBe(i.id); // the sheet stays on the series, not the copy
		expect(series.doneCopyId).toBeTruthy();

		const copy = items.mustOwn(me, series.doneCopyId as string);
		expect(copy).toMatchObject({
			title: 'Water plants',
			type: 'Hobby',
			status: 'done',
			date: t,
			time: '09:00',
			endDate: addDays(t, 2), // today + the series' two-day span
			notes: 'the ferns too',
			private: true,
			rrule: null,
			icsUid: null,
			exdates: null,
			repeatFromCompletion: false,
			parentId: null,
		});
		expect(copy.completedAt).not.toBeNull();

		expect(series).toMatchObject({
			date: addDays(t, 3),
			endDate: addDays(t, 5), // the series' end_date shifts by the same delta
			status: 'todo',
			completedAt: null,
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
	});

	it('a todo -> doing tick moves nothing and creates no copy', () => {
		const i = mkComplete({ date: '2028-06-05' });
		const doing = items.patch(me, i.id, { status: 'doing' });
		expect(doing.doneCopyId).toBeUndefined();
		expect(doing).toMatchObject({ id: i.id, date: '2028-06-05', status: 'doing' });
		const n = handle().sqlite.prepare('SELECT count(*) AS n FROM items WHERE title = ?').get('Series') as {
			n: number;
		};
		expect(n.n).toBe(1);
	});

	it('monthly: the series moves one month from the completion day, clamped', () => {
		const t = today();
		const i = mkComplete({ date: t, rrule: 'FREQ=MONTHLY;BYMONTHDAY=31' });
		const next = items.patch(me, i.id, { status: 'done' }).date;
		expect(next).toBe(addMonths(t, 1)); // 31 Jan -> 28/29 Feb when today is a month end
		const copy = items.inRange(myCal(), t, addDays(t, 1)).find((r) => r.title === 'Series' && !r.rrule);
		expect(copy?.date).toBe(t);
	});
});

describe('C9 one undo entry restores the series and deletes the copy', () => {
	it('journals both rows in one entry', () => {
		const t = today();
		const i = mkComplete({ date: t, rrule: 'FREQ=DAILY;INTERVAL=3' });
		const r = undoable(me, `Status "${i.title}"`, [{ t: 'items', id: i.id }], () => {
			const result = items.patch(me, i.id, { status: 'done' });
			return {
				result,
				created: result.doneCopyId ? [{ t: 'items' as const, id: result.doneCopyId }] : [],
			};
		});
		const copyId = r.result.doneCopyId as string;
		expect(items.mustOwn(me, i.id).date).toBe(addDays(t, 3));
		expect(items.mustOwn(me, copyId).status).toBe('done');

		undo(me, r.undo.id);
		expect(items.mustOwn(me, i.id)).toMatchObject({ date: t, status: 'todo', completedAt: null });
		expect(() => items.mustOwn(me, copyId)).toThrow();
	});
});

describe('C8 reminders (D-V4-10)', () => {
	it('an open relative reminder recalculates from the moved date; an exact time stays', () => {
		const t = today();
		const i = mkComplete({ date: addDays(t, 7), time: '09:00', rrule: 'FREQ=DAILY;INTERVAL=3' });
		const open = rem.add(me, 'planner_item', i.id, { offset: '1d' });
		const exact = rem.add(me, 'planner_item', i.id, { at: isoPlus(nowUtcIso(), 86_400_000) });
		items.patch(me, i.id, { date: t }); // as if it were due now
		items.patch(me, i.id, { status: 'done' });
		rem.recalcOwner(me);

		const list = rem.list(me, 'planner_item', i.id);
		expect(list.find((x) => x.id === open.id)).toMatchObject({
			dueAt: localToUtc(addDays(t, 2), '09:00', TZ), // new date (+3) minus one day
			status: 'scheduled',
		});
		expect(list.find((x) => x.id === exact.id)?.dueAt).toBe(exact.dueAt); // never moves
	});

	it('a fired reminder is recreated for the new date; advanceRepeating does nothing', () => {
		const t = today();
		const i = mkComplete({ date: addDays(t, 7), time: '09:00', rrule: 'FREQ=DAILY;INTERVAL=3' });
		const fired = rem.add(me, 'planner_item', i.id, { offset: '2h' });
		handle().sqlite.prepare(`UPDATE reminders SET status = 'sent' WHERE id = ?`).run(fired.id);
		items.patch(me, i.id, { date: t });
		items.patch(me, i.id, { status: 'done' });
		rem.recalcOwner(me);
		rem.afterCompletion(me, i.id);

		const openNow = rem
			.list(me, 'planner_item', i.id)
			.filter((x) => x.status === 'scheduled' && x.kind === 'relative');
		expect(openNow).toHaveLength(1);
		expect(openNow[0]?.dueAt).toBe(isoPlus(localToUtc(addDays(t, 3), '09:00', TZ), -2 * 3_600_000));

		// one reminder per scheduled date: a fired from-completion reminder schedules nothing by itself
		rem.advanceRepeating(fired.id, me);
		expect(
			rem.list(me, 'planner_item', i.id).filter((x) => x.status === 'scheduled' && x.kind === 'relative'),
		).toHaveLength(1);
	});

	it('the reminder Done action completes the series and schedules the next reminder', () => {
		const t = today();
		const i = mkComplete({ date: addDays(t, 2), time: '09:00', rrule: 'FREQ=DAILY;INTERVAL=3' });
		const r = rem.add(me, 'planner_item', i.id, { offset: '2h' });
		rem.act(me, r.id, 'done');

		const series = items.mustOwn(me, i.id);
		expect(series).toMatchObject({ date: addDays(t, 3), status: 'todo', completedAt: null });
		const scheduled = rem.list(me, 'planner_item', i.id).filter((x) => x.status === 'scheduled');
		expect(scheduled).toHaveLength(1);
		expect(scheduled[0]?.dueAt).toBe(isoPlus(localToUtc(addDays(t, 3), '09:00', TZ), -2 * 3_600_000));
	});
});

describe('C15 O-11 on normal repeats', () => {
	it('finishing an occurrence leaves the series at todo; the detached copy keeps done', () => {
		const i = mk({ title: 'Normal', date: '2028-06-05', rrule: 'FREQ=DAILY;COUNT=3' });
		handle().sqlite.prepare(`UPDATE items SET status = 'doing' WHERE id = ?`).run(i.id);
		const made = items.cycle(me, `${i.id}@2028-06-05`); // the row tick: doing -> done
		expect(made.id).not.toBe(i.id);
		expect(made.status).toBe('done');
		expect(items.mustOwn(me, i.id)).toMatchObject({ status: 'todo', completedAt: null });
	});

	it('a series row that was done is reset the same way (PATCH status=done / reminder Done)', () => {
		const i = mk({ title: 'Normal patch', date: '2028-06-05', rrule: 'FREQ=DAILY;COUNT=3' });
		handle()
			.sqlite.prepare(`UPDATE items SET status = 'done', completed_at = '2028-06-01T00:00:00Z' WHERE id = ?`)
			.run(i.id);
		const made = items.patch(me, `${i.id}@2028-06-05`, { status: 'done' });
		expect(made.status).toBe('done');
		expect(items.mustOwn(me, i.id)).toMatchObject({ status: 'todo', completedAt: null });
	});

	it('editing an already-done occurrence does not reset the series: only finishing does (SHOULD 5)', () => {
		const i = mk({ title: 'C15 edit', date: '2028-06-05', rrule: 'FREQ=DAILY;COUNT=3', status: 'done' });
		const made = items.patch(me, `${i.id}@2028-06-05`, { title: 'C15 edit renamed', scope: 'this' });
		expect(made.status).toBe('done');
		expect(items.mustOwn(me, i.id)).toMatchObject({ status: 'done' }); // not a finish: no reset
	});
});

describe('MUST 1 the reminder Done action on a from-completion series', () => {
	// fixed clock: KL 2028-06-05 10:00, so "today" is deterministic for the derived dates
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2028-06-05T02:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	const copies = (title: string) =>
		(
			handle()
				.sqlite.prepare(
					`SELECT count(*) AS n FROM items WHERE title = ? AND rrule IS NULL AND status = 'done'`,
				)
				.get(title) as { n: number }
		).n;

	it('completes when an exact/snoozed reminder points after the series date', () => {
		const t = today();
		const i = mkComplete({ title: 'Must1 exact', date: t, time: '09:00', rrule: 'FREQ=DAILY' });
		// an exact instant after the series date (a snoozed reminder becomes an exact one too)
		const at = localToUtc(addDays(t, 2), '09:00', TZ);
		const r = rem.add(me, 'planner_item', i.id, { at }, Date.now());
		rem.act(me, r.id, 'done', Date.now());

		expect(items.mustOwn(me, i.id)).toMatchObject({ date: addDays(t, 1), status: 'todo' });
		expect(copies('Must1 exact')).toBe(1);
	});

	it('completes with a dormant EXDATE on the stored date', () => {
		const t = today();
		const i = mkComplete({ title: 'Must1 exdate', date: addDays(t, 5), time: '09:00', rrule: 'FREQ=DAILY' });
		const r = rem.add(me, 'planner_item', i.id, { offset: '1d' }, Date.now());
		items.patch(me, i.id, { date: t }); // due now; the reminder is still for the old date
		handle()
			.sqlite.prepare('UPDATE reminders SET due_at = ? WHERE id = ?')
			.run(localToUtc(addDays(t, -1), '09:00', TZ), r.id); // due+1d lands on the stored date
		handle()
			.sqlite.prepare('UPDATE items SET exdates = ? WHERE id = ?')
			.run(JSON.stringify([t]), i.id); // a dormant old EXDATE on that date
		rem.act(me, r.id, 'done', Date.now());

		expect(items.mustOwn(me, i.id)).toMatchObject({ date: addDays(t, 1), status: 'todo' });
		expect(copies('Must1 exdate')).toBe(1);
	});

	it('journals the completion: Undo restores the series and deletes the copy (SHOULD 1)', () => {
		const t = today();
		const i = mkComplete({
			title: 'Must1 undo',
			date: addDays(t, 5),
			time: '09:00',
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		const r = rem.add(me, 'planner_item', i.id, { offset: '1d' }, Date.now());
		items.patch(me, i.id, { date: t }); // due now; the reminder still points at the old date
		handle()
			.sqlite.prepare('UPDATE reminders SET due_at = ? WHERE id = ?')
			.run(localToUtc(addDays(t, -1), '09:00', TZ), r.id); // due+1d lands on the stored date
		const before = (handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number })
			.n;
		rem.act(me, r.id, 'done', Date.now());

		expect(items.mustOwn(me, i.id).date).toBe(addDays(t, 3));
		expect(copies('Must1 undo')).toBe(1);
		expect((handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n).toBe(
			before + 1,
		);
		const last = handle()
			.sqlite.prepare('SELECT id, rows FROM undo_actions ORDER BY created_at DESC, rowid DESC LIMIT 1')
			.get() as { id: string; rows: string };
		const journal = JSON.parse(last.rows) as { id: string; before: unknown }[];
		expect(journal).toHaveLength(2); // the series + the created copy
		expect(journal.filter((x) => x.before === null)).toHaveLength(1);

		undo(me, last.id);
		expect(items.mustOwn(me, i.id).date).toBe(t);
		expect(copies('Must1 undo')).toBe(0);
	});
});

describe('MUST 2 a replayed completion', () => {
	const copies = (title: string) =>
		(
			handle()
				.sqlite.prepare(
					`SELECT count(*) AS n FROM items WHERE title = ? AND rrule IS NULL AND status = 'done'`,
				)
				.get(title) as { n: number }
		).n;

	it('the same done PATCH with the seen date files no second copy and does not move the series again', () => {
		const t = today();
		const i = mkComplete({ title: 'Must2 patch', date: t, rrule: 'FREQ=DAILY;INTERVAL=3' });
		const first = items.patch(me, i.id, { status: 'done', seenDate: t });
		expect(first.doneCopyId).toBeTruthy();
		const moved = first.date;
		expect(copies('Must2 patch')).toBe(1);

		const replay = items.patch(me, i.id, { status: 'done', seenDate: t });
		expect(replay.doneCopyId).toBeUndefined();
		expect(replay.date).toBe(moved);
		expect(items.mustOwn(me, i.id).date).toBe(moved);
		expect(copies('Must2 patch')).toBe(1);
	});

	it('/cycle carries the seen date: a tick for a moved row no longer completes, the right one does', () => {
		const t = today();
		const i = mkComplete({ title: 'Must2 cycle', date: t, rrule: 'FREQ=DAILY' });
		items.patch(me, i.id, { status: 'doing' });

		const stale = items.cycle(me, i.id, addDays(t, 9)); // another device that saw the old date
		expect(stale.doneCopyId).toBeUndefined();
		expect(items.mustOwn(me, i.id).status).toBe('doing');
		expect(copies('Must2 cycle')).toBe(0);

		const done = items.cycle(me, i.id, t);
		expect(done.doneCopyId).toBeTruthy();
		expect(copies('Must2 cycle')).toBe(1);
	});
});

describe('C7 slipped', () => {
	it('an overdue from-completion series slips once; a normal repeat and done rows never do', () => {
		const t = today();
		const slipped = mkComplete({
			title: 'Overdue plants',
			date: addDays(t, -2),
			rrule: 'FREQ=DAILY;INTERVAL=3',
		});
		mk({ title: 'Normal repeat', date: addDays(t, -2), rrule: 'FREQ=DAILY;COUNT=9' });
		mkComplete({ title: 'Done series', date: addDays(t, -2), rrule: 'FREQ=DAILY', status: 'done' });
		const r = items.slipped(me, t);
		expect(r.items.map((i) => i.id)).toEqual([slipped.id]);
		expect(r.total).toBe(1);
	});
});

describe('C10 ICS export', () => {
	it('one VEVENT at its date with no RRULE and no EXDATE', () => {
		const d = '2028-06-05';
		const i = mkComplete({ title: 'Plants', date: d, rrule: 'FREQ=DAILY;INTERVAL=3' });
		handle()
			.sqlite.prepare('UPDATE items SET exdates = ? WHERE id = ?')
			.run(JSON.stringify([addDays(d, 3)]), i.id); // an old EXDATE stays dormant
		const rows = items.inRange(myCal(), d, addDays(d, 1));
		const ics = buildIcs({ timezone: TZ, rows: withDto(rows), notes: new Map() }, NOW);
		const lines = ics.replace(/\r\n /g, '').split('\r\n');
		expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
		expect(lines).toContain('DTSTART;VALUE=DATE:20280605');
		expect(lines.some((l) => l.startsWith('RRULE:'))).toBe(false);
		expect(lines.some((l) => l.startsWith('EXDATE'))).toBe(false);
	});

	it('is absent when its date is outside the feed range', () => {
		const t = today();
		mkComplete({ title: 'Near plants', date: addDays(t, 10), rrule: 'FREQ=DAILY' });
		mkComplete({ title: 'Far plants', date: addDays(t, 400), rrule: 'FREQ=DAILY' });
		const ics = buildIcs(
			{
				timezone: TZ,
				rows: agenda(user, addDays(t, -30), addDays(t, 366), { maxDays: 400 }).items,
				notes: new Map(),
			},
			NOW,
		);
		expect(ics).toContain('SUMMARY:Near plants');
		expect(ics).not.toContain('Far plants');
	});
});

describe('C3 the Repeat-box summary line', () => {
	it('daily and monthly, interval 1 and N', () => {
		expect(describeFromCompletion('FREQ=DAILY')).toBe('Daily, counted from when you finish');
		expect(describeFromCompletion('FREQ=DAILY;INTERVAL=3')).toBe(
			'Every 3 days, counted from when you finish',
		);
		expect(describeFromCompletion('FREQ=MONTHLY;BYMONTHDAY=31')).toBe(
			'Monthly, counted from when you finish',
		);
		expect(describeFromCompletion('FREQ=MONTHLY;INTERVAL=2')).toBe(
			'Every 2 months, counted from when you finish',
		);
	});
});
