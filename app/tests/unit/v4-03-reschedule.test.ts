// Card 03: C2 the pure reschedule dates, C8/C9 Skip = one EXDATE + its Undo, C10 the skipped date's reminders.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as rem from '../../src/lib/server/reminders';
import { undo, undoable } from '../../src/lib/server/undo';
import { expandRRule, parseExdates } from '../../src/lib/rrule';
import { targetDate } from '../../src/lib/client/reschedule';

let me: string;
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	me = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	}).id;
});
const mk = (over = {}) =>
	items.create(me, items.itemCreateSchema.parse({ title: 'Reschedule', date: '2028-01-03', ...over }));
const rows = () => (handle().sqlite.prepare('SELECT count(*) AS n FROM items').get() as { n: number }).n;

describe('C2 targetDate', () => {
	it('next weekday: Mon-Thu = the next day; Fri, Sat, Sun = Monday (month + year rollover)', () => {
		expect(targetDate('nextWeekday', '2026-01-30')).toBe('2026-02-02'); // Fri -> Mon
		expect(targetDate('nextWeekday', '2027-12-31')).toBe('2028-01-03'); // Fri -> Mon, year end
		expect(targetDate('nextWeekday', '2026-11-28')).toBe('2026-11-30'); // Sat
		expect(targetDate('nextWeekday', '2026-11-29')).toBe('2026-11-30'); // Sun
		expect(targetDate('nextWeekday', '2026-11-26')).toBe('2026-11-27'); // Thu
		expect(targetDate('nextWeekday', '2026-11-30')).toBe('2026-12-01'); // Mon
	});

	it('today, tomorrow and +1 week stay owner-local dates (no tz)', () => {
		expect(targetDate('today', '2026-11-27')).toBe('2026-11-27');
		expect(targetDate('tomorrow', '2026-12-31')).toBe('2027-01-01');
		expect(targetDate('plusWeek', '2026-12-31')).toBe('2027-01-07');
	});
});

describe('C8/C9 Skip one occurrence', () => {
	it('writes exactly one EXDATE, no new row, and the series is otherwise unchanged', () => {
		const i = mk({ rrule: 'FREQ=DAILY;COUNT=6' });
		const before = rows();
		const r = items.skip(me, `${i.id}@2028-01-05`);
		expect(r.id).toBe(i.id);
		expect(r.date).toBe('2028-01-03');
		expect(r.rrule).toBe('FREQ=DAILY;COUNT=6');
		expect(parseExdates(r.exdates)).toEqual(['2028-01-05']);
		expect(rows()).toBe(before); // no detached row
		expect(
			expandRRule('2028-01-03', 'FREQ=DAILY;COUNT=6', parseExdates(r.exdates), '2028-01-01', '2028-02-01'),
		).toEqual(['2028-01-03', '2028-01-04', '2028-01-06', '2028-01-07', '2028-01-08']);
	});

	it('refuses a non-occurrence, a date already skipped, and a non-repeating item', () => {
		const i = mk({ rrule: 'FREQ=DAILY;COUNT=6' });
		items.skip(me, `${i.id}@2028-01-05`);
		expect(() => items.skip(me, `${i.id}@2028-01-05`)).toThrow(); // already skipped
		expect(() => items.skip(me, `${i.id}@2028-01-09`)).toThrow(); // past COUNT
		const plain = mk({ rrule: null });
		expect(() => items.skip(me, `${plain.id}@2028-01-03`)).toThrow();
		expect(() => items.skip(me, i.id)).toThrow(); // no occurrence date
	});

	it('Undo removes that EXDATE; the occurrence is back and the series keeps its rule', () => {
		const i = mk({ rrule: 'FREQ=DAILY;COUNT=6' });
		const r = undoable(me, 'Skip', [{ t: 'items', id: i.id }], () => ({
			result: items.skip(me, `${i.id}@2028-01-05`),
		}));
		expect(parseExdates(items.mustOwn(me, i.id).exdates)).toEqual(['2028-01-05']);
		undo(me, r.undo.id);
		const back = items.mustOwn(me, i.id);
		expect(parseExdates(back.exdates)).toEqual([]);
		expect(back.rrule).toBe('FREQ=DAILY;COUNT=6');
	});
});

describe('C10 reminders on the skipped occurrence', () => {
	it('a relative reminder moves to the next date; an absolute one inside the skipped day stops', () => {
		const NOW = Date.parse('2028-01-04T05:00:00Z'); // 13:00 KL, before the skipped day
		const i = mk({ date: '2028-01-03', time: '10:00', rrule: 'FREQ=DAILY;COUNT=6' });
		rem.add(me, 'planner_item', i.id, { offset: '2h' }, NOW); // next: 5 Jan 10:00 KL - 2 h
		rem.add(me, 'planner_item', i.id, { at: '2028-01-05T01:00:00Z' }, NOW); // 09:00 KL on the skipped day
		rem.add(me, 'planner_item', i.id, { at: '2028-01-06T01:00:00Z' }, NOW); // the next day: stays
		const ids = rem.absoluteInRange(me, i.id, '2028-01-05', '2028-01-05'); // what the route journals
		expect(ids).toHaveLength(1);
		items.skip(me, `${i.id}@2028-01-05`);
		rem.removeIds(me, ids); // inside the route's undo entry
		rem.afterSkip(me, NOW);
		const due = rem.list(me, 'planner_item', i.id).map((r) => r.dueAt);
		expect(due).toEqual(['2028-01-06T00:00:00Z', '2028-01-06T01:00:00Z']);
	});

	it('C9/C10 Undo restores the absolute reminder removed with the skipped occurrence', () => {
		const NOW = Date.parse('2028-01-04T05:00:00Z');
		const i = mk({ date: '2028-01-03', time: '10:00', rrule: 'FREQ=DAILY;COUNT=6' });
		rem.add(me, 'planner_item', i.id, { at: '2028-01-05T01:00:00Z' }, NOW);
		const ids = rem.absoluteInRange(me, i.id, '2028-01-05', '2028-01-05');
		expect(ids).toHaveLength(1);
		const r = undoable(
			me,
			'Skip',
			[{ t: 'items', id: i.id }, ...ids.map((id) => ({ t: 'reminders' as const, id }))],
			() => {
				const result = items.skip(me, `${i.id}@2028-01-05`);
				rem.removeIds(me, ids);
				return { result };
			},
		);
		expect(rem.list(me, 'planner_item', i.id)).toEqual([]); // gone with the occurrence
		undo(me, r.undo.id);
		const back = rem.list(me, 'planner_item', i.id);
		expect(back).toHaveLength(1);
		expect(back[0]).toMatchObject({ dueAt: '2028-01-05T01:00:00Z', status: 'scheduled' });
		expect(parseExdates(items.mustOwn(me, i.id).exdates)).toEqual([]); // the occurrence is back too
	});
});
