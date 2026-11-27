// Blind tests for card 05, from its Done-when lines only: C1 (the range query), C2 (type visibility),
// C4 (getCalendar equality, three fixtures), C5 (read-only), C6 (the 400s), C7 (repeats / hidden / other user).
// No builder test (agenda.test.ts / native.test.ts) was opened.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import { agenda } from '../../src/lib/server/agenda';
import { getCalendar } from '../../src/lib/server/calendar';
import { ApiFail } from '../../src/lib/server/http';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as itemTypes from '../../src/lib/server/repo/itemtypes';
import * as blocks from '../../src/lib/server/repo/blocks';
import * as grants from '../../src/lib/server/repo/grants';
import * as sharekeys from '../../src/lib/server/repo/sharekeys';
import * as reminders from '../../src/lib/server/reminders';
import { addDays, localToUtc } from '../../src/lib/time';

const TZ = 'Asia/Kuala_Lumpur';
const FROM = '2026-12-01';
const TO = '2026-12-08'; // exclusive, as getCalendar's `to`

let meId: string;
let otherId: string;

beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	meId = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	}).id;
	otherId = usersRepo.createWithCalendar({
		username: 'partner',
		displayName: 'P',
		passwordHash: 'x',
		role: 'member',
	}).id;
});

const meNow = (): App.SafeUser => usersRepo.safe(usersRepo.byId(meId)!);

const mk = (owner: string, over: Record<string, unknown> = {}) =>
	items.create(owner, items.itemCreateSchema.parse({ title: 'Blind 05 item', ...over }));

/** local start/end -> UTC Z; the DB stores instants */
const mkBlock = (label: string, startDate: string, start: string, endDate: string, end: string) =>
	blocks.create(
		meId,
		blocks.blockCreateSchema.parse({
			label,
			startAt: localToUtc(startDate, start, TZ),
			endAt: localToUtc(endDate, end, TZ),
		}),
	);

const failOf = (fn: () => unknown): ApiFail | null => {
	try {
		fn();
		return null;
	} catch (e) {
		return e as ApiFail;
	}
};

describe('C1 agenda range query', () => {
	it('C1 returns own default-calendar live top-level items with repeats expanded per occurrence, and blocks padded one day each side', () => {
		const inside = mk(meId, { title: 'C1 inside', date: '2026-12-03' });
		// starts before `from` but overlaps it (itemsRepo.inRange keeps rows whose end >= from)
		const dayBefore = mk(meId, { title: 'C1 spanning edge', date: '2026-11-30', endDate: '2026-12-01' });
		const lastDay = mk(meId, { title: 'C1 last day', date: '2026-12-07' });
		const parent = mk(meId, { title: 'C1 parent', date: '2026-12-02' });
		const repeat = mk(meId, {
			title: 'C1 repeat',
			date: '2026-11-30',
			rrule: 'FREQ=DAILY;COUNT=3', // 11-30, 12-01, 12-02
		});

		// excluded: at/after `to`, far before `from`, a step, trashed, another user's calendar
		mk(meId, { title: 'C1 at to', date: TO });
		mk(meId, { title: 'C1 far before', date: '2026-11-20' });
		mk(meId, { title: 'C1 step', date: '2026-12-02', parentId: parent.id });
		const gone = mk(meId, { title: 'C1 trashed', date: '2026-12-04' });
		items.softDelete(meId, gone.id);
		mk(otherId, { title: 'C1 other user', date: '2026-12-03' });

		// blocks: one crossing each range edge, one before and one after the padded window
		const overnight = mkBlock('C1 overnight', '2026-11-30', '23:00', '2026-12-01', '01:00');
		const rightEdge = mkBlock('C1 right edge', '2026-12-08', '23:00', '2026-12-09', '01:00');
		mkBlock('C1 too early', '2026-11-29', '22:00', '2026-11-29', '23:00');
		mkBlock('C1 too late', '2026-12-09', '01:00', '2026-12-09', '02:00');
		const goneBlock = mkBlock('C1 trashed block', '2026-12-02', '10:00', '2026-12-02', '11:00');
		blocks.softDelete(meId, goneBlock.id);

		const a = agenda(meNow(), FROM, TO);

		expect(a.items.map((i) => i.id).sort()).toEqual(
			[
				inside.id,
				dayBefore.id,
				lastDay.id,
				parent.id,
				`${repeat.id}@2026-12-01`,
				`${repeat.id}@2026-12-02`,
			].sort(),
		);
		// one row per occurrence, none of the series rows duplicated outside the range
		expect(a.items.filter((i) => i.seriesId === repeat.id)).toHaveLength(2);

		expect(a.blocks.map((b) => b.id)).toEqual([overnight.id, rightEdge.id]);
		expect(a.blocks.find((b) => b.id === overnight.id)?.label).toBe('C1 overnight');
	});
});

