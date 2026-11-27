// Blind tests for card 10 (per-type `Month calendar` flag), written from its Done-when lines only.
// No builder test was opened. In-memory DB only: the real data folder is never touched.
import { beforeEach, expect, it } from 'vitest';
import { freshDb } from './helpers';
import type { Handle } from '../../src/lib/server/db';
import { ApiFail } from '../../src/lib/server/http';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as typeRepo from '../../src/lib/server/repo/itemtypes';
import * as itemsRepo from '../../src/lib/server/repo/items';
import { BUILTIN_TYPES, defaultTypes } from '../../src/lib/itemtypes';
import { initTypes, shownOnMonth } from '../../src/lib/client/itemtypes.svelte';
import type { BlockDTO, ItemDTO, ItemTypeDTO } from '../../src/lib/types';

let h: Handle;
let me: string;
const mk = (u: string) =>
	usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;

beforeEach(() => {
	h = freshDb();
	me = mk('jeremy');
});

const typesWithWorkOff = (): ItemTypeDTO[] =>
	defaultTypes().map((t) => (t.key === 'Work' ? { ...t, onCalendar: false } : t));

const item = (over: Partial<ItemDTO>): ItemDTO => ({
	id: 'itm_x',
	title: 'Item',
	type: null,
	status: 'todo',
	date: '2026-11-27',
	time: null,
	endDate: null,
	parentId: null,
	private: false,
	stepsDone: 0,
	stepsTotal: 0,
	editable: true,
	...over,
});

const block = (over: Partial<BlockDTO>): BlockDTO => ({
	id: 'blk_x',
	label: 'Block',
	type: null,
	startAt: '2026-11-27T02:00:00Z',
	endAt: '2026-11-27T03:00:00Z',
	status: 'todo',
	itemId: null,
	itemType: null,
	editable: true,
	...over,
});

const typeRow = (t: string): ItemTypeDTO => typeRepo.listWithUse(me).find((x) => x.key === t)!;

// ---- C1 ---------------------------------------------------------------------------------------------------
it('C1 ItemTypeDTO carries onCalendar, the five built-ins and defaultTypes() are on, and the strict PATCH schema takes only a boolean', () => {
	// every built-in row and the client fallback start on (migration default 1, old behaviour)
	expect(BUILTIN_TYPES).toHaveLength(5);
	for (const t of BUILTIN_TYPES) expect(t.onCalendar, t.key).toBe(true);
	const fallback = defaultTypes();
	expect(fallback).toHaveLength(5);
	for (const t of fallback) expect(t.onCalendar, t.key).toBe(true);

	// a fresh account is seeded on too, and the list route's DTO (listWithUse) exposes the boolean
	expect(typeRepo.list(me)).toHaveLength(5);
	for (const t of typeRepo.list(me)) expect(t.onCalendar, t.key).toBe(true);
	for (const t of typeRepo.listWithUse(me)) expect(typeof t.onCalendar, t.key).toBe('boolean');

	// PATCH: onCalendar alone, and beside every other field the schema already took
	for (const p of [
		{ onCalendar: false },
		{ onCalendar: true },
		{ name: 'Renamed' },
		{ bg: '#112233' },
		{ slug: 'work2' },
		{ countsDown: true },
		{ shareDefault: true },
		{ isDefault: true as const },
		{ name: 'Renamed', bg: '#112233', slug: 'work2', countsDown: true, shareDefault: true, onCalendar: false, isDefault: true as const }, // prettier-ignore
	])
		expect(typeRepo.patchSchema.safeParse(p).success, JSON.stringify(p)).toBe(true);

	// strict + boolean: a string, a number, null and an unknown key are all refused
	for (const p of [
		{ onCalendar: 'yes' },
		{ onCalendar: 1 },
		{ onCalendar: null },
		{ on_calendar: true },
		{ onCalendar: false, junk: 1 },
	])
		expect(typeRepo.patchSchema.safeParse(p).success, JSON.stringify(p)).toBe(false);

	// the repo write returns the DTO with the flag and leaves the rest alone
	const work = typeRow('Work');
	const off = typeRepo.patch(me, work.id, { onCalendar: false });
	expect(off.id).toBe(work.id);
	expect(off.onCalendar).toBe(false);
	expect({ name: off.name, bg: off.bg, slug: off.slug }).toEqual({
		name: work.name,
		bg: work.bg,
		slug: work.slug,
	});
	expect(typeRow('Work').onCalendar).toBe(false);
});

// ---- C4 ---------------------------------------------------------------------------------------------------
it('C4 the items-only helper hides my off-type items and the month cell composition keeps a block of the same off type', () => {
	initTypes(typesWithWorkOff(), []);
	const mine = item({ id: 'itm_work', type: 'Work' });
	const other = item({ id: 'itm_event', type: 'Event' });
	const noType = item({ id: 'itm_none', type: null });

	expect(shownOnMonth([mine, other, noType]).map((i) => i.id)).toEqual(['itm_event', 'itm_none']);

	// the phone Month cell (routes/month) is items through shownOnMonth + blocks through shown;
	// a block of the same off type keeps its dot, because the block list never goes through the helper
	initTypes(typesWithWorkOff(), []);
	const workBlock = block({ id: 'blk_work', type: 'Work' });
	const things = [...shownOnMonth([mine, other]), workBlock];
	expect(things.map((t) => t.id)).toEqual(['itm_event', 'blk_work']);

	// it is the flag set that drives the filter: a type that is on is never dropped
	initTypes(defaultTypes(), []);
	expect(shownOnMonth([mine, other, noType]).map((i) => i.id)).toEqual(['itm_work', 'itm_event', 'itm_none']);

	// independent of the type-bar hidden set: onCalendar off filters with `hidden` empty (tested above)
	// and adding a hidden type does not change the Month result either
	initTypes(typesWithWorkOff(), ['Hobby']);
	expect(shownOnMonth([mine, other]).map((i) => i.id)).toEqual(['itm_event']);
});

