// Blind tests for card 14 (type starter pack), written from its Done-when lines only.
// No builder test was opened. In-memory DB only: the real data folder is never touched.
import { beforeEach, expect, it } from 'vitest';
import { freshDb } from './helpers';
import type { Handle } from '../../src/lib/server/db';
import { ApiFail } from '../../src/lib/server/http';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as typeRepo from '../../src/lib/server/repo/itemtypes';
import {
	BUILTIN_TYPES,
	inkFor,
	MAX_TYPES,
	RESERVED_SLUGS,
	TYPE_PRESETS,
	TYPE_SWATCHES,
} from '../../src/lib/itemtypes';
import type { ItemTypeDTO } from '../../src/lib/types';

let h: Handle;
let me: string;
const mk = (u: string) =>
	usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;

beforeEach(() => {
	h = freshDb();
	me = mk('jeremy');
});

const list = (owner = me) => typeRepo.list(owner);
const preset = (slug: string) => TYPE_PRESETS.find((p) => p.slug === slug)!;
const myRows = () =>
	h.sqlite.prepare('SELECT * FROM item_types WHERE owner_id = ?').all(me) as Record<string, unknown>[];
const rowOf = (id: string) =>
	h.sqlite.prepare('SELECT * FROM item_types WHERE id = ?').get(id) as Record<string, unknown>;