describe('C2 type visibility', () => {
	it("C2 drops hidden-type items (untyped = 'None') and keeps each remaining item's private flag and type key", () => {
		const shownType = itemTypes.create(meId, {
			name: 'Blind shown',
			bg: '#123456',
			countsDown: false,
			shareDefault: false,
		});
		const hiddenType = itemTypes.create(meId, {
			name: 'Blind hidden',
			bg: '#654321',
			countsDown: false,
			shareDefault: false,
		});

		const shown = mk(meId, { title: 'C2 shown', date: '2026-12-02', type: shownType.key });
		const secret = mk(meId, {
			title: 'C2 private',
			date: '2026-12-03',
			type: shownType.key,
			private: true,
		});
		const untyped = mk(meId, { title: 'C2 untyped', date: '2026-12-05' });
		mk(meId, { title: 'C2 hidden plain', date: '2026-12-04', type: hiddenType.key });
		mk(meId, {
			title: 'C2 hidden repeat',
			date: '2026-12-01',
			type: hiddenType.key,
			rrule: 'FREQ=DAILY;COUNT=3',
		});

		usersRepo.setPrefs(meId, { hiddenTypes: [hiddenType.key] });
		const withHidden = agenda(meNow(), FROM, TO);
		expect(withHidden.items.map((i) => i.title).sort()).toEqual(
			['C2 shown', 'C2 private', 'C2 untyped'].sort(),
		);
		// the private flag and the type key survive the query untouched
		const secretDto = withHidden.items.find((i) => i.id === secret.id);
		expect(secretDto?.private).toBe(true);
		expect(secretDto?.type).toBe(shownType.key);
		const shownDto = withHidden.items.find((i) => i.id === shown.id);
		expect(shownDto?.private).toBe(false);
		expect(shownDto?.type).toBe(shownType.key);

		// untyped items count as 'None' (the native rule)
		usersRepo.setPrefs(meId, { hiddenTypes: [hiddenType.key, 'None'] });
		const withNone = agenda(meNow(), FROM, TO);
		expect(withNone.items.map((i) => i.title).sort()).toEqual(['C2 shown', 'C2 private'].sort());
		expect(withNone.items.some((i) => i.id === untyped.id)).toBe(false);
		// a private item of a visible type stays
		expect(withNone.items.some((i) => i.id === secret.id)).toBe(true);
	});
});

describe('C4 equals getCalendar with shared off', () => {
	it('C4 deep-equals getCalendar(me, from, to, { shared: false }) for an overnight block crossing a range edge', () => {
		const overnight = mkBlock('C4 overnight', '2026-11-30', '23:00', '2026-12-01', '01:00');
		const cutoff = Date.parse(localToUtc(FROM, '00:00', TZ));

		const a = agenda(meNow(), FROM, TO);
		const g = getCalendar(meNow(), FROM, TO, { shared: false });

		// not vacuous: the block really starts before the range and is kept by the ±1 day padding
		expect(a.blocks.map((b) => b.id)).toEqual([overnight.id]);
		expect(Date.parse(a.blocks[0]!.startAt)).toBeLessThan(cutoff);
		expect(a).toEqual(g);
	});

	it('C4 deep-equals getCalendar(me, from, to, { shared: false }) for an id@date repeat occurrence', () => {
		const repeat = mk(meId, {
			title: 'C4 repeat',
			date: '2026-12-01',
			rrule: 'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4', // 12-01, 12-03 in range; 12-08 outside
		});

		const a = agenda(meNow(), FROM, TO);
		const g = getCalendar(meNow(), FROM, TO, { shared: false });

		// not vacuous: the expanded occurrences are there, keyed id@date
		expect(a.items.map((i) => i.id)).toEqual([`${repeat.id}@2026-12-01`, `${repeat.id}@2026-12-03`]);
		expect(a.items.every((i) => i.seriesId === repeat.id && i.rrule === repeat.rrule)).toBe(true);
		expect(a).toEqual(g);
	});

	it('C4 deep-equals getCalendar(me, from, to, { shared: false }) for an all-day item', () => {
		const allDay = mk(meId, { title: 'C4 all day', date: '2026-12-03' });

		const a = agenda(meNow(), FROM, TO);
		const g = getCalendar(meNow(), FROM, TO, { shared: false });

		// not vacuous: date set, no time, endDate null
		expect(a.items).toHaveLength(1);
		expect(a.items[0]).toMatchObject({ id: allDay.id, date: '2026-12-03', time: null, endDate: null });
		expect(a).toEqual(g);
	});
});

