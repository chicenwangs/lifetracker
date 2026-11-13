import { beforeEach, describe, expect, it } from 'vitest';
import {
	activeOptionToken,
	ghostHint,
	optionsFor,
	parseQuickAdd,
	withTarget,
	type QAContext,
} from '../../src/lib/quickadd';

// Fri 2026-11-06, 15:00 local
const ctx: QAContext = {
	today: '2026-11-06',
	nowMinutes: 15 * 60,
};
const p = (t: string, c: Partial<QAContext> = {}) => parseQuickAdd(t, { ...ctx, ...c });

type Row = [string, Record<string, unknown>];

// Day words. /calendar so "no time" is fine and only the date is under test.
const days: Row[] = [
	// tomorrow + typos + punctuation
	['gym tomorrow', { title: 'gym', date: '2026-11-07' }],
	['gym tommorow', { title: 'gym', date: '2026-11-07' }],
	['gym tomorow', { date: '2026-11-07' }],
	['gym tommorrow', { date: '2026-11-07' }],
	['gym tomorroe', { date: '2026-11-07' }],
	['gym tmrw', { date: '2026-11-07' }],
	['gym tmr', { date: '2026-11-07' }],
	['gym 2moro', { date: '2026-11-07' }],
	['gym Tomorrow.', { title: 'gym', date: '2026-11-07' }],
	['gym, tomorrow', { title: 'gym', date: '2026-11-07' }],
	['gym day after tomorrow', { title: 'gym', date: '2026-11-08' }],
	['gym the day after tommorow', { title: 'gym', date: '2026-11-08' }],
	['gym tomorrow morning', { title: 'gym', date: '2026-11-07' }],
	// today-ish
	['gym today', { date: '2026-11-06', dateSet: true }],
	['gym tonight', { title: 'gym', date: '2026-11-06' }],
	['gym tonite', { date: '2026-11-06' }],
	['gym this evening', { title: 'gym', date: '2026-11-06' }],
	['gym yesterday', { date: '2026-11-05', warnings: ['Date is in the past.'] }],
	// relative
	['gym in 3 days', { date: '2026-11-09' }],
	['gym in two days', { title: 'gym', date: '2026-11-08' }],
	['gym in a week', { date: '2026-11-13' }],
	['gym in 2 weeks', { date: '2026-11-20' }],
	['gym in a fortnight', { date: '2026-11-20' }],
	['gym in 1 month', { date: '2026-12-06' }],
	['gym 3 days from now', { title: 'gym', date: '2026-11-09' }],
	['gym a week from tomorrow', { title: 'gym', date: '2026-11-14' }],
	// weeks + weekends + months
	['gym next week', { title: 'gym', date: '2026-11-09' }],
	['gym next week friday', { title: 'gym', date: '2026-11-13' }],
	['gym friday next week', { title: 'gym', date: '2026-11-13' }],
	['gym sunday this week', { date: '2026-11-08' }],
	['gym this weekend', { title: 'gym', date: '2026-11-07' }],
	['gym weekend', { date: '2026-11-07' }],
	['gym next weekend', { date: '2026-11-14' }],
	['rent next month', { title: 'rent', date: '2026-12-01' }],
	['rent end of the month', { title: 'rent', date: '2026-11-30' }],
	['rent eom', { date: '2026-11-30' }],
	// weekdays (+ typos)
	['gym monday', { date: '2026-11-09' }],
	['gym next monday', { date: '2026-11-09' }],
	['gym next next monday', { date: '2026-11-16' }],
	['gym next next next mon', { date: '2026-11-23' }],
	['gym next fri', { date: '2026-11-13' }],
	['gym this sat', { date: '2026-11-07' }],
	['gym wensday', { title: 'gym', date: '2026-11-11' }],
	['gym wednesay', { date: '2026-11-11' }],
	['gym thrusday', { date: '2026-11-12' }],
	['gym saterday', { date: '2026-11-07' }],
	['gym tuseday', { date: '2026-11-10' }],
	['gym Friday!', { title: 'gym', date: '2026-11-06' }],
	// explicit dates
	['party 16 nov', { title: 'party', date: '2026-11-16' }],
	['party 16th of november', { title: 'party', date: '2026-11-16' }],
	['party november 16th, 2027', { title: 'party', date: '2027-11-16' }],
	['party 16 nov 2027', { date: '2027-11-16' }],
	['party febuary 3', { title: 'party', date: '2027-02-03' }],
	['party novemeber 20', { date: '2026-11-20' }],
	['party 1/12', { date: '2026-12-01' }],
	['party 11/16', { date: '2026-11-16' }], // US order when it can only be US
	['party 1/12/27', { date: '2027-12-01' }],
	['party 2026-12-25', { date: '2026-12-25' }],
	['party 29 feb', { date: '2028-02-29' }],
	['party jan 5', { date: '2027-01-05' }],
	['party the 20th', { title: 'party', date: '2026-11-20' }],
	['party on the 20th', { title: 'party', date: '2026-11-20' }],
	['party the 3rd', { date: '2026-12-03' }],
	['party the 31st', { date: '2026-12-31' }],
	['party the 20th of december', { title: 'party', date: '2026-12-20' }],
	// weekday glued to a date
	['party mon 16 nov', { title: 'party', date: '2026-11-16', warnings: [] }],
	['party Monday, 16 November', { title: 'party', date: '2026-11-16', warnings: [] }],
	['party tue 16 nov', { title: 'party', date: '2026-11-16', warnings: ['16/11 is a Mon, not a Tue.'] }],
	// little words
	['dinner on friday', { title: 'dinner', date: '2026-11-06' }],
	['dinner, fri', { title: 'dinner' }],
	['submit essay by wed', { title: 'submit essay', date: '2026-11-11' }],
	// not dates
	['tuesdays plan', { title: 'tuesdays plan', dateSet: false }],
	['remember 5 things', { title: 'remember 5 things', dateSet: false }],
	['Sun Tzu reading tmr', { title: 'Sun Tzu reading', date: '2026-11-07' }],
	['lab 5 fri', { title: 'lab 5', date: '2026-11-06' }],
	['clo3d v1.30 fri', { title: 'clo3d v1.30' }],
	['fridays plan', { title: 'fridays plan' }],
	['next steps doc', { title: 'next steps doc', dateSet: false }],
	['party 31/2', { title: 'party 31/2', dateSet: false }],
	['move mon meeting to wed', { title: 'move mon meeting to', date: '2026-11-11' }],
	['dinner #spot', { title: 'dinner #spot' }],
	['quiz #ds fri /cal', { title: 'quiz #ds', type: 'Event' }],
	['and/or thing', { title: 'and/or thing' }],
	['shout !loud', { title: 'shout !loud' }],
	// rollover
	['party 5 jan', { date: '2027-01-05' }],
	['party 5 nov', { date: '2027-11-05' }],
	['party 2026-01-01', { date: '2026-01-01', warnings: ['Date is in the past.'] }],
];

