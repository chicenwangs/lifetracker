import { beforeEach, describe, expect, it } from 'vitest';
import {
	activeOptionToken,
	ghostHint,
	optionsFor,
	parseQuickAdd,
	type QAContext,
} from '../../src/lib/quickadd';

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
	// spec acceptance (new grammar)
	[
		'ds quiz fri 2pm /exam #ds',
		{ title: 'ds quiz', date: '2026-11-13', time: '14:00', type: 'Exam', courseId: 'crs_ds' },
	],
	['ds quiz fri 4pm /exam #ds', { date: '2026-11-06', time: '16:00' }],
	['ds quiz fri /exam', { date: '2026-11-06', time: null }],
	// any order
	['/exam ds quiz', { title: 'ds quiz', type: 'Exam' }],
	['build planner website /hobby', { title: 'build planner website', type: 'Hobby' }],
	// defaults
	['call mum', { type: 'Event', typeSet: false, target: 'calendar', targetSet: false, date: '2026-11-06' }],
	// whole-token + ambiguity
	['Sun Tzu reading tmr', { title: 'Sun Tzu reading', date: '2026-11-07' }],
	['lab 5 fri', { title: 'lab 5', date: '2026-11-06' }],
	['dinner #spot', { title: 'dinner #spot', type: 'Event', courseId: null }],
	['clo3d v1.30 fri', { title: 'clo3d v1.30', time: null }],
	['sunday brunch', { title: 'brunch', date: '2026-11-08' }],
	['fridays plan', { title: 'fridays plan' }],
	['build planner website', { title: 'build planner website', target: 'calendar' }],
	['shout !loud', { title: 'shout !loud' }],
	['and/or thing', { title: 'and/or thing', ok: true }],
	// old ! syntax no longer an option (stays title)
	['gym !hobby', { title: 'gym !hobby', type: 'Event' }],
	// next / this / in
	['gym next monday', { date: '2026-11-09' }],
	['gym next mon', { date: '2026-11-09' }],
	['gym next next monday', { date: '2026-11-16' }],
	['gym next next next mon', { date: '2026-11-23' }],
	['gym next fri', { date: '2026-11-13' }], // today is Fri -> next Fri never today
	['gym this sat', { date: '2026-11-07' }],
	['gym in 3 days', { date: '2026-11-09' }],
	['gym in 2 weeks', { date: '2026-11-20' }],
	['next steps doc', { title: 'next steps doc' }],
	['gym tonight 9pm', { date: '2026-11-06', time: '21:00' }],
	// dates
	['party 5 jan', { title: 'party', date: '2027-01-05' }],
	['party jan 5', { date: '2027-01-05' }],
	['party 5 nov', { date: '2027-11-05' }],
	['party 1/12', { date: '2026-12-01' }],
	['party 31/2', { title: 'party 31/2', date: '2026-11-06' }],
	['party 2026-12-25', { date: '2026-12-25' }],
	['party 2026-01-01', { date: '2026-01-01', warnings: ['Date is in the past.'] }],
	['party 29 feb', { date: '2028-02-29' }],
	['party 21st dec', { date: '2026-12-21' }],
	['move mon meeting to wed', { title: 'move mon meeting to', date: '2026-11-11' }],
	// times
	['call 2:30pm', { time: '14:30', warnings: ['Time already passed today.'] }],
	['call 14.30 tmr', { time: '14:30', date: '2026-11-07', warnings: [] }],
	['call 9am mon', { time: '09:00', date: '2026-11-09' }],
	['call 12am sat', { time: '00:00' }],
	['call 5 pm sat', { title: 'call', time: '17:00' }],
	['call noon sat', { time: '12:00' }],
	['lunch 24:00 sat', { title: 'lunch 24:00', time: null }],
	['price rm5.50 sat', { title: 'price rm5.50', time: null }],
	// calendar ignores end
	['gym 6pm to 8pm', { time: '18:00', endTime: null, target: 'calendar' }],
	// planner
	[
		'/hobby build planner website /planner next next monday 6pm to 10pm',
		{
			title: 'build planner website',
			type: 'Hobby',
			target: 'planner',
			date: '2026-11-16',
			time: '18:00',
			endTime: '22:00',
			endNextDay: false,
		},
	],
	['gym /planner sat 6-8pm', { time: '18:00', endTime: '20:00' }],
	['gym /planner sat 6 to 8pm', { time: '18:00', endTime: '20:00' }],
	['gym /planner sat 6 pm to 8 pm', { title: 'gym', time: '18:00', endTime: '20:00' }],
	['gym /planner sat 18:00-19:30', { time: '18:00', endTime: '19:30' }],
	['gym /planner sat 6pm', { time: '18:00', endTime: '19:00', notes: ['60 min default'] }],
	['gym /planner sat 6pm for 90m', { endTime: '19:30' }],
	['gym /planner sat 6pm for 1h30', { endTime: '19:30' }],
	['gym /planner sat 6:07pm to 7:52pm', { time: '18:00', endTime: '19:45', notes: ['rounded to 15 min'] }],
	['movie /planner sat 9pm to 3am', { time: '21:00', endTime: '03:00', endNextDay: true, endMinutes: 1620 }],
	['sleep /plan sat 11pm to 6am', { target: 'planner', endNextDay: true }],
	['gym /cal sat', { target: 'calendar' }],
];