// ---- C6 ---------------------------------------------------------------------------------------------------
it('C6 partner rows stay on my month grid even when their type key matches one of my off types; only my own items are filtered', () => {
	initTypes(typesWithWorkOff(), []);
	const theirs = item({ id: 'itm_theirs', type: 'Work', theirs: true, editable: false });
	const mine = item({ id: 'itm_mine', type: 'Work' });
	const out = shownOnMonth([theirs, mine]);
	expect(out.map((i) => i.id)).toEqual(['itm_theirs']);
	expect(out[0]?.theirs).toBe(true);

	// every off type, not just Work, leaves partner rows alone
	initTypes(
		defaultTypes().map((t) => ({ ...t, onCalendar: false })),
		[],
	);
	expect(shownOnMonth([theirs, mine]).map((i) => i.id)).toEqual(['itm_theirs']);
});

// ---- C8 ---------------------------------------------------------------------------------------------------
it('C8 round trip: flag off hides and flag on restores with no item/block row written and the type unchanged', () => {
	const created = itemsRepo.create(
		me,
		itemsRepo.itemCreateSchema.parse({ title: 'Blind10 round trip', type: 'Work', date: '2026-11-27' }),
	);
	const work = typeRow('Work'); // after the item: its `used` count is part of the baseline
	const snapshot = () =>
		h.sqlite
			.prepare('SELECT title, type, date, updated_at, deleted_at FROM items WHERE id = ?')
			.get(created.id);
	const counts = () =>
		h.sqlite
			.prepare('SELECT (SELECT count(*) FROM items) AS i, (SELECT count(*) FROM blocks) AS b')
			.get() as { i: number; b: number };
	const before = { row: snapshot(), counts: counts(), used: work.used };

	typeRepo.patch(me, work.id, { onCalendar: false });
	initTypes(typeRepo.list(me), []);
	expect(shownOnMonth([item({ id: created.id, type: 'Work' })])).toEqual([]);
	expect(shownOnMonth([item({ id: created.id, type: 'Work', theirs: true })])).toHaveLength(1);

	typeRepo.patch(me, work.id, { onCalendar: true });
	initTypes(typeRepo.list(me), []);
	expect(shownOnMonth([item({ id: created.id, type: 'Work' })]).map((i) => i.id)).toEqual([created.id]);

	// nothing but item_types.on_calendar moved
	expect(snapshot()).toEqual(before.row);
	expect(counts()).toEqual(before.counts);
	const after = typeRow('Work');
	expect({ name: after.name, bg: after.bg, slug: after.slug, used: after.used }).toEqual({
		name: work.name,
		bg: work.bg,
		slug: work.slug,
		used: before.used,
	});
});

// ---- C10 --------------------------------------------------------------------------------------------------
it('C10 the switch write is not journalled: no undo row and no undo label for an onCalendar change', () => {
	const undoCount = () =>
		(h.sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n;
	const work = typeRow('Work');
	const before = undoCount();

	typeRepo.patch(me, work.id, { onCalendar: false }); // the PATCH route calls this directly
	expect(undoCount()).toBe(before);

	typeRepo.patch(me, work.id, { onCalendar: true }); // the switch itself is the reversal
	expect(undoCount()).toBe(before);

	const labels = h.sqlite.prepare('SELECT label FROM undo_actions').all() as { label: string }[];
	expect(labels.some((l) => /type|calendar/i.test(l.label))).toBe(false);
});

// ---- C11 --------------------------------------------------------------------------------------------------
it('C11 states: five built-ins always exist, "No type" is not a row to switch, and a null type is never filtered', () => {
	// empty is impossible: an account always has the five built-in rows
	initTypes(defaultTypes(), []);
	const rows = typeRepo.list(me);
	expect(rows).toHaveLength(5);
	expect(rows.map((t) => t.name)).toEqual(['Work', 'Deadline', 'Event', 'Hobby', 'Date']);

	// no "No type" row (so no switch for it); `type: null` is a property of items, not a type
	for (const t of [...defaultTypes(), ...rows])
		expect(/^no.?type$/i.test(t.key) || /^no.?type$/i.test(t.name), `${t.key}/${t.name}`).toBe(false);

	initTypes(typesWithWorkOff(), []);
	expect(shownOnMonth([item({ id: 'itm_none', type: null })])).toHaveLength(1);
});

// ---- C12 --------------------------------------------------------------------------------------------------
it('C12 own(): another account id is a 404 and never touches their item_types row', () => {
	const partner = mk('partner');
	const theirType = typeRepo.list(partner)[0]!;
	const myType = typeRow('Work');

	const status = (fn: () => unknown): number => {
		try {
			fn();
			return 0;
		} catch (e) {
			expect(e).toBeInstanceOf(ApiFail);
			return (e as ApiFail).status;
		}
	};

	expect(status(() => typeRepo.patch(me, theirType.id, { onCalendar: false }))).toBe(404);
	expect(status(() => typeRepo.patch(partner, myType.id, { onCalendar: false }))).toBe(404);
	expect(typeRepo.list(partner).find((t) => t.id === theirType.id)?.onCalendar).toBe(true);
	expect(typeRow('Work').onCalendar).toBe(true);

	// my own id is the one that works
	expect(typeRepo.patch(me, myType.id, { onCalendar: false }).onCalendar).toBe(false);
});