describe('C5 read-only', () => {
	it('C5 writes nothing: no rows change, no journal entry, no reminder recalculation, and two calls return the same result', () => {
		const timed = mk(meId, { title: 'C5 timed', date: '2026-12-04', time: '09:00' });
		mkBlock('C5 block', '2026-12-02', '10:00', '2026-12-02', '11:00');
		const reminder = reminders.add(meId, 'planner_item', timed.id, {
			at: new Date(Date.now() + 3_600_000).toISOString(),
		});
		expect(reminder.id).toMatch(/^rem/);

		const snap = () => {
			const sql = handle().sqlite;
			return {
				items: sql.prepare('SELECT * FROM items ORDER BY id').all(),
				blocks: sql.prepare('SELECT * FROM blocks ORDER BY id').all(),
				reminders: sql.prepare('SELECT * FROM reminders ORDER BY id').all(),
				undo: sql.prepare('SELECT * FROM undo_actions ORDER BY id').all(),
				users: sql.prepare('SELECT * FROM users ORDER BY id').all(),
			};
		};

		const before = snap();
		const first = agenda(meNow(), FROM, TO);
		const second = agenda(meNow(), FROM, TO);

		expect(first).toEqual(second);
		expect(first.items).toHaveLength(1);
		expect(snap()).toEqual(before);
	});
});

describe('C6 range validation', () => {
	it("C6 rejects a bad date, span <= 0 and span > 62 with getCalendar's 400 and accepts 62", () => {
		const cases: [string, string, string][] = [
			['2026-12-32', TO, 'from/to must be YYYY-MM-DD'],
			[TO, TO, 'range 1..62 days'],
			[TO, FROM, 'range 1..62 days'], // negative span
			[FROM, addDays(FROM, 63), 'range 1..62 days'],
		];
		for (const [from, to, message] of cases) {
			const mine = failOf(() => agenda(meNow(), from, to));
			const same = failOf(() => getCalendar(meNow(), from, to, { shared: false }));
			expect(mine).toBeInstanceOf(ApiFail);
			expect(mine?.status).toBe(400);
			expect(same?.status).toBe(400);
			// same 400 as getCalendar: code and message match
			expect([mine?.status, mine?.code, mine?.message]).toEqual([same?.status, same?.code, same?.message]);
			expect(mine?.message).toBe(message);
		}

		// the cap boundary itself is allowed: 62 days is a valid span
		expect(failOf(() => agenda(meNow(), FROM, addDays(FROM, 62)))).toBeNull();
		expect(failOf(() => getCalendar(meNow(), FROM, addDays(FROM, 62), { shared: false }))).toBeNull();
	});
});

describe('C7 repeats, hidden types and other users', () => {
	it("C7 shows a repeat once per occurrence inside the range only, drops a hidden type's items, and never shows another user's calendar even with overlap on", () => {
		const repeat = mk(meId, {
			title: 'C7 repeat',
			date: '2026-11-29',
			rrule: 'FREQ=DAILY;COUNT=5', // 11-29 .. 12-03; in range: 12-01, 12-02, 12-03
		});
		const ended = mk(meId, {
			title: 'C7 ended',
			date: '2026-11-01',
			rrule: 'FREQ=DAILY;COUNT=3', // all outside the range
		});
		const hiddenType = itemTypes.create(meId, {
			name: 'C7 hidden',
			bg: '#ABCDEF',
			countsDown: false,
			shareDefault: false,
		});
		const hidden = mk(meId, { title: 'C7 hidden item', date: '2026-12-02', type: hiddenType.key });
		const hiddenRepeat = mk(meId, {
			title: 'C7 hidden repeat',
			date: '2026-12-01',
			type: hiddenType.key,
			rrule: 'FREQ=DAILY;COUNT=2',
		});
		usersRepo.setPrefs(meId, { hiddenTypes: [hiddenType.key], overlapOn: true });

		// a real grant from the other user, with overlap explicitly on
		const code = sharekeys.create(otherId, { types: ['None'], hiddenAs: 'none', expiry: '24h' }).code;
		expect(sharekeys.redeem(meId, code).ok).toBe(true);
		const grant = grants.received(meId)[0]!;
		expect(grants.setInOverlap(meId, grant.id, true)).toBe(true);
		const theirs = mk(otherId, { title: "C7 other's item", date: '2026-12-03' });

		const a = agenda(meNow(), FROM, TO);
		expect(a.items.filter((i) => i.seriesId === repeat.id).map((i) => i.occurrenceDate)).toEqual([
			'2026-12-01',
			'2026-12-02',
			'2026-12-03',
		]);
		expect(a.items.some((i) => i.seriesId === ended.id || i.id === ended.id)).toBe(false);
		expect(a.items.some((i) => i.id === hidden.id)).toBe(false);
		expect(a.items.some((i) => i.seriesId === hiddenRepeat.id)).toBe(false);

		// overlap really is on: getCalendar shows the shared row, agenda never does
		const g = getCalendar(meNow(), FROM, TO);
		expect(g.items.some((i) => i.id === theirs.id && i.theirs === true)).toBe(true);
		expect(a.items.some((i) => i.id === theirs.id || i.theirs)).toBe(false);
	});
});
