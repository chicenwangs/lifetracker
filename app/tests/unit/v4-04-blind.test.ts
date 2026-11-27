// Blind tests for card 04, from its Done-when lines only: C1 (the query), C2 (what it excludes)
// and C5 (the one-batch bulk move). No builder test was opened.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as itemTypes from '../../src/lib/server/repo/itemtypes';
import * as sharekeys from '../../src/lib/server/repo/sharekeys';
import { undo, undoable } from '../../src/lib/server/undo';
import { addDays } from '../../src/lib/time';

const TODAY = '2026-11-27'; // a Friday; fixed so the fixtures never depend on the wall clock
let me: string;
let other: string;

beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	me = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	}).id;
	other = usersRepo.createWithCalendar({
		username: 'partner',
		displayName: 'P',
		passwordHash: 'x',
		role: 'member',
	}).id;
});

const mk = (over: Record<string, unknown> = {}) =>
	items.create(me, items.itemCreateSchema.parse({ title: 'Blind 04 item', ...over }));

describe('C1 slipped query', () => {
	it('C1 keeps only live top-level own one-off items before today (todo/doing), newest first, capped at 50 with the true total', () => {
		const a = mk({ title: 'C1 yesterday', date: '2026-11-26' });
		const doing = mk({ title: 'C1 doing', date: '2026-11-25', status: 'doing' });
		const parent = mk({ title: 'C1 parent', date: '2026-11-23' });
		const ended = mk({ title: 'C1 ended', date: '2026-11-10', endDate: '2026-11-20' });
		const untyped = mk({ title: 'C1 untyped', date: '2026-11-19' });

		// excluded by each clause
		mk({ title: 'C1 spanning today', date: '2026-11-20', endDate: '2026-11-28' }); // COALESCE(end,date) >= today
		mk({ title: 'C1 today', date: TODAY });
		mk({ title: 'C1 future', date: '2026-12-01' });
		mk({ title: 'C1 done', date: '2026-11-24', status: 'done' });
		mk({ title: 'C1 repeat', date: '2026-11-01', rrule: 'FREQ=DAILY;COUNT=3' });
		mk({ title: 'C1 step', date: '2026-11-22', parentId: parent.id });
		const gone = mk({ title: 'C1 gone', date: '2026-11-21' });
		items.softDelete(me, gone.id);
		items.create(other, items.itemCreateSchema.parse({ title: 'C1 other', date: '2026-11-24' }));

		const small = items.slipped(me, TODAY);
		expect(small.total).toBe(5);
		expect(small.items.map((i) => i.title)).toEqual([
			'C1 yesterday',
			'C1 doing',
			'C1 parent',
			'C1 untyped',
			'C1 ended',
		]);
		expect(small.items.map((i) => i.id)).toEqual([a.id, doing.id, parent.id, untyped.id, ended.id]);

		// 55 more matching rows: items = the 50 newest, total = every matching row
		for (let i = 0; i < 55; i++) mk({ title: `C1 bulk ${i}`, date: addDays(TODAY, -(i + 1)) });
		const big = items.slipped(me, TODAY);
		expect(big.total).toBe(60);
		expect(big.items).toHaveLength(50);
		expect(big.items[0]?.date).toBe('2026-11-26');
		// newest date first
		const dates = big.items.map((i) => i.date ?? '');
		expect(dates).toEqual([...dates].sort((x, y) => (x < y ? 1 : x > y ? -1 : 0)));
		// the cap is the shown rows, not the reported total
		expect(big.items.length).toBeLessThan(big.total);
	});
});