// Times. Default (planner) so ranges + snapping are visible.
const timesRows: Row[] = [
	['gym 6pm', { time: '18:00', endTime: '19:00', notes: ['60 min default'] }],
	['gym 6PM', { time: '18:00' }],
	['gym 7:30 pm', { title: 'gym', time: '19:30' }],
	['gym 7 p.m.', { title: 'gym', time: '19:00' }],
	['gym 5 pm sat', { title: 'gym', time: '17:00', date: '2026-11-07' }],
	['gym 18:30', { time: '18:30' }],
	['gym 18.30', { time: '18:30' }],
	['gym 18h30', { time: '18:30' }],
	['gym noon tmr', { time: '12:00' }],
	['gym midday tmr', { time: '12:00' }],
	['gym 12am sat', { time: '00:00' }],
	['dinner at 7pm', { title: 'dinner', time: '19:00' }],
	['dinner on friday at 7pm', { title: 'dinner', date: '2026-11-06', time: '19:00' }],
	['meet at the cafe 7pm', { title: 'meet at the cafe', time: '19:00' }],
	['gym 6pm to 8pm', { time: '18:00', endTime: '20:00' }],
	['gym from 6pm to 8pm', { title: 'gym', time: '18:00', endTime: '20:00' }],
	['gym 6-8pm', { time: '18:00', endTime: '20:00' }],
	['gym 6 - 8pm', { title: 'gym', time: '18:00', endTime: '20:00' }],
	['gym 6 to 8pm', { time: '18:00', endTime: '20:00' }],
	['gym 6 pm to 8 pm', { title: 'gym', time: '18:00', endTime: '20:00' }],
	['gym 6pm till 8pm', { time: '18:00', endTime: '20:00' }],
	['gym between 6 and 8pm', { title: 'gym', time: '18:00', endTime: '20:00' }],
	['gym 18:00-19:30', { time: '18:00', endTime: '19:30' }],
	['gym 6pm for 90m', { endTime: '19:30' }],
	['gym 6pm for 1h30', { endTime: '19:30' }],
	['gym 6pm for 2 hours', { title: 'gym', endTime: '20:00' }],
	['gym 6pm for an hour', { title: 'gym', endTime: '19:00' }],
	['gym 6pm for half an hour', { title: 'gym', endTime: '18:30' }],
	['tea for 2 6pm', { title: 'tea for 2', time: '18:00' }],
	['gym 6:07pm to 7:52pm', { time: '18:00', endTime: '19:45', notes: ['rounded to 15 min'] }],
	['movie sat 9pm to 3am', { time: '21:00', endTime: '03:00', endNextDay: true, endMinutes: 1620 }],
	['lunch 24:00 sat', { title: 'lunch 24:00', time: null, ok: false }],
	['price rm5.50 sat 6pm', { title: 'price rm5.50' }],
	['call 2:30pm', { time: '14:30', warnings: ['Time already passed today.'] }],
	['standup fri 9am', { date: '2026-11-13' }], // today + passed -> next week
];

