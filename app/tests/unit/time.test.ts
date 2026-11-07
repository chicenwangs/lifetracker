import { describe, expect, it } from 'vitest';
import * as t from '../../src/lib/time';

const KL = 'Asia/Kuala_Lumpur';

describe('dates', () => {
	it('addDays across month/year/leap', () => {
		expect(t.addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(t.addDays('2028-02-28', 1)).toBe('2028-02-29');
		expect(t.addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
	it('isDate rejects bad', () => {
		expect(t.isDate('2026-02-30')).toBe(false);
		expect(t.isDate('2026-2-3')).toBe(false);
		expect(t.isDate('2026-11-06')).toBe(true);
	});
	it('weekday Mon=1 Sun=7', () => {
		expect(t.weekdayOf('2026-11-06')).toBe(5); // Fri
		expect(t.weekdayOf('2026-11-08')).toBe(7);
		expect(t.mondayOf('2026-11-08')).toBe('2026-11-02');
	});
	it('ISO week-year: 2027-01-02 = 2026-W53', () => {
		expect(t.isoWeekKey('2027-01-02')).toBe('2026-W53');
		expect(t.isoWeekKey('2027-01-04')).toBe('2027-W01');
		expect(t.isoWeekKey('2026-11-06')).toBe('2026-W45');
	});
	it('month grid Monday start, 42 days', () => {
		expect(t.monthGridRange(2026, 11)).toEqual({ from: '2026-10-26', to: '2026-12-07' });
	});
});

describe('tz', () => {
	it('today in KL at 23:30 UTC is next day', () => {
		expect(t.todayLocal(KL, Date.parse('2026-11-06T23:30:00Z'))).toBe('2026-11-07');
		expect(t.todayLocal(KL, Date.parse('2026-11-06T15:59:00Z'))).toBe('2026-11-06');
	});
	it('local <-> utc', () => {
		expect(t.localToUtc('2026-11-06', '13:00', KL)).toBe('2026-11-06T05:00:00Z');
		expect(t.localToUtc('2026-11-06', 0, KL)).toBe('2026-11-05T16:00:00Z');
		expect(t.localToUtc('2026-11-06', 1440 + 60, KL)).toBe('2026-11-06T17:00:00Z'); // 01:00 next day
		expect(t.utcToLocal('2026-11-05T16:00:00Z', KL)).toEqual({
			date: '2026-11-06',
			time: '00:00',
			minutes: 0,
		});
	});
	it('clip 23:00-06:00 shows on both days', () => {
		const s = t.localToUtc('2026-11-06', '23:00', KL);
		const e = t.localToUtc('2026-11-07', '06:00', KL);
		expect(t.clipToDay(s, e, '2026-11-06', KL)).toEqual({
			top: 1380,
			bottom: 1440,
			clippedStart: false,
			clippedEnd: true,
		});
		expect(t.clipToDay(s, e, '2026-11-07', KL)).toEqual({
			top: 0,
			bottom: 360,
			clippedStart: true,
			clippedEnd: false,
		});
		expect(t.clipToDay(s, e, '2026-11-08', KL)).toBeNull();
	});
});

describe('snap', () => {
	it('15 min snap + zero length', () => {
		expect(t.snap15(7)).toBe(0);
		expect(t.snap15(8)).toBe(15);
		expect(t.fixRange(780, 870)).toEqual([780, 870]);
		expect(t.fixRange(780, 782)).toEqual([780, 795]);
		expect(t.fixRange(800, 790)).toEqual([795, 810]);
	});
});

describe('FullCalendar mapping', () => {
	it('all-day end +1 (exclusive)', () => {
		expect(t.itemToFc({ date: '2026-11-06', time: null, endDate: '2026-11-08' })).toEqual({
			start: '2026-11-06',
			end: '2026-11-09',
			allDay: true,
		});
		expect(t.itemToFc({ date: '2026-11-06', time: '14:00', endDate: null })).toEqual({
			start: '2026-11-06T14:00',
			allDay: false,
		});
		expect(t.itemToFc({ date: null, time: null, endDate: null })).toBeNull();
	});
	it('drop keeps span', () => {
		expect(t.fcDropToItem({ date: '2026-11-06', time: null, endDate: '2026-11-08' }, '2026-11-10')).toEqual({
			date: '2026-11-10',
			endDate: '2026-11-12',
		});
		expect(
			t.fcDropToItem({ date: '2026-11-06', time: '14:00', endDate: null }, '2026-11-10T14:00:00'),
		).toEqual({
			date: '2026-11-10',
			endDate: null,
		});
	});
	it('pretty', () => {
		expect(t.prettyTime('14:00')).toBe('2pm');
		expect(t.prettyTime('00:30')).toBe('12:30am');
		expect(t.prettyDate('2026-11-06')).toBe('Fri 6 Nov 2026');
	});
});
