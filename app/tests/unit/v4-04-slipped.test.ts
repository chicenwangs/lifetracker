// Card 04: C1 the slipped query (states, dates, one-offs, cap + total), C2 what it never shows
// (done/today/steps/repeats/trash/shared/hidden types), C5 the bulk move = all N in one undo batch.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as calendarsRepo from '../../src/lib/server/repo/calendars';
import { undo, undoable } from '../../src/lib/server/undo';
import { addDays, nowUtcIso } from '../../src/lib/time';

const TODAY = '2026-11-27';
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
	items.create(me, items.itemCreateSchema.parse({ title: 'Slipped', date: '2026-11-20', ...over }));
const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);

describe('C1 the slipped query', () => {
	it('returns { items, total }: todo/doing top-level one-offs before today, newest date first', () => {
		const old = mk({ title: 'older', date: '2026-11-10', time: '09:00' });
		const newer = mk({ title: 'newer', date: '2026-11-25', status: 'doing' });
		const mid = mk({ title: 'mid', date: '2026-11-18' });
		const r = items.slipped(me, TODAY);
		expect(r.total).toBe(3);
		expect(ids(r)).toEqual([newer.id, mid.id, old.id]); // newest date first
		expect(r.items.find((i) => i.id === old.id)).toMatchObject({
			title: 'older',
			time: '09:00',
			status: 'todo',
		});
	});

	it('uses COALESCE(end_date, date): a span whose end is still before today has slipped', () => {
		const span = mk({ title: 'span', date: '2026-11-24', endDate: '2026-11-26' });
		const ending = mk({ title: 'ends today', date: '2026-11-25', endDate: TODAY });
		expect(ids(items.slipped(me, TODAY))).toEqual([span.id]); // the one ending today is not overdue yet
		expect(items.slipped(me, TODAY).items[0]).toMatchObject({ date: '2026-11-24', endDate: '2026-11-26' });
		expect(ending.date).toBe('2026-11-25');
	});

	it('caps items at 50 but total counts every matching row', () => {
		const made = Array.from({ length: 51 }, (_, i) => mk({ title: `m${i}`, date: addDays('2026-01-01', i) }));
		const r = items.slipped(me, TODAY);
		expect(r.total).toBe(51);
		expect(r.items).toHaveLength(50);
		expect(r.items[0]?.date).toBe('2026-02-20'); // newest first, the oldest row is the one left out
		expect(ids(r)).not.toContain(made[0]?.id);
	});

	it('C2 leaves out done items, today and later, steps, repeats and trashed rows', () => {
		const kept = mk({ title: 'kept', date: '2026-11-20' });
		mk({ title: 'done', date: '2026-11-20', status: 'done' });
		mk({ title: 'today', date: TODAY });
		mk({ title: 'future', date: '2026-11-28' });
		mk({ title: 'step', date: '2026-11-20', parentId: kept.id });
		mk({ title: 'repeat', date: '2026-11-20', rrule: 'FREQ=DAILY;COUNT=5' });
		const trashed = mk({ title: 'trashed', date: '2026-11-20' });
		items.softDelete(me, trashed.id);
		mk({ title: 'undated', date: null });
		expect(items.slipped(me, TODAY).items.map((i) => i.title)).toEqual(['kept']);
		expect(ids(items.slipped(me, TODAY))).toEqual([kept.id]);
		expect(items.slipped(me, TODAY).total).toBe(1);
	});

	it("C2 respects hidden_types (untyped counts as 'None', D-V4-05)", () => {
		mk({ title: 'work', date: '2026-11-20', type: 'Work' });
		const untyped = mk({ title: 'no type', date: '2026-11-21' });
		const hobby = mk({ title: 'hobby', date: '2026-11-22', type: 'Hobby' });
		usersRepo.setPrefs(me, { hiddenTypes: ['Work'] });
		expect(ids(items.slipped(me, TODAY))).toEqual([hobby.id, untyped.id]);
		usersRepo.setPrefs(me, { hiddenTypes: ['Work', 'None'] });
		expect(ids(items.slipped(me, TODAY))).toEqual([hobby.id]);
		usersRepo.setPrefs(me, { hiddenTypes: [] });
		expect(items.slipped(me, TODAY).total).toBe(3);
	});

	it("C2/C11 own calendars only: another account's item never shows, shared with me or not", () => {
		const mine = mk({ title: 'mine', date: '2026-11-20' });
		const partner = usersRepo.createWithCalendar({
			username: 'partner',
			displayName: 'P',
			passwordHash: 'x',
			role: 'member',
		});
		const theirs = items.create(
			partner.id,
			items.itemCreateSchema.parse({ title: 'theirs', date: '2026-11-19' }),
		);
		// a live grant: their calendar is shared with me
		handle()
			.sqlite.prepare(
				`INSERT INTO grants (id, calendar_id, grantee_id, permission, visible_types, hidden_as, in_overlap, created_at)
				 VALUES (?, ?, ?, 'view', '[]', 'busy', 1, ?)`,
			)
			.run('grt_test', calendarsRepo.defaultFor(partner.id).id, me, nowUtcIso());
		expect(ids(items.slipped(me, TODAY))).toEqual([mine.id]);
		expect(items.slipped(me, TODAY).items[0]?.title).toBe('mine');
		expect(items.slipped(partner.id, TODAY).items.map((i) => i.title)).toEqual(['theirs']);
		expect(ids(items.slipped(me, TODAY))).not.toContain(theirs.id);
	});
});