// Where it goes.
const targetRows: Row[] = [
	['call mum 6pm', { target: 'planner', targetSet: false, type: 'Event', typeSet: false }],
	['/planner call mum 6pm', { target: 'planner', targetSet: true }],
	['outing sat /calendar', { target: 'calendar', time: null, endTime: null }],
	['outing sat 2pm /calendar', { target: 'calendar', time: '14:00', endTime: null }],
	[
		'outing sat 2pm to 6pm /calendar',
		{ target: 'calendar', time: '14:00', endTime: null, notes: ['end time needs /both'] },
	],
	['outing sat 2pm to 6pm /both', { target: 'both', time: '14:00', endTime: '18:00' }],
	['/calendar /planner outing sat 2pm', { target: 'both', endTime: '15:00' }],
	['outing sat all day /calendar', { title: 'outing', time: null }],
	[
		'ds quiz fri 2pm /exam /calendar',
		{
			title: 'ds quiz',
			date: '2026-11-13',
			time: '14:00',
			type: 'Exam',
			target: 'calendar',
		},
	],
	[
		'/hobby build planner website /both next next monday 6pm to 10pm',
		{
			title: 'build planner website',
			type: 'Hobby',
			target: 'both',
			date: '2026-11-16',
			time: '18:00',
			endTime: '22:00',
		},
	],
];

for (const [name, rows] of [
	['days', days.map(([t, w]) => [`${t} /calendar`, w] as Row)],
	['times', timesRows],
	['where it goes', targetRows],
] as [string, Row[]][]) {
	describe(`quick add: ${name}`, () => {
		for (const [input, want] of rows) {
			it(JSON.stringify(input), () => {
				const r = p(input);
				if (want.ok === undefined) expect(r.problems).toEqual([]);
				expect(r).toMatchObject(want);
			});
		}
	});
}

