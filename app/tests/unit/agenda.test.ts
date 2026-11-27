// Card 05 (D-V4-06): agenda() = the own-calendar range query behind the Android week widgets, ICS export and digest.
import { beforeEach, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import * as keys from '../../src/lib/server/repo/sharekeys';
import { agenda } from '../../src/lib/server/agenda';
import { getCalendar } from '../../src/lib/server/calendar';
import { ApiFail } from '../../src/lib/server/http';
import { addDays } from '../../src/lib/time';

const D = '2026-11-13';
let me: App.SafeUser;

const mk = (username: string) =>
	usersRepo.createWithCalendar({ username, displayName: username, passwordHash: 'x', role: 'member' }).id;
const item = (input: Record<string, unknown>) => items.create(me.id, items.itemCreateSchema.parse(input));
const block = (input: Record<string, unknown>) => blocks.create(me.id, blocks.blockCreateSchema.parse(input));

beforeEach(() => {
	freshDb();
	me = usersRepo.safe(usersRepo.byId(mk('jeremy'))!);
});

it('C1 own calendar, live top-level rows, repeats expanded, blocks padded a day each side', () => {
	const trip = item({ title: 'Trip', date: D, endDate: '2026-11-15' });
	item({ title: 'Pack', date: D, parentId: trip.id });
	const gone = item({ title: 'Gone', date: D });
	items.softDelete(me.id, gone.id);
	const gym = item({ title: 'Gym', date: D, time: '18:00', rrule: 'FREQ=DAILY;COUNT=3' });
	item({ title: 'After', date: '2026-11-15' });
	// 22:00 KL on the day before `from` to 02:00 KL on `from`: only the padded query sees it
	block({ label: 'Night shift', startAt: '2026-11-12T14:00:00Z', endAt: '2026-11-12T18:00:00Z' });

	const a = agenda(me, D, '2026-11-15');

	expect(a.items.map((i) => [i.title, i.date])).toEqual([
		['Trip', '2026-11-13'],
		['Gym', '2026-11-13'],
		['Gym', '2026-11-14'],
	]);
	expect(a.items.slice(1).map((i) => [i.id, i.seriesId])).toEqual([
		[`${gym.id}@2026-11-13`, gym.id],
		[`${gym.id}@2026-11-14`, gym.id],
	]);
	expect(a.blocks.map((b) => b.label)).toEqual(['Night shift']);
});

it("C2 hidden types are dropped (untyped = 'None'); a private item keeps both flags", () => {
	item({ title: 'Gym', type: 'Hobby', date: D });
	item({ title: 'Milk', date: D });
	item({ title: 'Doctor', type: 'Exam', date: D, private: true });

	const a = agenda({ ...me, hiddenTypes: ['Hobby', 'None'] }, D, '2026-11-14');

	expect(a.items.map((i) => i.title)).toEqual(['Doctor']);
	expect(a.items[0]).toMatchObject({ type: 'Exam', private: true });
});

it('C4 an overnight block crossing the range edge equals getCalendar own side', () => {
	block({ label: 'Night shift', startAt: '2026-11-12T14:00:00Z', endAt: '2026-11-12T18:00:00Z' });
	// 21:00–22:00 KL on the day before `from`: wholly outside the unpadded range, so only the left pad sees it
	block({ label: 'Late errand', startAt: '2026-11-12T13:00:00Z', endAt: '2026-11-12T14:00:00Z' });

	const a = agenda(me, D, '2026-11-14');

	expect(a).toEqual(getCalendar(me, D, '2026-11-14', { shared: false }));
	expect(a.blocks.map((b) => b.label)).toEqual(['Late errand', 'Night shift']);
});

it('C4 a repeating occurrence id (id@date) equals getCalendar own side', () => {
	const gym = item({ title: 'Gym', date: D, time: '18:00', rrule: 'FREQ=DAILY;COUNT=2' });

	const a = agenda(me, D, '2026-11-15');

	expect(a).toEqual(getCalendar(me, D, '2026-11-15', { shared: false }));
	expect(a.items.map((i) => i.id)).toEqual([`${gym.id}@2026-11-13`, `${gym.id}@2026-11-14`]);
});

it('C4 an all-day item (date, endDate null) equals getCalendar own side', () => {
	item({ title: 'Trip', date: D });

	const a = agenda(me, D, '2026-11-14');

	expect(a).toEqual(getCalendar(me, D, '2026-11-14', { shared: false }));
	expect(a.items[0]).toMatchObject({ title: 'Trip', date: D, endDate: null, time: null });
});

it('C5 read-only and repeatable: two calls match and no journal row appears', () => {
	item({ title: 'Gym', date: D, rrule: 'FREQ=DAILY' });
	block({ label: 'Gym', startAt: '2026-11-13T10:00:00Z', endAt: '2026-11-13T11:00:00Z' });
	const journalled = () =>
		(handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n;

	const before = journalled();
	const a = agenda(me, D, '2026-11-14');
	expect(journalled()).toBe(before);
	expect(agenda(me, D, '2026-11-14')).toEqual(a);
	expect(journalled()).toBe(before);
});

it('C6 rejects bad dates and spans outside 1..62 with getCalendar’s 400', () => {
	const boom = (from: string, to: string) => {
		try {
			agenda(me, from, to);
		} catch (e) {
			expect(e).toBeInstanceOf(ApiFail);
			return e as ApiFail;
		}
		throw new Error('expected a 400');
	};

	expect(boom('2026-11-1', '2026-11-14')).toMatchObject({
		status: 400,
		code: 'bad_request',
		message: 'from/to must be YYYY-MM-DD',
	});
	expect(boom('2026-02-31', '2026-03-01')).toMatchObject({ status: 400, message: 'from/to must be YYYY-MM-DD' }); // prettier-ignore
	expect(boom(D, D)).toMatchObject({ status: 400, message: 'range 1..62 days' });
	expect(boom(D, '2026-11-12')).toMatchObject({ status: 400, message: 'range 1..62 days' });
	expect(boom(D, addDays(D, 63))).toMatchObject({ status: 400, message: 'range 1..62 days' });
	expect(agenda(me, D, addDays(D, 62))).toEqual({ items: [], blocks: [] }); // 62 days stays allowed
	expect(() => getCalendar(me, D, D)).toThrow('range 1..62 days');
});

it("C7 repeats one row per occurrence in range, hidden types dropped, no other user's calendar even when overlap is on", () => {
	const other = mk('neina');
	items.create(other, items.itemCreateSchema.parse({ title: 'Dinner', type: 'Dating', date: D }));
	keys.redeem(me.id, keys.create(other, { types: ['Dating'], hiddenAs: 'none', expiry: '7d' }).code);
	expect(getCalendar(me, D, '2026-11-14').items.map((i) => i.title)).toEqual(['Dinner']); // overlap really is on

	const gym = item({ title: 'Gym', date: D, rrule: 'FREQ=DAILY;COUNT=3' });
	item({ title: 'Hidden', type: 'Hobby', date: D });

	const a = agenda({ ...me, hiddenTypes: ['Hobby'] }, D, '2026-11-15');

	expect(a.items.map((i) => i.title)).toEqual(['Gym', 'Gym']); // 15th is outside [from, to)
	expect(a.items.every((i) => i.seriesId === gym.id)).toBe(true);
});
