// Card 10 (O-1 items 2–3, D-V4-11, D-V4-28): the per-type "Month calendar" flag (item_types.on_calendar).
// Item types are per user; the flag hides only my own items, only on the Month surfaces. Blocks keep their dots.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as itemTypes from '../../src/lib/server/repo/itemtypes';
import * as items from '../../src/lib/server/repo/items';
import * as sharekeys from '../../src/lib/server/repo/sharekeys';
import { undo } from '../../src/lib/server/undo';
import { BUILTIN_TYPES, defaultTypes, monthHidden } from '../../src/lib/itemtypes';
import { initTypes, shown, shownOnMonth } from '../../src/lib/client/itemtypes.svelte';
import type { BlockDTO, ItemDTO, ItemTypeDTO } from '../../src/lib/types';

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
	initTypes(itemTypes.list(me), []);
});
const keyOf = (key: string) => itemTypes.list(me).find((t) => t.key === key)!;
const setOff = (key: string, onCalendar: boolean) =>
	itemTypes.patch(me, keyOf(key).id, itemTypes.patchSchema.parse({ onCalendar }));
const item = (id: string, type: string | null, extra: Partial<ItemDTO> = {}): ItemDTO => ({
	id,
	title: id,
	type,
	status: 'todo',
	date: '2026-11-20',
	time: null,
	endDate: null,
	parentId: null,
	private: false,
	stepsDone: 0,
	stepsTotal: 0,
	editable: true,
	...extra,
});