const undoCount = () => (h.sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n;

/** the ApiFail code + status, or 0 when the call did not throw */
function fail(fn: () => unknown): { status: number; code: string; message: string } {
	try {
		fn();
		return { status: 0, code: '', message: '' };
	} catch (e) {
		expect(e).toBeInstanceOf(ApiFail);
		const f = e as ApiFail;
		return { status: f.status, code: f.code, message: f.message };
	}
}

// ---- C1 ---------------------------------------------------------------------------------------------------
it('C1 the shared preset table is exactly five rows in order, with the flags and swatch colours the card names', () => {
	// five entries, in menu order, with the exact name/slug/flag values
	expect(TYPE_PRESETS).toHaveLength(5);
	expect(TYPE_PRESETS.map((p) => ({ name: p.name, slug: p.slug, onCalendar: p.onCalendar }))).toEqual([
		{ name: 'Class', slug: 'class', onCalendar: false },
		{ name: 'Errand', slug: 'errand', onCalendar: true },
		{ name: 'Health', slug: 'health', onCalendar: true },
		{ name: 'Chore', slug: 'chore', onCalendar: true },
		{ name: 'Study', slug: 'study', onCalendar: true },
	]);
	for (const p of TYPE_PRESETS) {
		expect(TYPE_SWATCHES, p.name).toContain(p.bg); // a colour the picker already offers
		expect(p.countsDown, p.name).toBe(false);
		expect(p.shareDefault, p.name).toBe(false);
		expect(inkFor(p.bg) === '#00003D' || inkFor(p.bg) === '#FFFFFF', p.name).toBe(true);
	}

	// the cap and the two older tables are unchanged (card 14 touches neither)
	expect(MAX_TYPES).toBe(10);
	expect(BUILTIN_TYPES).toEqual([
		{ key: 'Work', name: 'Work', bg: '#CED3EE', ink: '#00003D', slug: 'work', shareDefault: false, countsDown: false, isDefault: false, onCalendar: true }, // prettier-ignore
		{ key: 'Exam', name: 'Deadline', bg: '#B84A44', ink: '#FFFFFF', slug: 'deadline', shareDefault: false, countsDown: true, isDefault: false, onCalendar: true }, // prettier-ignore
		{ key: 'Event', name: 'Event', bg: '#D3EECE', ink: '#00003D', slug: 'event', shareDefault: true, countsDown: false, isDefault: true, onCalendar: true }, // prettier-ignore
		{ key: 'Hobby', name: 'Hobby', bg: '#FAEDB8', ink: '#00003D', slug: 'hobby', shareDefault: false, countsDown: false, isDefault: false, onCalendar: true }, // prettier-ignore
		{ key: 'Dating', name: 'Date', bg: '#EECFD4', ink: '#00003D', slug: 'date', shareDefault: true, countsDown: false, isDefault: false, onCalendar: true }, // prettier-ignore
	]);
	expect(RESERVED_SLUGS).toEqual([
		'calendar',
		'cal',
		'both',
		'planner',
		'plan',
		'timeline',
		'block',
		'remind',
	]);

	// the created row takes ink from inkFor(bg): that is the only ink source
	const made = typeRepo.createPreset(me, 'class');
	expect(made.ink).toBe(inkFor(made.bg));
	expect(made.bg).toBe(preset('class').bg);
});

// ---- C5 ---------------------------------------------------------------------------------------------------
it('C5 createSchema takes onCalendar (boolean, optional, default true) and create() writes the column, not the DB default', () => {
	// optional, default true (old behaviour for every existing caller)
	const plain = typeRepo.createSchema.safeParse({ name: 'Plain', bg: '#112233' });
	expect(plain.success).toBe(true);
	if (!plain.success) return;
	expect(plain.data.onCalendar).toBe(true);
	expect(typeRepo.createSchema.safeParse({ name: 'Off', bg: '#112233', onCalendar: false }).success).toBe(true); // prettier-ignore
	expect(typeRepo.createSchema.parse({ name: 'On', bg: '#112233', onCalendar: true }).onCalendar).toBe(true);

	// strict boolean: strings, numbers, null, snake_case and unknown keys are refused
	for (const bad of [
		{ name: 'X', bg: '#112233', onCalendar: 'no' },
		{ name: 'X', bg: '#112233', onCalendar: 0 },
		{ name: 'X', bg: '#112233', onCalendar: null },
		{ name: 'X', bg: '#112233', on_calendar: false },
		{ name: 'X', bg: '#112233', onCalendar: false, junk: 1 },
	])
		expect(typeRepo.createSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);

	// a manual create with the flag off stores 0; one without it stores the old default 1
	const off = typeRepo.create(me, { name: 'Manual off', bg: '#3D5A80', onCalendar: false });
	expect(off.onCalendar).toBe(false);
	expect(rowOf(off.id).on_calendar).toBe(0);
	const on = typeRepo.create(me, { name: 'Manual on', bg: '#3D5A80' });
	expect(on.onCalendar).toBe(true);
	expect(rowOf(on.id).on_calendar).toBe(1);

	// the preset path proves the same: Class 0 (the other four say true in C4)
	const cls = typeRepo.createPreset(me, 'class');
	expect(rowOf(cls.id).on_calendar).toBe(0);
	expect(rowOf(typeRepo.createPreset(me, 'errand').id).on_calendar).toBe(1);

	// the GET path's DTO exposes it (listWithUse is what /api/item-types returns)
	expect(typeRepo.listWithUse(me).find((t) => t.id === cls.id)?.onCalendar).toBe(false);
});

// ---- C4 ---------------------------------------------------------------------------------------------------
it('C4 each preset becomes exactly one custom type owned by the caller, after the last type, with its name/slug/colour', () => {
	const before = list();
	const beforePositions = before.map((t) => t.position);
	const made: ItemTypeDTO[] = [];

	// one by one, in the card's order: each lands after the previous one
	for (const p of TYPE_PRESETS) {
		const t = typeRepo.createPreset(me, p.slug);
		made.push(t);
		expect({
			name: t.name,
			slug: t.slug,
			bg: t.bg,
			ink: t.ink,
			onCalendar: t.onCalendar,
			countsDown: t.countsDown,
			shareDefault: t.shareDefault,
			builtin: t.builtin,
		}).toEqual({
			name: p.name,
			slug: p.slug,
			bg: p.bg,
			ink: inkFor(p.bg),
			onCalendar: p.onCalendar,
			countsDown: false,
			shareDefault: false,
			builtin: false,
		});
		expect(t.key, p.name).toBe(t.id); // a custom key, never a built-in one
		expect(rowOf(t.id).owner_id).toBe(me); // mine, from the server's session user
	}

	// positions follow the old last row, one per preset
	expect(made.map((t) => t.position)).toEqual([5, 6, 7, 8, 9]);
	expect(Math.min(...made.map((t) => t.position))).toBeGreaterThan(Math.max(...beforePositions));

	// no existing type was renamed, recoloured, reordered or deleted
	const after = list();
	expect(after).toHaveLength(before.length + 5);
	expect(after.filter((t) => t.builtin)).toEqual(before);
});

// ---- C7 ---------------------------------------------------------------------------------------------------
it('C7 a taken slug is skipped with the bad_slug message naming its owner; nothing is created', () => {
	// C7: another type (custom "Health hub") already owns /health
	const hub = typeRepo.create(me, { name: 'Health hub', bg: '#3D5A80', slug: 'health' });
	const rowsBefore = myRows().length;

	const clash = fail(() => typeRepo.createPreset(me, 'health'));
	expect(clash).toEqual({
		status: 400,
		code: 'bad_slug',
		message: `/health is used by ${hub.name}.`,
	});
	expect(myRows()).toHaveLength(rowsBefore);
	expect(list().some((t) => t.name === 'Health')).toBe(false);

	// the server's other refusals are just as clean: unknown preset word
	const unknown = fail(() => typeRepo.createPreset(me, 'nope'));
	expect(unknown.status).toBe(400);
	expect(unknown.code).toBe('bad_preset');
	expect(myRows()).toHaveLength(rowsBefore);
});

// ---- C8 ---------------------------------------------------------------------------------------------------
it('C8 a repeat add never duplicates: the same preset twice is one row (the second is a slug clash), five presets fill 5 slots', () => {
	// two rapid calls for the same preset: the server's slug uniqueness keeps it at one
	const first = typeRepo.createPreset(me, 'class');
	const again = fail(() => typeRepo.createPreset(me, 'class'));
	expect(again.status).toBe(400);
	expect(again.code).toBe('bad_slug');
	expect(again.message).toBe('/class is used by Class.');
	expect(list().filter((t) => t.name === 'Class')).toHaveLength(1);

	// the other four fill the rest: 5 -> 10 rows, five distinct slugs and names
	for (const slug of ['errand', 'health', 'chore', 'study']) typeRepo.createPreset(me, slug);
	const all = list();
	expect(all).toHaveLength(MAX_TYPES);
	const added = all.filter((t) => !t.builtin);
	expect(added).toHaveLength(5);
	expect(new Set(added.map((t) => t.slug)).size).toBe(5);
	expect(new Set(added.map((t) => t.name)).size).toBe(5);
	expect(added.map((t) => t.id)).toContain(first.id);
});

// ---- C9 ---------------------------------------------------------------------------------------------------
it('C9 server invariants: an 11th type is type_cap, rows stay scoped to the caller, a partner is untouched, built-ins stay undeletable', () => {
	for (const p of TYPE_PRESETS) typeRepo.createPreset(me, p.slug);
	const atCap = myRows().length;
	expect(atCap).toBe(10);

	// 11th from either door: the existing message and code
	const presetCap = fail(() => typeRepo.createPreset(me, 'class'));
	expect(presetCap).toEqual({
		status: 400,
		code: 'type_cap',
		message: 'You have 10 types. Delete one first.',
	});
	const manualCap = fail(() => typeRepo.create(me, { name: 'Eleventh', bg: '#3D5A80' }));
	expect(manualCap).toEqual({
		status: 400,
		code: 'type_cap',
		message: 'You have 10 types. Delete one first.',
	});
	expect(myRows()).toHaveLength(10);

	// every preset row belongs to me, and the partner's five built-ins are untouched
	const partner = mk('partner');
	expect(list(partner).map((t) => t.name)).toEqual(['Work', 'Deadline', 'Event', 'Hobby', 'Date']);
	expect(list(partner).every((t) => t.builtin)).toBe(true);
	expect(h.sqlite.prepare('SELECT count(*) AS n FROM item_types WHERE owner_id = ?').get(partner)).toEqual({
		n: 5,
	});
	for (const t of list().filter((x) => !x.builtin)) expect(rowOf(t.id).owner_id).toBe(me);

	// the partner can add their own copy independently
	const theirs = typeRepo.createPreset(partner, 'class');
	expect(rowOf(theirs.id).owner_id).toBe(partner);
	expect(list(me)).toHaveLength(10);
	expect(list(partner)).toHaveLength(6);

	// built-ins stay undeletable (card: the delete rules do not change)
	const builtin = list().find((t) => t.builtin)!;
	const del = fail(() => typeRepo.remove(me, builtin.id, null));
	expect(del.status).toBe(400);
	expect(del.code).toBe('builtin');
	expect(list(me).find((t) => t.id === builtin.id)).toBeTruthy();
});

// ---- C11 --------------------------------------------------------------------------------------------------
it('C11 a preset add gets no undo journal entry (D-V4-11); the type delete keeps its own', () => {
	const start = undoCount();
	typeRepo.createPreset(me, 'class');
	typeRepo.createPreset(me, 'errand');
	expect(undoCount()).toBe(start); // the repo write is not journalled

	const labels = h.sqlite.prepare('SELECT label FROM undo_actions').all() as { label: string }[];
	expect(labels.some((l) => /type/i.test(l.label))).toBe(false);

	// the reversal is the type's existing Delete path: its route records the journal entry, not the repo
	const cls = list().find((t) => t.name === 'Class')!;
	typeRepo.remove(me, cls.id, null);
	expect(undoCount()).toBe(start); // still no entry from the repo layer itself
	expect(list().some((t) => t.name === 'Class')).toBe(false);
});

// ---- C12 --------------------------------------------------------------------------------------------------
it('C12 one create = one row: a failed preset attempt (cap, slug clash) leaves nothing half-created behind', () => {
	const base = myRows();
	const baseIds = base.map((r) => r.id);

	// unknown preset
	expect(fail(() => typeRepo.createPreset(me, 'nope')).status).toBe(400);
	expect(myRows().map((r) => r.id)).toEqual(baseIds);

	// slug clash
	const hub = typeRepo.create(me, { name: 'Health hub', bg: '#3D5A80', slug: 'health' });
	const withHub = myRows().map((r) => r.id);
	expect(fail(() => typeRepo.createPreset(me, 'health')).status).toBe(400);
	expect(myRows().map((r) => r.id)).toEqual(withHub);

	// a valid create writes exactly one row (and the delete of the hub restores the base)
	typeRepo.remove(me, hub.id, null);
	expect(myRows().map((r) => r.id)).toEqual(baseIds);
	const one = typeRepo.createPreset(me, 'chore');
	expect(myRows()).toHaveLength(base.length + 1);
	expect(
		myRows()
			.filter((r) => r.id !== one.id)
			.map((r) => r.id)
			.sort(),
	).toEqual([...baseIds].sort());

	// cap: a full account refuses without leaving a row
	for (const slug of ['class', 'errand', 'health', 'study']) typeRepo.createPreset(me, slug);
	expect(myRows()).toHaveLength(10);
	expect(fail(() => typeRepo.createPreset(me, 'class')).code).toBe('type_cap');
	expect(myRows()).toHaveLength(10);
});
