import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import { ApiFail } from '../../src/lib/server/http';
import { purgeTrash } from '../../src/lib/server/purge';

let me: string;
let other: string;
beforeEach(() => {
	freshDb();
	me = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	}).id;
	other = usersRepo.createWithCalendar({
		username: 'neina',
		displayName: 'N',
		passwordHash: 'x',
		role: 'member',
	}).id;
});
const mk = (over = {}) =>
	items.create(
		me,
		items.itemCreateSchema.parse({ title: 'DS Quiz', type: 'Exam', date: '2026-11-13', ...over }),
	);

describe('cycle', () => {
	it('todo -> doing -> done -> todo with stamps', () => {
		const i = mk();
		const a = items.cycle(me, i.id);
		expect(a.status).toBe('doing');
		expect(a.startedAt).toBeTruthy();
		expect(a.completedAt).toBeNull();
		const b = items.cycle(me, i.id);
		expect(b.status).toBe('done');
		expect(b.completedAt).toBeTruthy();
		const c = items.cycle(me, i.id);
		expect(c.status).toBe('todo');
		expect(c.startedAt).toBeNull();
		expect(c.completedAt).toBeNull();
	});
});

describe('scoping', () => {
	it('other user gets 404 on my item + block', () => {
		const i = mk();
		const b = blocks.create(me, { startAt: '2026-11-06T05:00:00Z', itemId: i.id, type: null });
		expect(() => items.cycle(other, i.id)).toThrow(ApiFail);
		expect(() => items.patch(other, i.id, { title: 'x' })).toThrow(/Not found/);
		expect(() => blocks.patch(other, b.id, { label: 'x' })).toThrow(/Not found/);
		expect(() => blocks.create(other, { startAt: '2026-11-06T05:00:00Z', itemId: i.id, type: null })).toThrow(
			/Not found/,
		);
	});
});

describe('patch', () => {
	it('move date keeps time + span', () => {
		const i = mk({ time: '14:00', endDate: '2026-11-15' });
		const m = items.patch(me, i.id, { date: '2026-11-20' });
		expect(m).toMatchObject({ date: '2026-11-20', time: '14:00', endDate: '2026-11-22' });
	});
	it('bad end date rejected', () => {
		const i = mk();
		expect(() => items.patch(me, i.id, { endDate: '2026-11-01' })).toThrow(/end date before/);
	});
});

describe('soft delete', () => {
	it('deletes steps + blocks together, restore brings back', () => {
		const p = mk();
		const s = mk({ title: 'step 1', parentId: p.id });
		const b = blocks.create(me, { startAt: '2026-11-06T05:00:00Z', itemId: s.id, type: null });
		const { batch } = items.softDelete(me, p.id);
		expect(items.getOwn(me, s.id)).toBeUndefined();
		expect(blocks.getOwn(me, b.id)).toBeUndefined();
		expect(items.trash(me)).toHaveLength(2);
		items.restore(me, batch);
		expect(items.getOwn(me, s.id)).toBeDefined();
		expect(blocks.getOwn(me, b.id)).toBeDefined();
	});

	it('step restored without its deleted parent becomes a normal item', () => {
		const p = mk();
		const s = mk({ title: 'step 1', parentId: p.id });
		const { batch } = items.softDelete(me, s.id);
		items.softDelete(me, p.id);
		items.restore(me, batch);
		expect(items.getOwn(me, s.id)?.parentId).toBeNull();
	});

	it('purge relabels a surviving block of a purged secret item', () => {
		const p = mk({ title: 'Therapy', private: true });
		const b = blocks.create(me, { startAt: '2026-11-06T05:00:00Z', itemId: p.id, type: null });
		const { batch } = blocks.softDelete(me, b.id);
		items.softDelete(me, p.id);
		items.restore(me, batch);
		purgeTrash(Date.now() + 31 * 86_400_000);
		expect(blocks.getOwn(me, b.id)).toMatchObject({ itemId: null, label: 'Block' });
	});
});

describe('blocks', () => {
	it('linked block takes item title, 60 min default, min 15', () => {
		const i = mk();
		const b = blocks.create(me, { startAt: '2026-11-06T05:00:00Z', itemId: i.id, type: null });
		expect(b).toMatchObject({ label: 'DS Quiz', endAt: '2026-11-06T06:00:00Z' });
		expect(() => blocks.patch(me, b.id, { endAt: '2026-11-06T05:10:00Z' })).toThrow(/min 15/);
		const night = blocks.create(me, {
			label: 'Sleep',
			startAt: '2026-11-06T15:00:00Z',
			endAt: '2026-11-06T22:00:00Z',
			itemId: null,
			type: null,
		});
		expect(
			blocks.inRange(night.calendarId, '2026-11-06T16:00:00Z', '2026-11-07T16:00:00Z').map((x) => x.id),
		).toContain(night.id);
	});
});