describe('on_calendar type flag', () => {
	it('C1 built-ins, client fallback and a fresh account all start on (migration default 1)', () => {
		expect(BUILTIN_TYPES.every((t) => t.onCalendar === true)).toBe(true);
		expect(defaultTypes().every((t) => t.onCalendar === true)).toBe(true);
		expect(itemTypes.list(me).every((t) => t.onCalendar === true)).toBe(true);
		// a new custom type is on too, and PATCH returns the stored value
		const t = itemTypes.create(me, itemTypes.createSchema.parse({ name: 'Class', bg: '#3D5A80' }));
		expect(t.onCalendar).toBe(true);
		expect(setOff('Work', false).onCalendar).toBe(false);
		expect(itemTypes.list(me).find((x) => x.key === 'Work')?.onCalendar).toBe(false);
	});

	it('C1 PATCH takes { onCalendar } beside the existing fields; strict and boolean only', () => {
		expect(() => itemTypes.patchSchema.parse({ onCalendar: 'no' })).toThrow();
		expect(() => itemTypes.patchSchema.parse({ onCalendar: 1 })).toThrow();
		expect(() => itemTypes.patchSchema.parse({ onCalendar: false, colour: '#fff' })).toThrow();
		const t = itemTypes.patch(
			me,
			keyOf('Work').id,
			itemTypes.patchSchema.parse({ name: 'Job', onCalendar: false }),
		);
		expect([t.name, t.onCalendar]).toEqual(['Job', false]); // both fields in one PATCH
	});

	it('C4/C6 my item of an off type is hidden while hiddenTypes is empty; theirs, No type and other types stay', () => {
		setOff('Work', false);
		initTypes(itemTypes.list(me), []); // the type bar hides nothing: this filter is its own rule
		const mine = item('mine', 'Work');
		const theirs = item('theirs', 'Work', { theirs: true });
		const party = item('party', 'Event');
		const none = item('none', null);
		expect(shownOnMonth([mine, theirs, party, none]).map((i) => i.id)).toEqual(['theirs', 'party', 'none']);
		expect(shown([mine]).length).toBe(1); // the old helper is not the template
		// an off type of a partner's custom key is not mine either
		expect(shownOnMonth([item('x', keyOf('Work').key, { theirs: true })]).length).toBe(1);
	});

	it('C4 a month cell keeps every block, even one whose type is off', () => {
		setOff('Work', false);
		initTypes(itemTypes.list(me), []);
		const cell = (list: ItemDTO[], blocks: BlockDTO[]) => [
			...shownOnMonth(shown(list)).filter((i) => i.date === '2026-11-20'),
			...shown(blocks).filter((b) => b.startAt.startsWith('2026-11-20')),
		];
		const block: BlockDTO = {
			id: 'b1',
			label: 'class',
			type: 'Work',
			startAt: '2026-11-20T09:00:00Z',
			endAt: '2026-11-20T10:00:00Z',
			status: 'todo',
			itemId: null,
			itemType: null,
			editable: true,
		};
		expect(cell([item('mine', 'Work')], [block]).map((x) => x.id)).toEqual(['b1']);
	});

	it('C7 no hidden counter: a day whose only item is hidden is an empty cell', () => {
		setOff('Work', false);
		initTypes(itemTypes.list(me), []);
		expect(shownOnMonth([item('mine', 'Work')])).toEqual([]);
		// the flag set empty = untouched (no copy, no new array work)
		setOff('Work', true);
		initTypes(itemTypes.list(me), []);
		const all = [item('mine', 'Work')];
		expect(shownOnMonth(all)).toBe(all);
	});

	it('C7 only an explicit false is off: a stale payload without the field keeps every item', () => {
		// e.g. a cached DTO from before migration 0011: missing must mean "on", never "hide everything"
		const stale = defaultTypes().map((t) => {
			const c: Partial<ItemTypeDTO> = { ...t };
			delete c.onCalendar;
			return c as ItemTypeDTO;
		});
		initTypes(stale, []);
		const all = [item('mine', 'Work'), item('other', 'Event')];
		expect(shownOnMonth(all)).toBe(all);
		// the shared pure rule says the same
		expect(monthHidden(all, stale)).toBe(all);
		expect(
			monthHidden(
				all,
				defaultTypes().map((t) => ({ ...t, onCalendar: false })),
			),
		).toEqual([]);
	});

	it('C8 round trip writes only the flag; the item, name, colour, slug and use count stay', () => {
		const before = keyOf('Work');
		const row = items.create(
			me,
			items.itemCreateSchema.parse({ title: 'standup', type: 'Work', date: '2026-11-20' }),
		);
		const used = itemTypes.listWithUse(me).find((t) => t.key === 'Work')?.used;
		setOff('Work', false);
		initTypes(itemTypes.list(me), []);
		expect(shownOnMonth([item(row.id, 'Work')]).length).toBe(0);
		setOff('Work', true);
		initTypes(itemTypes.list(me), []);
		expect(shownOnMonth([item(row.id, 'Work')]).length).toBe(1);
		expect(items.getOwn(me, row.id)?.type).toBe('Work');
		const after = keyOf('Work');
		expect([after.name, after.bg, after.ink, after.slug]).toEqual([
			before.name,
			before.bg,
			before.ink,
			before.slug,
		]);
		expect(itemTypes.listWithUse(me).find((t) => t.key === 'Work')?.used).toBe(used);
	});

	it('C10 the switch is not journalled: no undo entry, the switch itself is the reversal', () => {
		setOff('Work', false);
		expect(() => undo(me)).toThrow(/Nothing to undo/);
	});

	it('C12 PATCH is scoped by own(): another user’s type id is 404 and their flag stays on', () => {
		const theirs = itemTypes.list(other).find((t) => t.key === 'Work')!;
		expect(() => itemTypes.patch(me, theirs.id, { onCalendar: false })).toThrow(/Not found/);
		expect(itemTypes.list(other).find((t) => t.key === 'Work')?.onCalendar).toBe(true);
	});

	it('C12 a partner share never sees the flag change: their own grid is their own types', () => {
		setOff('Work', false);
		// sharing is by type key; the flag is read from the viewer's own types, never the owner's
		expect(sharekeys.create(me, { types: ['Work'], hiddenAs: 'busy', expiry: '7d' }).code).toMatch(/^LT-/);
		const shared = item('shared', 'Work', { theirs: true });
		initTypes(itemTypes.list(other), []); // the partner's types are all on
		expect(shownOnMonth([shared]).length).toBe(1);
	});
});