describe('quick add: context-dependent', () => {
	it('has a big table', () =>
		expect(days.length + timesRows.length + targetRows.length).toBeGreaterThan(120));
	it('5 jan on 2026-12-01 -> 2027', () => {
		expect(p('party 5 jan /cal', { today: '2026-12-01' })).toMatchObject({ date: '2027-01-05' });
	});
	it('next monday on a Monday = +7; bare monday = today', () => {
		expect(p('gym next mon /cal', { today: '2026-11-09' })).toMatchObject({ date: '2026-11-16' });
		expect(p('gym mon /cal', { today: '2026-11-09', nowMinutes: 60 })).toMatchObject({ date: '2026-11-09' });
	});
	it('"next fri" vs "fri next week" from a Tuesday', () => {
		const tue = { today: '2026-11-10' };
		expect(p('gym next fri /cal', tue).date).toBe('2026-11-13');
		expect(p('gym fri next week /cal', tue).date).toBe('2026-11-20');
		expect(p('gym next week /cal', tue).date).toBe('2026-11-16');
	});
	it('weekend on a Sunday = today; next weekend = next Saturday', () => {
		const sun = { today: '2026-11-08' };
		expect(p('gym this weekend /cal', sun).date).toBe('2026-11-08');
		expect(p('gym next weekend /cal', sun).date).toBe('2026-11-14');
	});
	it('in 1 month clamps to month end', () => {
		expect(p('rent in 1 month /cal', { today: '2027-01-31' }).date).toBe('2027-02-28');
	});
});

describe('quick add: range am/pm + 24h cap (review 2026-11-08)', () => {
	const cases: [string, number, number][] = [
		['work 9 to 5pm', 540, 1020],
		['dinner 6pm to 8', 1080, 1200],
		['party 11pm to 1', 1380, 1500],
		['lunch 12 to 1pm', 720, 780],
		['gym 11:55pm', 1425, 1485],
		['call 6:00pm to 6:05pm', 1080, 1095],
	];
	for (const [t, s0, e0] of cases)
		it(t, () => expect(p(t)).toMatchObject({ startMinutes: s0, endMinutes: e0 }));
	it('prototype words do not crash', () => {
		for (const t of ['constructor', 'toString 3pm', 'gym __proto__', 'x hasOwnProperty'])
			expect(() => p(t)).not.toThrow();
	});
});

