// Blind tests for card 03, from its Done-when lines only: C2 (targetDate fixtures) and C8 (Skip = one EXDATE).
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as calendarsRepo from '../../src/lib/server/repo/calendars';
import { expandRRule, parseExdates } from '../../src/lib/rrule';

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

const mk = (over: Record<string, unknown> = {}) =>
	items.create(
		me,
		items.itemCreateSchema.parse({
			title: 'Blind series',
			date: '2030-02-04',
			time: '09:00',
			rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
			...over,
		}),
	);
const cal = () => calendarsRepo.defaultFor(me).id;

describe('C2 next weekday', () => {
	it('C2 targetDate: Mon–Thu -> next day, Fri/Sat/Sun -> Monday, incl. month and year rollover', async () => {
		const { targetDate, RESCHEDULE } = await import('../../src/lib/client/reschedule');
		// the fixture dates the card names
		expect(targetDate('nextWeekday', '2026-01-30')).toBe('2026-02-02'); // Fri -> Mon, month rollover
		expect(targetDate('nextWeekday', '2027-12-31')).toBe('2028-01-03'); // Fri -> Mon, year rollover
		expect(targetDate('nextWeekday', '2026-11-28')).toBe('2026-11-30'); // Sat -> Mon
		expect(targetDate('nextWeekday', '2026-11-29')).toBe('2026-11-30'); // Sun -> Mon
		// Mon–Thu go to the very next day
		expect(targetDate('nextWeekday', '2026-11-23')).toBe('2026-11-24');
		expect(targetDate('nextWeekday', '2026-11-26')).toBe('2026-11-27');
		// the other three kinds are plain day steps
		expect(targetDate('today', '2026-11-27')).toBe('2026-11-27');
		expect(targetDate('tomorrow', '2026-12-31')).toBe('2027-01-01');
		expect(targetDate('plusWeek', '2026-12-28')).toBe('2027-01-04');
		// D-V4-04: no tz argument, and the card fixes the order of the shared list
		expect(targetDate.length).toBe(2);
		expect(RESCHEDULE.map((r) => r.label)).toEqual(['Today', 'Tomorrow', 'Next weekday', '+1 week']);
	});
});

describe('C8 Skip', () => {
	it('C8 Skip adds exactly one EXDATE, creates no row and leaves the rest of the series alone', () => {
		const i = mk();
		expect(items.inRange(cal(), '2030-02-01', '2030-03-01').map((r) => r.date)).toEqual([
			'2030-02-04',
			'2030-02-11',
			'2030-02-18',
			'2030-02-25',
		]);

		const saved = items.skip(me, `${i.id}@2030-02-11`);
		expect(saved.id).toBe(i.id); // no new row

		const series = items.mustOwn(me, i.id);
		expect(parseExdates(series.exdates)).toEqual(['2030-02-11']); // exactly one
		expect(series.title).toBe(i.title);
		expect(series.date).toBe('2030-02-04');
		expect(series.time).toBe('09:00');
		expect(series.rrule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=4');
		// the other dates keep, and no standalone row appeared on the skipped date
		expect(items.inRange(cal(), '2030-02-01', '2030-03-01').map((r) => r.date)).toEqual([
			'2030-02-04',
			'2030-02-18',
			'2030-02-25',
		]);
		expect(
			expandRRule(
				'2030-02-04',
				'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
				parseExdates(series.exdates),
				'2030-02-01',
				'2030-03-01',
			),
		).toEqual(['2030-02-04', '2030-02-18', '2030-02-25']);

		// a second skip adds the second date only, never a rewrite of the first
		items.skip(me, `${i.id}@2030-02-18`);
		expect(parseExdates(items.mustOwn(me, i.id).exdates)).toEqual(['2030-02-11', '2030-02-18']);
		// already skipped, a made-up @date, and a non-repeating item are all refused
		expect(() => items.skip(me, `${i.id}@2030-02-11`)).toThrow(/not found/i);
		expect(() => items.skip(me, `${i.id}@2030-02-12`)).toThrow(/not found/i);
		const plain = items.create(me, items.itemCreateSchema.parse({ title: 'Plain', date: '2030-02-04' }));
		expect(() => items.skip(me, `${plain.id}@2030-02-04`)).toThrow(/not found/i);
	});
});
