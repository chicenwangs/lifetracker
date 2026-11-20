// Repeating items + per-occurrence reminders + default reminders (#72).
import { beforeEach, describe, expect, it } from 'vitest';
import { expandRRule, describeRRule, parseRRule } from '../../src/lib/rrule';
import { parseQuickAdd } from '../../src/lib/quickadd';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as calendarsRepo from '../../src/lib/server/repo/calendars';
import * as items from '../../src/lib/server/repo/items';
import * as rem from '../../src/lib/server/reminders';
import * as jobs from '../../src/lib/server/jobs';
import { quickAdd } from '../../src/lib/server/quickadd-server';

describe('rrule pure expansion', () => {
	it('expands daily, weekly custom weekdays, monthly day-of-month and Nth-weekday, yearly, UNTIL, COUNT and exdates', () => {
		expect(
			expandRRule('2026-11-16', 'FREQ=DAILY;COUNT=4', ['2026-11-17'], '2026-11-16', '2026-11-25'),
		).toEqual(['2026-11-16', '2026-11-18', '2026-11-19']);

		expect(
			expandRRule(
				'2026-11-16',
				'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=2026-11-25',
				[],
				'2026-11-16',
				'2026-11-30',
			),
		).toEqual(['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23', '2026-11-25']);

		// Monthly on day 31 clamps to month end in Feb
		expect(
			expandRRule('2026-01-31', 'FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3', [], '2026-01-01', '2026-05-01'),
		).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);

		// Monthly on the 3rd Tuesday (2026-11-17 is 3rd Tue of Nov 2026; Dec 2026 3rd Tue is 2026-12-15)
		expect(
			expandRRule('2026-11-17', 'FREQ=MONTHLY;BYDAY=3TU;COUNT=2', [], '2026-11-01', '2027-01-01'),
		).toEqual(['2026-11-17', '2026-12-15']);

		expect(describeRRule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Weekly on Mon, Wed');
		expect(parseRRule('FREQ=MONTHLY;BYDAY=3TU')).toMatchObject({ freq: 'MONTHLY', byday: ['3TU'] });
	});

	it('parses quick-add repeat phrases', () => {
		const ctx = { today: '2026-11-16', nowMinutes: 9 * 60 };
		expect(parseQuickAdd('standup 10am every weekday', ctx)).toMatchObject({
			ok: true,
			title: 'standup',
			rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
			target: 'both',
		});
		expect(parseQuickAdd('gym 6pm every mon,wed,fri', ctx)).toMatchObject({
			ok: true,
			title: 'gym',
			rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
		});
	});
});