describe('problems (shown on Enter only)', () => {
	it('empty', () => expect(p('').problems[0]).toMatch(/Type something/));
	it('no title', () => {
		expect(p('fri 2pm').problems[0]).toMatch(/Add a title first/);
		expect(p('/hobby').problems.join(' ')).toMatch(/Add a title first/);
	});
	it('planner (default) needs a time and says how to fix it', () => {
		const r = p('call mum');
		expect(r.ok).toBe(false);
		expect(r.problems[0]).toMatch(/Planner entries need a time/);
		expect(r.problems[0]).toMatch(/\/calendar/);
	});
	it('/both needs a time', () =>
		expect(p('outing sat /both').problems[0]).toMatch(/`\/both` also adds a planner block/));
	it('/calendar does not need a time', () => expect(p('outing sat /calendar').ok).toBe(true));
	it('unknown /option', () => {
		const r = p('gym 6pm /hobbys');
		expect(r.ok).toBe(false);
		expect(r.problems[0]).toMatch(/`\/hobbys` isn't an option/);
		expect(r.title).toBe('gym');
	});
	it('lists every problem', () => expect(p('/foo').problems).toHaveLength(3)); // bad option, no time, no title
});

describe('palette helpers', () => {
	it('active option token', () => {
		expect(activeOptionToken('gym /ho')).toBe('/ho');
		expect(activeOptionToken('gym /ho ')).toBeNull();
		expect(activeOptionToken('gym #d')).toBeNull();
		expect(activeOptionToken('gym')).toBeNull();
	});
	it('slash menu filters', () => {
		expect(optionsFor('/')).toHaveLength(9);
		expect(optionsFor('/p').map((o) => o.token)).toEqual(['/planner']);
		expect(optionsFor('/b').map((o) => o.token)).toEqual(['/both']);
		expect(optionsFor('/da').map((o) => o.token)).toEqual(['/date']);
	});
	it('ghost text', () => {
		expect(ghostHint('', p(''))).toBe('title  day  time   optional: /type  /calendar or /both');
		expect(ghostHint('/hob', p('/hob'))).toBe('by');
		expect(ghostHint('/hobby', p('/hobby'))).toBe('');
		expect(ghostHint('/hobby gym', p('/hobby gym'))).toBe('  day  time  /calendar or /both');
		const full = '/hobby gym /both fri 6pm';
		expect(ghostHint(full, p(full))).toBe('');
	});
});

// ---------- server ----------
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import { quickAdd } from '../../src/lib/server/quickadd-server';
import * as blocksRepo from '../../src/lib/server/repo/blocks';
import * as itemsRepo from '../../src/lib/server/repo/items';

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
	it('default: planner block only, no calendar item', () => {
		const r = quickAdd(me, 'drive to kuching tmr 6pm', NOW);
		expect(r.item).toBeNull();
		expect(r.block).toMatchObject({
			label: 'drive to kuching',
			type: 'Event',
			itemId: null,
			startAt: '2026-11-07T10:00:00Z',
			endAt: '2026-11-07T11:00:00Z',
		});
	});
	it('timeline drag with no /type = no type (grey); typed type kept', () => {
		const slot = { date: '2026-11-09', start: 600, end: 660 };
		expect(quickAdd(me, 'focus', NOW, slot).block).toMatchObject({ type: null, itemType: null });
		expect(quickAdd(me, 'focus /calendar', NOW, slot).item).toMatchObject({ type: null });
		expect(quickAdd(me, 'focus /hobby', NOW, slot).block).toMatchObject({ type: 'Hobby' });
	});
	it('month day (double-click): calendar item, Event default; time + /both adds a block', () => {
		const day = { date: '2026-11-12', start: 0, end: 0, day: true };
		const r = quickAdd(me, 'picnic', NOW, day);
		expect(r.block).toBeNull();
		expect(r.item).toMatchObject({ title: 'picnic', type: 'Event', date: '2026-11-12', time: null });
		const b = quickAdd(me, 'gym 6pm /both /hobby', NOW, day);
		expect(b.item).toMatchObject({ date: '2026-11-12', type: 'Hobby' });
		expect(b.block).not.toBeNull();
	});
	it('/calendar: item only', () => {
		const r = quickAdd(me, 'outing sat /calendar', NOW);
		expect(r.item).toMatchObject({ title: 'outing', date: '2026-11-07', time: null, type: 'Event' });
		expect(r.block).toBeNull();
		expect(blocksRepo.forItem(me.id, r.item!.id)).toHaveLength(0);
	});
	it('/both: item + linked block in UTC', () => {
		const r = quickAdd(me, '/hobby build planner website /both next next monday 6pm to 10pm', NOW);
		expect(r.item).toMatchObject({
			title: 'build planner website',
			type: 'Hobby',
			date: '2026-11-16',
			time: '18:00',
		});
		expect(r.block).toMatchObject({
			startAt: '2026-11-16T10:00:00Z',
			endAt: '2026-11-16T14:00:00Z',
			itemId: r.item!.id,
		});
		expect(blocksRepo.forItem(me.id, r.item!.id)).toHaveLength(1);
	});
	it('planner across midnight', () => {
		const r = quickAdd(me, 'movie sat 9pm to 3am', NOW);
		expect(r.block).toMatchObject({ startAt: '2026-11-07T13:00:00Z', endAt: '2026-11-07T19:00:00Z' });
	});
	it('problems -> 400, nothing saved', () => {
		expect(() => quickAdd(me, 'gym sat', NOW)).toThrow(/Planner entries need a time/);
		expect(() => quickAdd(me, '/hobby 6pm', NOW)).toThrow(/Add a title first/);
		expect(itemsRepo.withCounts([]).length).toBe(0);
	});
});

