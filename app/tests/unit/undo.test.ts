// FEATURES §3 Undo tests.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import { undo, undoable } from '../../src/lib/server/undo';
import { quickAdd } from '../../src/lib/server/quickadd-server';

let me: string;
let user: App.SafeUser;
beforeEach(() => {
	freshDb();
	const row = usersRepo.createWithCalendar({ username: 'jeremy', displayName: 'J', passwordHash: 'x', role: 'admin' });
	me = row.id;
	user = usersRepo.safe(row);
});
const mk = (title = 'Quiz') =>
	undoable(me, 'Add', [], () => {
		const r = items.create(me, items.itemCreateSchema.parse({ title, date: '2026-11-13' }));
		return { result: r, created: [{ t: 'items', id: r.id }] };
	}).result;
const patch = (id: string, p: items.ItemPatch) =>
	undoable(me, 'Move', [{ t: 'items', id }], () => ({ result: items.patch(me, id, p) }));

describe('undo journal', () => {
	it('create -> undo removes it', () => {
		const i = mk();
		undo(me);
		expect(items.getOwn(me, i.id)).toBeUndefined();
	});

	it('move -> undo restores date and time', () => {
		const i = mk();
		patch(i.id, { time: '09:00' });
		patch(i.id, { date: '2026-11-20', time: '14:00' });
		expect(undo(me).label).toBe('Move');
		expect(items.getOwn(me, i.id)).toMatchObject({ date: '2026-11-13', time: '09:00' });
	});

	it('two actions undo in reverse order', () => {
		const i = mk();
		patch(i.id, { title: 'B' });
		patch(i.id, { title: 'C' });
		undo(me);
		expect(items.getOwn(me, i.id)?.title).toBe('B');
		undo(me);
		expect(items.getOwn(me, i.id)?.title).toBe('Quiz');
	});

	it('delete item + steps + blocks -> one undo restores all, links kept', () => {
		const p = mk();
		const s = items.create(me, items.itemCreateSchema.parse({ title: 'step', parentId: p.id }));
		const b = blocks.create(me, { startAt: '2026-11-13T05:00:00Z', itemId: s.id, type: null });
		undoable(me, 'Delete', items.deleteSet(me, p.id), () => ({ result: items.softDelete(me, p.id) }));
		expect(items.getOwn(me, s.id)).toBeUndefined();
		undo(me);
		expect(items.getOwn(me, p.id)).toBeDefined();
		expect(items.getOwn(me, s.id)?.parentId).toBe(p.id);
		expect(blocks.getOwn(me, b.id)?.itemId).toBe(s.id);
	});

	it('refuses when the row changed since, and changes nothing', () => {
		const i = mk();
		patch(i.id, { title: 'B' });
		// a later change outside the journal (e.g. another device's edit in the same row)
		items.patch(me, i.id, { title: 'X' });
		expect(() => undo(me)).toThrow(/can't undo safely|Can't undo safely/i);
		expect(items.getOwn(me, i.id)?.title).toBe('X');
	});

	it('quick add /both = one undo removes item + block', () => {
		const r = quickAdd(user, 'gym tmr 6pm /both', Date.parse('2026-11-13T02:00:00Z'));
		undo(me);
		expect(items.getOwn(me, r.item?.id ?? '')).toBeUndefined();
		expect(blocks.getOwn(me, r.block?.id ?? '')).toBeUndefined();
	});

	it('only my own actions', () => {
		mk();
		const other = usersRepo.createWithCalendar({ username: 'neina', displayName: 'N', passwordHash: 'x', role: 'member' }).id;
		expect(() => undo(other)).toThrow(/Nothing to undo/);
	});
});