describe('quick add table', () => {
	it('has >= 30 cases', () => expect(table.length).toBeGreaterThanOrEqual(30));
	for (const [input, want] of table) {
		it(JSON.stringify(input), () => {
			const r = p(input);
			if (want.ok === undefined) expect(r.problems).toEqual([]);
			expect(r).toMatchObject(want);
		});
	}
	it('weekday today with passed time rolls +7', () => {
		expect(p('standup fri 9am')).toMatchObject({ date: '2026-11-13' });
	});
	it('5 jan on 2026-12-01 -> 2027', () => {
		expect(p('party 5 jan', { today: '2026-12-01' })).toMatchObject({ date: '2027-01-05' });
	});
	it('next monday on a Monday = +7', () => {
		expect(p('gym next mon', { today: '2026-11-09' })).toMatchObject({ date: '2026-11-16' });
		expect(p('gym mon', { today: '2026-11-09', nowMinutes: 60 })).toMatchObject({ date: '2026-11-09' });
	});
});

describe('problems (shown on Enter only)', () => {
	it('empty', () => expect(p('').problems[0]).toMatch(/Type something/));
	it('no title', () => {
		expect(p('fri 2pm').problems[0]).toMatch(/Add a title first/);
		expect(p('5 jan').ok).toBe(false);
		expect(p('/hobby').problems[0]).toMatch(/Add a title first/);
	});
	it('planner needs a time', () => {
		const r = p('gym /planner sat');
		expect(r.ok).toBe(false);
		expect(r.problems[0]).toMatch(/planner needs a time/);
	});
	it('unknown /option', () => {
		const r = p('gym /hobbys');
		expect(r.ok).toBe(false);
		expect(r.problems[0]).toMatch(/`\/hobbys` isn't an option/);
		expect(r.title).toBe('gym');
	});
	it('lists every problem', () => expect(p('/foo /planner').problems).toHaveLength(3)); // bad option, no time, no title
});

describe('palette helpers', () => {
	it('active option token', () => {
		expect(activeOptionToken('gym /ho')).toBe('/ho');
		expect(activeOptionToken('gym /ho ')).toBeNull();
		expect(activeOptionToken('gym #d')).toBe('#d');
		expect(activeOptionToken('gym')).toBeNull();
	});
	it('slash menu filters', () => {
		expect(optionsFor('/', ctx.courses)).toHaveLength(7);
		expect(optionsFor('/p', ctx.courses).map((o) => o.token)).toEqual(['/planner']);
		expect(optionsFor('/da', ctx.courses).map((o) => o.token)).toEqual(['/date']);
		expect(optionsFor('#s', ctx.courses).map((o) => o.label)).toEqual(['SP', 'SS']);
	});
	it('ghost text', () => {
		expect(ghostHint('', p(''), ctx.courses)).toBe('/type  title  /calendar or /planner  day  time');
		expect(ghostHint('/hob', p('/hob'), ctx.courses)).toBe('by');
		expect(ghostHint('/hobby', p('/hobby'), ctx.courses)).toBe('');
		expect(ghostHint('/hobby gym', p('/hobby gym'), ctx.courses)).toBe('  /calendar or /planner  day  time');
		const full = '/hobby gym /planner fri 6pm';
		expect(ghostHint(full, p(full), ctx.courses)).toBe('');
	});
});

// ---------- server: item + linked block ----------
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import { quickAdd } from '../../src/lib/server/quickadd-server';
import * as blocksRepo from '../../src/lib/server/repo/blocks';

describe('quickAdd server', () => {
	let me: App.SafeUser;
	// Fri 2026-11-06 15:00 KL = 07:00Z
	const NOW = Date.parse('2026-11-06T07:00:00Z');
	beforeEach(() => {
		freshDb();
		me = usersRepo.safe(
			usersRepo.createWithCalendar({
				username: 'jeremy',
				displayName: 'Jeremy',
				passwordHash: 'x',
				role: 'admin',
			}),
		);
	});
	it('calendar: item only', () => {
		const r = quickAdd(me, 'call mum tmr 6pm', NOW);
		expect(r.item).toMatchObject({ title: 'call mum', date: '2026-11-07', time: '18:00', type: 'Event' });
		expect(r.block).toBeNull();
		expect(blocksRepo.forItem(me.id, r.item!.id)).toHaveLength(0);
	});
	it('planner: item + linked block in UTC', () => {
		const r = quickAdd(me, '/hobby build planner website /planner next next monday 6pm to 10pm', NOW);
		expect(r.item).toMatchObject({
			title: 'build planner website',
			type: 'Hobby',
			date: '2026-11-16',
			time: '18:00',
		});
		expect(r.block).toMatchObject({ startAt: '2026-11-16T10:00:00Z', endAt: '2026-11-16T14:00:00Z' });
		const bs = blocksRepo.forItem(me.id, r.item!.id);
		expect(bs).toHaveLength(1);
		expect(bs[0]?.label).toBe('build planner website');
	});
	it('planner across midnight', () => {
		const r = quickAdd(me, 'movie /planner sat 9pm to 3am', NOW);
		expect(r.block).toMatchObject({ startAt: '2026-11-07T13:00:00Z', endAt: '2026-11-07T19:00:00Z' });
	});
	it('problems -> 400, nothing saved', () => {
		expect(() => quickAdd(me, 'gym /planner sat', NOW)).toThrow(/planner needs a time/);
		expect(() => quickAdd(me, '/hobby', NOW)).toThrow(/Add a title first/);
	});
});