describe('repeating items repo, reminders per occurrence, and default reminders', () => {
	let user: App.SafeUser;
	let calId: string;

	beforeEach(() => {
		freshDb({ JOBS_ENABLED: 'false' });
		user = usersRepo.safe(
			usersRepo.createWithCalendar({
				username: 'jeremy',
				displayName: 'J',
				passwordHash: 'x',
				role: 'admin',
			}),
		);
		calId = calendarsRepo.defaultFor(user.id).id;
	});

	it('expands in calendar range, detaches on tick, and supports this / following / all edit and delete', () => {
		const series = items.create(
			user.id,
			items.itemCreateSchema.parse({
				title: 'Piano practice',
				date: '2026-11-16',
				time: '18:00',
				rrule: 'FREQ=DAILY;COUNT=5',
			}),
		);
		const initial = items.inRange(calId, '2026-11-16', '2026-11-22');
		expect(initial.map((x) => x.date)).toEqual([
			'2026-11-16',
			'2026-11-17',
			'2026-11-18',
			'2026-11-19',
			'2026-11-20',
		]);

		// Tick 2026-11-17 -> detaches that date with status 'doing', leaving future occurrences 'todo'
		const detached = items.patch(user.id, `${series.id}@2026-11-17`, { status: 'done' });
		expect(detached.id).not.toBe(series.id);
		expect(detached.status).toBe('done');
		const afterTick = items.inRange(calId, '2026-11-16', '2026-11-22');
		expect(afterTick.find((x) => x.date === '2026-11-17')?.status).toBe('done');
		expect(afterTick.find((x) => x.date === '2026-11-18')?.status).toBe('todo');

		// Edit "this and following" starting 2026-11-19 -> splits series
		items.patch(user.id, `${series.id}@2026-11-19`, {
			title: 'Piano duet',
			scope: 'following',
		});
		const afterSplit = items.inRange(calId, '2026-11-16', '2026-11-21');
		expect(afterSplit.find((x) => x.date === '2026-11-18')?.title).toBe('Piano practice');
		expect(afterSplit.find((x) => x.date === '2026-11-19')?.title).toBe('Piano duet');
		expect(afterSplit.find((x) => x.date === '2026-11-20')?.title).toBe('Piano duet');

		// Delete "this" occurrence on 2026-11-16 -> removes only 2026-11-16
		items.softDelete(user.id, `${series.id}@2026-11-16`, 'this');
		const afterDelThis = items.inRange(calId, '2026-11-16', '2026-11-21');
		expect(afterDelThis.find((x) => x.date === '2026-11-16')).toBeUndefined();
		expect(afterDelThis.find((x) => x.date === '2026-11-18')).toBeDefined();
	});

	it('"this and following" keeps the COUNT total and deleted dates (#155); a moved date moves the rule (#164); a detached date cannot be detached twice (#158/#163)', () => {
		const mk = (rrule: string, date: string) =>
			items.create(user.id, items.itemCreateSchema.parse({ title: 'S', date, rrule }));
		const s = mk('FREQ=DAILY;COUNT=5', '2026-11-16');
		items.softDelete(user.id, `${s.id}@2026-11-20`, 'this');
		items.patch(user.id, `${s.id}@2026-11-19`, { title: 'T', scope: 'following' });
		const dates = items.inRange(calId, '2026-11-01', '2026-12-01').map((x) => x.date);
		expect(dates).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);

		const rent = mk('FREQ=MONTHLY;BYMONTHDAY=5', '2026-11-05');
		expect(items.patch(user.id, rent.id, { date: '2026-11-10', scope: 'all' }).rrule).toBe(
			'FREQ=MONTHLY;BYMONTHDAY=10',
		);
		const wk = mk('FREQ=WEEKLY;BYDAY=MO', '2026-11-16');
		const split = items.patch(user.id, `${wk.id}@2026-11-23`, { date: '2026-11-25', scope: 'following' });
		expect(split.rrule).toBe('FREQ=WEEKLY;BYDAY=WE');

		const d = mk('FREQ=DAILY', '2026-11-16');
		items.patch(user.id, `${d.id}@2026-11-17`, { status: 'done' });
		expect(() => items.patch(user.id, `${d.id}@2026-11-17`, { status: 'todo' })).toThrow();
		const onDay = items
			.inRange(calId, '2026-11-17', '2026-11-18')
			.filter((x) => (x.seriesId ?? x.id) !== s.id);
		expect(onDay).toHaveLength(1);
	});

	it('advances relative reminders to the next occurrence when a reminder fires, and applies defaultReminder on new items', async () => {
		const startMs = Date.parse('2026-11-16T00:00:00Z'); // 08:00 KL
		const series = items.create(
			user.id,
			items.itemCreateSchema.parse({
				title: 'Morning vitamins',
				date: '2026-11-16',
				time: '10:00', // 02:00Z
				rrule: 'FREQ=DAILY;COUNT=3',
			}),
		);
		const r1 = rem.add(user.id, 'planner_item', series.id, { offset: '15min' }, startMs);
		expect(r1.dueAt).toBe('2026-11-16T01:45:00Z');

		// Fire at 01:45:01Z -> marks first reminder sent and schedules the next day's occurrence (2026-11-17T01:45:00Z)
		await jobs.tick(Date.parse('2026-11-16T01:45:01Z'));
		const allRems = rem.list(user.id, 'planner_item', series.id);
		expect(allRems.map((x) => [x.dueAt, x.status])).toEqual([
			['2026-11-16T01:45:00Z', 'sent'],
			['2026-11-17T01:45:00Z', 'scheduled'],
		]);

		// Account-level defaultReminder in user prefs automatically adds a reminder on new quickAdd items
		usersRepo.setPrefs(user.id, { defaultReminder: '2h' });
		const row = usersRepo.byId(user.id);
		if (!row) throw new Error('missing user');
		const freshUser = usersRepo.safe(row);
		const qa = quickAdd(freshUser, 'Dentist 2026-11-20 14:00 /calendar', startMs);
		expect(qa.item).toBeTruthy();
		expect(rem.list(user.id, 'planner_item', qa.item?.id ?? '')).toHaveLength(1);
	});

	it('advances exact-time reminders on a repeating item (#261)', async () => {
		const at = Date.parse('2026-11-16T00:00:00Z');
		const yearly = items.create(
			user.id,
			items.itemCreateSchema.parse({
				title: 'Renew passport',
				date: '2026-11-16',
				time: '10:00',
				rrule: 'FREQ=YEARLY',
			}),
		);
		const r = rem.add(user.id, 'planner_item', yearly.id, { at: '2026-11-16T01:00:00Z' }, at);
		expect(r.dueAt).toBe('2026-11-16T01:00:00Z');

		await jobs.tick(Date.parse('2026-11-16T01:00:01Z'));
		expect(rem.list(user.id, 'planner_item', yearly.id).map((x) => [x.dueAt, x.status])).toEqual([
			['2026-11-16T01:00:00Z', 'sent'],
			['2027-11-16T01:00:00Z', 'scheduled'],
		]);
	});

	it('does not schedule past the end of a counted series (#261 break test)', async () => {
		const at = Date.parse('2026-11-16T00:00:00Z');
		const once = items.create(
			user.id,
			items.itemCreateSchema.parse({
				title: 'One-off in a series',
				date: '2026-11-16',
				time: '10:00',
				rrule: 'FREQ=YEARLY;COUNT=1',
			}),
		);
		rem.add(user.id, 'planner_item', once.id, { at: '2026-11-16T01:00:00Z' }, at);
		await jobs.tick(Date.parse('2026-11-16T01:00:01Z'));
		expect(rem.list(user.id, 'planner_item', once.id)).toHaveLength(1);
	});

	it('snooze before the reminder fires keeps the daily chain (#185); every-2-years reminders advance (#187); a new timezone moves them (#189)', async () => {
		const at = Date.parse('2026-11-16T00:00:00Z');
		const mk = (rrule: string) =>
			items.create(
				user.id,
				items.itemCreateSchema.parse({ title: 'R', date: '2026-11-16', time: '10:00', rrule }),
			);
		const daily = mk('FREQ=DAILY');
		const r = rem.add(user.id, 'planner_item', daily.id, { offset: '15min' }, at);
		rem.act(user.id, r.id, 'snooze10', at);
		expect(rem.list(user.id, 'planner_item', daily.id).map((x) => x.dueAt)).toContain('2026-11-17T01:45:00Z');

		const two = mk('FREQ=YEARLY;INTERVAL=2');
		rem.add(user.id, 'planner_item', two.id, { offset: '15min' }, at);
		await jobs.tick(Date.parse('2026-11-16T01:45:01Z'));
		expect(rem.list(user.id, 'planner_item', two.id).map((x) => x.dueAt)).toContain('2028-11-16T01:45:00Z');

		const once = items.create(
			user.id,
			items.itemCreateSchema.parse({ title: 'O', date: '2026-12-01', time: '10:00' }),
		);
		rem.add(user.id, 'planner_item', once.id, { offset: '2h' }, at);
		usersRepo.setPrefs(user.id, { timezone: 'Asia/Tokyo' });
		rem.recalcOwner(user.id, at);
		expect(rem.list(user.id, 'planner_item', once.id)[0]?.dueAt).toBe('2026-11-30T23:00:00Z'); // 08:00 Tokyo
	});
});
