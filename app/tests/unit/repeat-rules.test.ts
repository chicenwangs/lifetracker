// #296: repeat rules must not corrupt occurrences (end before start, clear after tick, fake @date, split reminders).
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as rem from '../../src/lib/server/reminders';
import { itemView } from '../../src/lib/server/itemview';
import { expandRRule, parseExdates } from '../../src/lib/rrule';

let me: string;
let user: App.SafeUser;
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	const r = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	});
	me = r.id;
	user = usersRepo.safe(r);
});
const mk = (over = {}) =>
	items.create(me, items.itemCreateSchema.parse({ title: 'Rep', date: '2028-01-03', rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6', ...over })); // prettier-ignore
const occ = (id: string, from: string, to: string) => {
	const r = items.mustOwn(me, id);
	return expandRRule(r.date as string, r.rrule as string, parseExdates(r.exdates), from, to);
};

describe('#296 repeat end', () => {
	it('an end before the start is rejected on create and patch', () => {
		expect(() => mk({ rrule: 'FREQ=DAILY;UNTIL=2028-01-01' })).toThrow(/repeat end/);
		const i = mk();
		expect(() => items.patch(me, i.id, { rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=2027-12-01' })).toThrow(
			/repeat end/,
		);
		expect(items.mustOwn(me, i.id).rrule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=6');
		expect(occ(i.id, '2028-01-01', '2028-03-01')).toHaveLength(6);
	});
	it('moving the series start past its end is rejected', () => {
		const i = mk({ rrule: 'FREQ=DAILY;UNTIL=2028-01-10' });
		expect(() => items.patch(me, i.id, { date: '2028-02-01' })).toThrow(/repeat end/);
	});
});

describe('#296 clearing repeat after a tick', () => {
	it('does not leave two rows on the date that was already detached', () => {
		const i = mk({ date: '2028-06-05', rrule: 'FREQ=DAILY;COUNT=3' });
		const ticked = items.cycle(me, `${i.id}@2028-06-05`);
		expect(ticked.id).not.toBe(i.id);
		items.patch(me, i.id, { rrule: null });
		const s = items.mustOwn(me, i.id);
		expect(s.rrule).toBeNull();
		expect(s.date).toBe('2028-06-06'); // first date the series still owns
	});
	it('refuses when every date was detached', () => {
		const i = mk({ date: '2028-06-05', rrule: 'FREQ=DAILY;COUNT=1' });
		items.cycle(me, `${i.id}@2028-06-05`);
		expect(() => items.patch(me, i.id, { rrule: null })).toThrow(/delete the series/);
	});
});

describe('#296 made-up @date', () => {
	it('view and tick 404 on a date the rule never generates', () => {
		const i = mk({ date: '2027-01-02', rrule: 'FREQ=WEEKLY;BYDAY=SA;UNTIL=2027-02-01' });
		expect(() => itemView(user, `${i.id}@2027-01-05`)).toThrow();
		expect(() => itemView(user, `${i.id}@2027-06-01`)).toThrow();
		expect(() => items.cycle(me, `${i.id}@2027-01-05`)).toThrow();
		expect(() => items.cycle(me, `${i.id}@2027-06-01`)).toThrow();
		expect(itemView(user, `${i.id}@2027-01-09`).item.date).toBe('2027-01-09');
	});
});

describe('#296 this and following keeps reminders', () => {
	it('the new half gets the relative reminder', () => {
		const NOW = Date.parse('2028-02-20T02:00:00Z');
		const i = mk({ date: '2028-03-01', time: '10:00', rrule: 'FREQ=DAILY;COUNT=6' });
		rem.add(me, 'planner_item', i.id, { offset: '1d' }, NOW);
		const made = items.patch(me, `${i.id}@2028-03-04`, { title: 'Renamed', scope: 'following' });
		expect(made.id).not.toBe(i.id);
		rem.splitSeries(me, i.id, made.id, NOW);
		const list = rem.list(me, 'planner_item', made.id);
		expect(list).toHaveLength(1);
		expect(list[0]?.dueAt).toBe('2028-03-03T02:00:00Z'); // 1 d before 4 Mar 10:00 KL
	});
});