describe('C2 slipped exclusions', () => {
	it('C2 excludes done, today/later, steps, repeats, trashed, shared-calendar rows and hidden types (untyped = None)', () => {
		const shownType = itemTypes.create(me, {
			name: 'Blind shown',
			bg: '#AABBCC',
			countsDown: false,
			shareDefault: false,
		});
		const hiddenType = itemTypes.create(me, {
			name: 'Blind hidden',
			bg: '#CCBBAA',
			countsDown: false,
			shareDefault: false,
		});
		const kept = mk({ title: 'C2 kept', date: '2026-11-26', type: shownType.key });
		const parent = mk({ title: 'C2 parent', date: '2026-11-25' });

		mk({ title: 'C2 done', date: '2026-11-26', status: 'done' });
		mk({ title: 'C2 today', date: TODAY });
		mk({ title: 'C2 future', date: '2026-11-28' });
		mk({ title: 'C2 step', date: '2026-11-24', parentId: parent.id });
		mk({ title: 'C2 repeat', date: '2026-11-02', rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4' });
		const trash = mk({ title: 'C2 trashed', date: '2026-11-23' });
		items.softDelete(me, trash.id);
		mk({ title: 'C2 untyped', date: '2026-11-22' });
		mk({ title: 'C2 hidden typed', date: '2026-11-21', type: hiddenType.key });

		// a calendar someone shared with me: a real grant, then an item on the owner's calendar
		const code = sharekeys.create(other, { types: ['None'], hiddenAs: 'none', expiry: '24h' }).code;
		const redeemed = sharekeys.redeem(me, code);
		expect(redeemed.ok).toBe(true);
		items.create(other, items.itemCreateSchema.parse({ title: 'C2 shared', date: '2026-11-20' }));

		const before = items.slipped(me, TODAY);
		expect(before.items.map((i) => i.title).sort()).toEqual([
			'C2 hidden typed',
			'C2 kept',
			'C2 parent',
			'C2 untyped',
		]);

		// D-V4-05: hidden types hide my own rows; untyped counts as 'None'
		usersRepo.setPrefs(me, { hiddenTypes: [hiddenType.key, 'None'] });
		const after = items.slipped(me, TODAY);
		expect(after.total).toBe(1);
		expect(after.items.map((i) => i.id)).toEqual([kept.id]);
	});
});

describe('C5 bulk move', () => {
	it('C5 moves every matching row (not just the 50 shown) in one undo batch, keeping time and span; one Undo restores every old date', () => {
		const soon = addDays(TODAY, -2);
		const spanFrom = addDays(TODAY, -5);
		const spanTo = addDays(TODAY, -3);
		const timed = mk({ title: 'C5 timed', date: soon, time: '09:15' });
		const span = mk({ title: 'C5 span', date: spanFrom, endDate: spanTo });
		const bulk: ReturnType<typeof mk>[] = [];
		for (let i = 0; i < 50; i++) bulk.push(mk({ title: `C5 bulk ${i}`, date: addDays(TODAY, -(10 + i)) }));

		const shown = items.slipped(me, TODAY);
		expect(shown.total).toBe(52);
		expect(shown.items).toHaveLength(50); // the strip shows 50; the move must take all 52

		const rows = items.slippedRows(me, TODAY);
		expect(rows).toHaveLength(52);
		const before = new Map(rows.map((r) => [r.id, { date: r.date, endDate: r.endDate, time: r.time }]));
		const n = handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number };

		const batch = undoable(
			me,
			'Move slipped items to today',
			rows.map((r) => ({ t: 'items' as const, id: r.id })),
			() => ({ result: items.moveSlipped(me, TODAY) }),
		);
		expect(batch.result).toBe(52);
		// one batch = one journal row, whatever N is
		const afterRows = handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as {
			n: number;
		};
		expect(afterRows.n - n.n).toBe(1);

		// every row moved, time kept, a multi-day span moved by the same length
		expect(items.slipped(me, TODAY).total).toBe(0);
		for (const id of before.keys()) expect(items.mustOwn(me, id).date).toBe(TODAY);
		const movedTimed = items.mustOwn(me, timed.id);
		expect([movedTimed.date, movedTimed.time]).toEqual([TODAY, '09:15']);
		const movedSpan = items.mustOwn(me, span.id);
		expect([movedSpan.date, movedSpan.endDate]).toEqual([TODAY, addDays(TODAY, 2)]);
		const movedBulk = items.mustOwn(me, bulk[49]!.id);
		expect(movedBulk.date).toBe(TODAY);

		// one Undo restores every old date
		expect(undo(me).label).toBe('Move slipped items to today');
		for (const r of items.slippedRows(me, TODAY)) expect(before.has(r.id)).toBe(true);
		for (const [id, old] of before) {
			const back = items.mustOwn(me, id);
			expect([back.date, back.endDate, back.time]).toEqual([old.date, old.endDate, old.time]);
		}
		expect(items.slipped(me, TODAY).total).toBe(52);
	});
});
