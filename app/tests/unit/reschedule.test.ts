// v3.2 PR 3: reschedule action set — targetDate (pure) + Skip = one EXDATE (server).
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as rem from '../../src/lib/server/reminders';
import { targetDate } from '../../src/lib/client/reschedule';
import { expandRRule, parseExdates } from '../../src/lib/rrule';

const KL = 'Asia/Kuala_Lumpur';
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

describe('targetDate', () => {
	it('quick moves cross month and year ends', () => {
		expect(targetDate('today', '2026-11-27', KL)).toBe('2026-11-27');
		expect(targetDate('tomorrow', '2026-11-30', KL)).toBe('2026-12-01');
		expect(targetDate('tomorrow', '2026-12-31', KL)).toBe('2027-01-01');
		expect(targetDate('week', '2026-12-28', KL)).toBe('2027-01-04');
	});
	it('next weekday: Fri, Sat or Sun = Monday; Mon..Thu = the next day', () => {
		expect(targetDate('next-weekday', '2026-11-26', KL)).toBe('2026-11-27'); // Thu
		expect(targetDate('next-weekday', '2026-11-27', KL)).toBe('2026-11-30'); // Fri
		expect(targetDate('next-weekday', '2026-11-28', KL)).toBe('2026-11-30'); // Sat
		expect(targetDate('next-weekday', '2026-11-29', KL)).toBe('2026-11-30'); // Sun
		expect(targetDate('next-weekday', '2027-12-31', KL)).toBe('2028-01-03'); // Fri, year end
	});
	it('the tz never shifts a given day; it only finds today when none is passed', () => {
		expect(targetDate('tomorrow', '2026-11-30', 'Pacific/Kiritimati')).toBe('2026-12-01');
		expect(targetDate('today', '', KL)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe('skip one occurrence', () => {
	const mk = () =>
		items.create(
			me,
			items.itemCreateSchema.parse({
				title: 'Rep',
				date: '2030-01-07',
				time: '10:00',
				rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
			}),
		);
	const occs = (id: string) => {
		const r = items.mustOwn(me, id);
		return expandRRule(r.date as string, r.rrule as string, parseExdates(r.exdates), '2030-01-01', '2030-03-01'); // prettier-ignore
	};

	it('writes one EXDATE and the day stops being an occurrence', () => {
		const i = mk();
		items.skipOccurrence(me, `${i.id}@2030-01-14`);
		expect(parseExdates(items.mustOwn(me, i.id).exdates)).toEqual(['2030-01-14']);
		expect(occs(i.id)).not.toContain('2030-01-14');
		expect(occs(i.id)).toHaveLength(5);
	});

	it('refuses a second skip, a bare series, a one-off and a made-up date', () => {
		const i = mk();
		items.skipOccurrence(me, `${i.id}@2030-01-14`);
		expect(() => items.skipOccurrence(me, `${i.id}@2030-01-14`)).toThrow(/not found/i);
		expect(() => items.skipOccurrence(me, i.id)).toThrow(/one date/);
		expect(() => items.skipOccurrence(me, `${i.id}@2030-01-08`)).toThrow(/not found/i); // a Tuesday
		const one = items.create(me, items.itemCreateSchema.parse({ title: 'One', date: '2030-01-07' }));
		expect(() => items.skipOccurrence(me, `${one.id}@2030-01-07`)).toThrow(/does not repeat/);
	});

	it('a relative reminder moves to the next date; an exact-time one on the skipped day is cancelled', () => {
		const NOW = Date.parse('2029-12-01T00:00:00Z');
		const i = mk();
		rem.add(me, 'planner_item', i.id, { offset: '1d' }, NOW); // for the 7 Jan occurrence
		rem.add(me, 'planner_item', i.id, { at: '2030-01-07T01:00:00Z' }, NOW); // 09:00 KL on the skipped day
		items.skipOccurrence(me, `${i.id}@2030-01-07`);
		rem.recalcOwner(me, NOW);
		rem.cancelOnDay(me, i.id, '2030-01-07', NOW);
		const due = rem.upcoming(me, NOW, 400 * 86_400_000).map((r) => r.dueAt);
		expect(due).toEqual(['2030-01-13T02:00:00Z']); // 1d before Mon 14 Jan, nothing left on the 7th
	});
});

describe('postpone keeps the shape of the item', () => {
	it('a multi-day item moves end_date by the same span; its time stays', () => {
		const i = items.create(
			me,
			items.itemCreateSchema.parse({
				title: 'Trip',
				date: '2030-02-01',
				time: '08:30',
				endDate: '2030-02-03',
			}),
		);
		items.patch(me, i.id, { date: '2030-02-05' }); // what reschedule() sends
		const after = items.mustOwn(me, i.id);
		expect(after.date).toBe('2030-02-05');
		expect(after.endDate).toBe('2030-02-07');
		expect(after.time).toBe('08:30');
	});
	it('postponing one occurrence detaches it (the series gets an EXDATE)', () => {
		const i = items.create(
			me,
			items.itemCreateSchema.parse({
				title: 'Rep',
				date: '2030-03-04',
				rrule: 'FREQ=DAILY;COUNT=4',
			}),
		);
		const moved = items.patch(me, `${i.id}@2030-03-05`, { date: '2030-03-20' });
		expect(moved.id).not.toBe(i.id);
		expect(moved.date).toBe('2030-03-20');
		expect(parseExdates(items.mustOwn(me, i.id).exdates)).toEqual(['2030-03-05']);
	});
});