describe('dragged slot (planner / week drag box)', () => {
	const slot = { date: '2026-11-09', start: 13 * 60, end: 14 * 60 + 30 };
	it('uses the dragged day + range when none typed', () => {
		const r = p('gym /hobby', { slot });
		expect(r.ok).toBe(true);
		expect(r).toMatchObject({ title: 'gym', type: 'Hobby', target: 'planner', date: '2026-11-09' });
		expect([r.startMinutes, r.endMinutes, r.fromSlot]).toEqual([780, 870, true]);
		expect(r.notes).toEqual([]);
	});
	it('typed time wins over the drag, day stays', () => {
		const r = p('gym 3pm to 4.30pm', { slot });
		expect([r.date, r.startMinutes, r.endMinutes, r.fromSlot]).toEqual(['2026-11-09', 900, 990, false]);
	});
	it('typed day wins over the drag, time stays', () => {
		const r = p('gym tue', { slot });
		expect([r.date, r.startMinutes]).toEqual(['2026-11-10', 780]);
	});
	it('/calendar from a drag = item at the start time, no end-time note', () => {
		const r = p('dinner /calendar', { slot });
		expect(r).toMatchObject({ target: 'calendar', time: '13:00', endMinutes: null });
		expect(r.notes).toEqual([]);
	});
	it('drag to 24:00 stays on the day', () => {
		const r = p('late', { slot: { date: '2026-11-09', start: 23 * 60, end: 1440 } });
		expect([r.startMinutes, r.endMinutes, r.endNextDay]).toEqual([1380, 1440, false]);
	});
	it('ghost hint skips day/time when slotted', () => {
		expect(ghostHint('', p('', { slot }), true)).toBe('title   optional: /type  /calendar');
		expect(ghostHint('gym', p('gym', { slot }), true)).toBe('  /type  /calendar or /both');
	});
	it('month day slot: no time from the slot, defaults to calendar, typed day/time still win', () => {
		const day = { date: '2026-11-12', start: 0, end: 0, day: true };
		const r = p('picnic', { slot: day });
		expect([r.ok, r.target, r.date, r.time, r.fromSlot]).toEqual([
			true,
			'calendar',
			'2026-11-12',
			null,
			false,
		]);
		expect(p('gym 6pm /planner', { slot: day })).toMatchObject({
			ok: true,
			target: 'planner',
			startMinutes: 1080,
		});
		expect(p('gym /planner', { slot: day }).ok).toBe(false);
		expect(p('gym fri', { slot: day }).date).not.toBe('2026-11-12');
		expect(ghostHint('', p('', { slot: day }), 'day')).toBe('title   optional: time  /type  /both');
	});
	it('withTarget swaps the destination token', () => {
		expect(withTarget('gym /hobby', 'calendar')).toBe('gym /hobby /calendar ');
		expect(withTarget('gym /calendar /hobby', 'both')).toBe('gym /hobby /both ');
		expect(withTarget('gym /cal', 'planner')).toBe('gym ');
		expect(withTarget('', 'calendar')).toBe('/calendar ');
	});
});

describe('/remind (P6)', () => {
	it('one or more offsets after /remind, or glued; bad ones are problems; words stay out of the title', () => {
		expect(p('gym tmr 6pm /remind 2h').reminders).toEqual(['2h']);
		expect(p('gym tmr 6pm /remind 1d 2h').reminders).toEqual(['1d', '2h']);
		expect(p('gym tmr 6pm /remind15min').reminders).toEqual(['15min']);
		expect(p('gym tmr 6pm /remind 1d 2h').title).toBe('gym');
		expect(p('gym tmr 6pm /remind 5h').problems.join()).toMatch(/needs a time/);
		expect(p('gym tmr 6pm /remind3h').problems.join()).toMatch(/1w, 3d, 2d, 1d, 2h or 15min/);
		expect(p('gym tmr 6pm').reminders).toEqual([]);
	});
});
