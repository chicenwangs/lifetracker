// v3.2 PR 4: the Slipped list — one-off, top-level, last day behind today; Move all to today = one undo batch.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import { undo, undoable } from '../../src/lib/server/undo';

const TODAY = '2030-05-20';
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
const mk = (over = {}) =>
	items.create(me, items.itemCreateSchema.parse({ title: 'Slip', date: '2030-05-01', ...over }));
const titles = (r: { items: { title: string }[] }) => r.items.map((i) => i.title);

describe('slipped()', () => {
	it('one-off, top-level, not done, last day behind today; newest first', () => {
		mk({ title: 'old', date: '2030-05-01' });
		mk({ title: 'recent', date: '2030-05-19' });
		mk({ title: 'today', date: TODAY }); // its last day is not behind today
		mk({ title: 'future', date: '2030-06-01' });
		mk({ title: 'done', date: '2030-05-02', status: 'done' });
		mk({ title: 'repeat', date: '2030-05-02', rrule: 'FREQ=DAILY;COUNT=3' });
		mk({ title: 'span-now', date: '2030-05-18', endDate: '2030-05-25' }); // still running
		mk({ title: 'span-past', date: '2030-05-10', endDate: '2030-05-12' });
		const parent = mk({ title: 'parent', date: '2030-05-03' });
		mk({ title: 'step', date: '2030-05-04', parentId: parent.id });
		const r = items.slipped(me, TODAY);
		expect(titles(r)).toEqual(['recent', 'span-past', 'parent', 'old']);
		expect(r.more).toBe(0);
	});

	it("excludes trashed rows and other people's calendars", () => {
		const mine = mk({ title: 'mine', date: '2030-05-01' });
		const gone = mk({ title: 'gone', date: '2030-05-02' });
		items.softDelete(me, gone.id);
		const partner = usersRepo.createWithCalendar({
			username: 'partner',
			displayName: 'P',
			passwordHash: 'x',
			role: 'member',
		}).id;
		items.create(partner, items.itemCreateSchema.parse({ title: 'theirs', date: '2030-05-01' })); // prettier-ignore
		expect(titles(items.slipped(me, TODAY))).toEqual(['mine']);
		expect(items.slipped(me, TODAY).items[0]?.id).toBe(mine.id);
	});

	it('caps at 50 and reports the rest as "more"', () => {
		for (let n = 0; n < 55; n++) mk({ title: `s${n}`, date: '2030-05-01' });
		const r = items.slipped(me, TODAY);
		expect(r.items).toHaveLength(50);
		expect(r.more).toBe(5);
	});
});

describe('move all to today', () => {
	it('keeps each span, moves only slipped rows, and undoes as one batch', () => {
		const a = mk({ title: 'a', date: '2030-05-01' });
		const b = mk({ title: 'b', date: '2030-05-02', endDate: '2030-05-04' });
		const future = mk({ title: 'f', date: '2030-06-01' });
		const ids = items.slippedIds(me, TODAY);
		expect(ids).toHaveLength(2);
		const r = undoable(
			me,
			`Move ${ids.length} slipped to today`,
			ids.map((id) => ({ t: 'items' as const, id })),
			() => ({ result: items.moveSlippedToToday(me, TODAY) }),
		);
		expect(r.result.moved).toBe(2);
		expect(items.mustOwn(me, a.id).date).toBe(TODAY);
		expect(items.mustOwn(me, b.id).date).toBe(TODAY);
		expect(items.mustOwn(me, b.id).endDate).toBe('2030-05-22'); // 2-day span kept
		expect(items.slipped(me, TODAY).items).toHaveLength(0); // nothing slipped any more
		// one journal entry puts every date back
		undo(me, r.undo.id);
		expect(items.mustOwn(me, a.id).date).toBe('2030-05-01');
		expect(items.mustOwn(me, b.id).date).toBe('2030-05-02');
		expect(items.mustOwn(me, b.id).endDate).toBe('2030-05-04');
		expect(items.mustOwn(me, future.id).date).toBe('2030-06-01');
	});
});
