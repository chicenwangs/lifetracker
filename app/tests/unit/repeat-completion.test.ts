// v3.3 PR 9: repeat from completion — next-date rule, done copy, display, Slipped, ICS.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as calendarsRepo from '../../src/lib/server/repo/calendars';
import * as items from '../../src/lib/server/repo/items';
import { icsFeed } from '../../src/lib/server/icsfeed';
import { handle } from '../../src/lib/server/db';
import { POST as cyclePost } from '../../src/routes/api/items/[id]/cycle/+server';
import { POST as undoPost } from '../../src/routes/api/undo/+server';
import * as rem from '../../src/lib/server/reminders';
import { addDays, isoPlus, localToUtc, todayLocal } from '../../src/lib/time';
import { canCountFromCompletion, nextFromCompletion } from '../../src/lib/rrule';

const TZ = 'Asia/Kuala_Lumpur';
let me: string;
let cal: string;
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	me = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	}).id;
	cal = calendarsRepo.defaultFor(me).id;
});

describe('nextFromCompletion', () => {
	it('done early or late counts from today + interval', () => {
		expect(nextFromCompletion('2026-11-25', 'FREQ=DAILY;INTERVAL=3')).toBe('2026-11-28');
		expect(nextFromCompletion('2026-12-31', 'FREQ=WEEKLY;INTERVAL=2')).toBe('2027-01-14');
	});
	it('month ends clamp instead of rolling into the next month', () => {
		expect(nextFromCompletion('2027-01-31', 'FREQ=MONTHLY')).toBe('2027-02-28');
		expect(nextFromCompletion('2028-01-31', 'FREQ=MONTHLY')).toBe('2028-02-29'); // leap
		expect(nextFromCompletion('2026-12-31', 'FREQ=MONTHLY;INTERVAL=2')).toBe('2027-02-28');
	});
	it('only daily/weekly/monthly without weekdays can count from completion', () => {
		expect(canCountFromCompletion('FREQ=DAILY;INTERVAL=3')).toBe(true);
		expect(canCountFromCompletion('FREQ=MONTHLY;BYMONTHDAY=12')).toBe(true);
		expect(canCountFromCompletion('FREQ=WEEKLY')).toBe(true);
		expect(canCountFromCompletion('FREQ=WEEKLY;BYDAY=MO,WE')).toBe(false);
		expect(canCountFromCompletion('FREQ=MONTHLY;BYDAY=2TU')).toBe(false);
		expect(canCountFromCompletion('FREQ=YEARLY')).toBe(false);
		expect(nextFromCompletion('2026-11-25', 'FREQ=YEARLY')).toBe(null);
	});
	it('a bounded rule (UNTIL or COUNT) cannot count from completion', () => {
		expect(canCountFromCompletion('FREQ=DAILY;UNTIL=2026-12-01')).toBe(false);
		expect(canCountFromCompletion('FREQ=DAILY;COUNT=5')).toBe(false);
	});
});