describe('C5 Move all to today', () => {
	it('moves every matching row in one undo batch: time kept, a span moved, Undo restores every date', () => {
		const timed = mk({ title: 'timed', date: '2026-11-20', time: '09:30' });
		const span = mk({ title: 'span', date: '2026-11-18', endDate: '2026-11-21' });
		const plain = mk({ title: 'plain', date: '2026-11-10' });
		const later = mk({ title: 'later', date: '2026-12-02' }); // not slipped: untouched
		const done = mk({ title: 'done', date: '2026-11-10', status: 'done' });
		const targets = items.slippedRows(me, TODAY).map((r) => ({ t: 'items' as const, id: r.id }));
		expect(targets).toHaveLength(3);
		const r = undoable(me, 'Move slipped items to today', targets, () => ({
			result: items.moveSlipped(me, TODAY),
		}));
		expect(r.result).toBe(3); // all N, one batch
		expect(items.mustOwn(me, timed.id)).toMatchObject({ date: TODAY, time: '09:30', endDate: null });
		expect(items.mustOwn(me, span.id)).toMatchObject({ date: TODAY, endDate: addDays(TODAY, 3) });
		expect(items.mustOwn(me, plain.id).date).toBe(TODAY);
		expect(items.mustOwn(me, later.id).date).toBe('2026-12-02');
		expect(items.mustOwn(me, done.id).date).toBe('2026-11-10');

		undo(me, r.undo.id); // one entry restores every old date
		expect(items.mustOwn(me, timed.id).date).toBe('2026-11-20');
		expect(items.mustOwn(me, span.id)).toMatchObject({ date: '2026-11-18', endDate: '2026-11-21' });
		expect(items.mustOwn(me, plain.id).date).toBe('2026-11-10');
		expect(items.slipped(me, TODAY).total).toBe(3);
	});

	it('moves more than the 50 shown: the bulk move is not capped', () => {
		Array.from({ length: 55 }, (_, i) => mk({ title: `b${i}`, date: addDays('2026-01-01', i) }));
		const shown = items.slipped(me, TODAY);
		expect(shown.items).toHaveLength(50);
		expect(shown.total).toBe(55);
		const targets = items.slippedRows(me, TODAY).map((r) => ({ t: 'items' as const, id: r.id }));
		const r = undoable(me, 'Move slipped items to today', targets, () => ({
			result: items.moveSlipped(me, TODAY),
		}));
		expect(r.result).toBe(55);
		expect(items.slipped(me, TODAY).total).toBe(0); // nothing left past today
	});
});
