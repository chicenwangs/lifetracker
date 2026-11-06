import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type QAContext } from '../../src/lib/quickadd';

// Fri 2026-11-06, 15:00 local
const ctx: QAContext = {
	today: '2026-11-06',
	nowMinutes: 15 * 60,
	courses: [
		{ id: 'crs_ds', code: 'DS', aliases: ['ds'] },
		{ id: 'crs_sp', code: 'SP', aliases: ['sp', 'sysprog'] },
		{ id: 'crs_ss', code: 'SS', aliases: ['ss', 'socsci'] },
		{ id: 'crs_fyp', code: 'FYP', aliases: ['fyp'] },
	],
};
const p = (t: string, c: Partial<QAContext> = {}) => parseQuickAdd(t, { ...ctx, ...c });

type Row = [string, Record<string, unknown>];
const table: Row[] = [
	// spec acceptance
	[
		'ds quiz fri 2pm !exam #ds',
		{ title: 'ds quiz', date: '2026-11-13', time: '14:00', type: 'Exam', courseId: 'crs_ds' },
	],
	['ds quiz fri 4pm !exam #ds', { date: '2026-11-06', time: '16:00' }], // today, not passed
	['ds quiz fri !exam', { date: '2026-11-06', time: null }], // today, no time
	// whole-token + ambiguity
	['Sun Tzu reading tmr', { title: 'Sun Tzu reading', date: '2026-11-07' }],
	['lab 5 fri', { title: 'lab 5', date: '2026-11-06' }],
	['dinner #spot', { title: 'dinner #spot', type: 'Event', courseId: null }],
	['clo3d v1.30 fri', { title: 'clo3d v1.30', time: null, date: '2026-11-06' }],
	['sunday brunch', { title: 'brunch', date: '2026-11-08' }],
	['fridays plan', { title: 'fridays plan', date: '2026-11-06' }],
	// rollover
	['5 jan', { title: '', ok: false }],
	['party 5 jan', { title: 'party', date: '2027-01-05' }],
	['party jan 5', { date: '2027-01-05' }],
	['party 6 nov', { date: '2026-11-06' }],
	['party 5 nov', { date: '2027-11-05' }],
	['party 1/12', { date: '2026-12-01' }], // D/M
	['party 31/2', { title: 'party 31/2', date: '2026-11-06' }], // invalid -> title, today
	['party 1/12/2027', { date: '2027-12-01' }],
	['party 2026-12-25', { date: '2026-12-25' }],
	['party 2026-01-01', { date: '2026-01-01', warnings: ['Date is in the past.'] }],
	['party 29 feb', { date: '2028-02-29' }],
	['party 21st dec', { date: '2026-12-21' }],
	// last date wins
	['move mon meeting to wed', { title: 'move mon meeting to', date: '2026-11-11' }],
	['tmr today thing', { title: 'tmr thing', date: '2026-11-06' }],
	// times
	['call 2:30pm', { time: '14:30', date: '2026-11-06', warnings: ['Time already passed today.'] }],
	['call 14.30 tmr', { time: '14:30', date: '2026-11-07', warnings: [] }],
	['call 9am mon', { time: '09:00', date: '2026-11-09' }],
	['call 12am sat', { time: '00:00', date: '2026-11-07' }],
	['call 12pm sat', { time: '12:00' }],
	['call 5 pm sat', { title: 'call', time: '17:00' }],
	['call noon sat', { time: '12:00' }],
	['lunch 24:00 sat', { title: 'lunch 24:00', time: null }],
	['price rm5.50 sat', { title: 'price rm5.50', time: null }],
	['fri 2pm', { title: '', ok: false }],
	// types + courses
	['date night sat !date', { type: 'Dating', title: 'date night' }],
	['gym !hobby', { type: 'Hobby' }],
	['assignment #sysprog fri', { type: 'Work', courseId: 'crs_sp', title: 'assignment' }],
	['essay #socsci !exam', { type: 'Exam', courseId: 'crs_ss' }],
	['read #FYP', { courseId: 'crs_fyp', type: 'Work' }],
	['shout !loud', { title: 'shout !loud', type: 'Event' }],
	['', { ok: false }],
];

describe('quick add table', () => {
	it('has >= 30 cases', () => expect(table.length).toBeGreaterThanOrEqual(30));
	for (const [input, want] of table) {
		it(JSON.stringify(input), () => {
			const r = p(input);
			if (want.ok === false) {
				expect(r.ok).toBe(false);
				return;
			}
			expect(r.ok).toBe(true);
			const { ok: _ok, ...rest } = want;
			void _ok;
			expect(r).toMatchObject(rest);
		});
	}
	it('weekday today with passed time rolls +7', () => {
		expect(p('standup fri 9am')).toMatchObject({ date: '2026-11-13' });
	});
	it('5 jan on 2026-12-01 -> 2027', () => {
		expect(p('party 5 jan', { today: '2026-12-01' })).toMatchObject({ date: '2027-01-05' });
	});
});