describe('from-completion series', () => {
	const today = () => todayLocal(TZ);
	const mk = (date: string, rrule = 'FREQ=DAILY;INTERVAL=3') => {
		const r = items.create(
			me,
			items.itemCreateSchema.parse({ title: 'Water plants', date, time: '09:00', rrule }),
		);
		items.patch(me, r.id, { repeatFromCompletion: true });
		return items.mustOwn(me, r.id);
	};

	it('shows only its next date in a range (no future ghosts)', () => {
		const r = mk(addDays(today(), -4));
		const rows = items.inRange(cal, addDays(today(), -7), addDays(today(), 30));
		expect(rows.filter((x) => x.id === r.id)).toHaveLength(1);
		expect(rows.some((x) => x.id.startsWith(`${r.id}@`))).toBe(false);
	});

	it('done: a done copy dated today, the series moves to today + interval', () => {
		const r = mk(addDays(today(), -1), 'FREQ=DAILY');
		const created: string[] = [];
		const after = items.patch(me, r.id, { status: 'done' }, (id) => created.push(id));
		expect(after.date).toBe(addDays(today(), 1));
		expect(after.status).toBe('todo'); // the series itself is never "done"
		expect(created).toHaveLength(1);
		const copy = items.mustOwn(me, created[0] as string);
		expect(copy.status).toBe('done');
		expect(copy.date).toBe(today());
		expect(copy.rrule).toBe(null);
		expect(copy.repeatFromCompletion).toBe(false);
	});

	it('slipped: an overdue from-completion series slips; a normal repeat does not', () => {
		const fc = mk(addDays(today(), -2), 'FREQ=DAILY');
		const normal = items.create(
			me,
			items.itemCreateSchema.parse({
				title: 'Weekly',
				date: addDays(today(), -2),
				rrule: 'FREQ=WEEKLY;BYDAY=MO',
			}),
		);
		const ids = items.slipped(me, today()).items.map((i) => i.id);
		expect(ids).toContain(fc.id);
		expect(ids).not.toContain(normal.id);
	});

	it('ICS: one VEVENT at the next date, no RRULE', () => {
		const r = mk(today(), 'FREQ=DAILY;INTERVAL=3');
		const ics = icsFeed(usersRepo.safe(usersRepo.byId(me)!));
		const block = ics.split('BEGIN:VEVENT').find((b) => b.includes(r.id)) ?? '';
		expect(block).toContain('SUMMARY:Water plants');
		expect(block).not.toContain('RRULE');
	});

	it('a status tick to doing does not detach the series; done still completes', () => {
		const r = mk(addDays(today(), -1), 'FREQ=DAILY');
		const doing = items.patch(me, r.id, { status: 'doing' });
		expect(doing.id).toBe(r.id); // same row, no detached copy
		expect(doing.rrule).toBe('FREQ=DAILY');
		const created: string[] = [];
		items.patch(me, r.id, { status: 'done' }, (id) => created.push(id));
		expect(created).toHaveLength(1);
	});

	it('picking weekdays resets the flag; asking for it on a weekday rule is refused', () => {
		const r = mk(today(), 'FREQ=DAILY');
		items.patch(me, r.id, { rrule: 'FREQ=WEEKLY;BYDAY=MO' });
		expect(items.mustOwn(me, r.id).repeatFromCompletion).toBe(false);
		expect(() => items.patch(me, r.id, { repeatFromCompletion: true })).toThrow();
		expect(() => items.patch(me, r.id, { rrule: null, repeatFromCompletion: true })).toThrow();
	});

	it('a bounded rule is refused for from-completion, but still works as a scheduled repeat', () => {
		const r = items.create(
			me,
			items.itemCreateSchema.parse({
				title: 'Bounded',
				date: addDays(today(), -1),
				rrule: `FREQ=DAILY;UNTIL=${addDays(today(), 10)}`,
			}),
		);
		expect(() => items.patch(me, r.id, { repeatFromCompletion: true })).toThrow();
		const after = items.patch(me, r.id, { status: 'done' }); // the old detach-one behaviour
		expect(after.id).not.toBe(r.id);
		expect(items.mustOwn(me, r.id).date).toBe(r.date); // the series itself did not move
	});

	it('cycle done recalculates a relative reminder; Undo puts date and reminder back', async () => {
		const r = items.create(
			me,
			items.itemCreateSchema.parse({
				title: 'Water plants',
				date: today(),
				time: '23:00',
				rrule: 'FREQ=DAILY',
			}),
		);
		items.patch(me, r.id, { repeatFromCompletion: true });
		rem.add(me, 'planner_item', r.id, { offset: '2h' });
		const due = () =>
			(
				handle().sqlite.prepare('select due_at from reminders where source_id = ?').get(r.id) as {
					due_at: string;
				}
			).due_at;
		const before = due();
		expect(before).toBe(isoPlus(localToUtc(today(), 23 * 60, TZ), -2 * 3_600_000));
		const ev = () =>
			({ locals: { user: usersRepo.safe(usersRepo.byId(me)!) }, params: { id: r.id } }) as never;
		expect(((await (await cyclePost(ev())).json()) as { item: { date: string } }).item.date).toBe(today()); // doing
		const j = (await (await cyclePost(ev())).json()) as { item: { date: string }; undo: { id: string } };
		expect(j.item.date).toBe(addDays(today(), 1)); // done moves the series
		expect(due()).toBe(isoPlus(localToUtc(addDays(today(), 1), 23 * 60, TZ), -2 * 3_600_000)); // reminder follows
		await undoPost({
			locals: { user: usersRepo.safe(usersRepo.byId(me)!) },
			request: new Request('http://localhost/api/undo', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: j.undo.id }),
			}),
		} as never);
		expect(items.mustOwn(me, r.id).date).toBe(today());
		expect(due()).toBe(before);
	});
});
