// Card 14 (O-1 item 6, D-V4-11, D-V4-21): the shared starter-preset table, `onCalendar` on the create path and
// the one-transaction preset create. Type settings keep their no-undo behaviour; the presets add no journal row.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import { ApiFail } from '../../src/lib/server/http';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as itemTypes from '../../src/lib/server/repo/itemtypes';
import {
	BUILTIN_TYPES,
	inkFor,
	MAX_TYPES,
	RESERVED_SLUGS,
	TYPE_PRESETS,
	TYPE_SWATCHES,
} from '../../src/lib/itemtypes';

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
const preset = (slug: string) => itemTypes.createPreset(me, slug);
const code = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		return (e as ApiFail).code;
	}
	return 'no error';
};

describe('type starter pack', () => {
	it('C1 five presets in order, each a swatch, Class off the Month, nothing else on by default', () => {
		expect(TYPE_PRESETS.map((p) => [p.name, p.slug, p.onCalendar])).toEqual([
			['Class', 'class', false],
			['Errand', 'errand', true],
			['Health', 'health', true],
			['Chore', 'chore', true],
			['Study', 'study', true],
		]);
		for (const p of TYPE_PRESETS) {
			expect(TYPE_SWATCHES).toContain(p.bg);
			expect([p.countsDown, p.shareDefault]).toEqual([false, false]);
		}
		expect(MAX_TYPES).toBe(10); // O-1 item 6: the cap does not move
		expect(BUILTIN_TYPES).toHaveLength(5);
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
	});

	it('C4 a preset makes one custom type after the last row and changes nothing that exists', () => {
		const before = itemTypes.list(me);
		const t = preset('class');
		const after = itemTypes.list(me);
		expect(after).toHaveLength(6);
		expect(t).toMatchObject({
			name: 'Class',
			slug: 'class',
			bg: '#D3EECE',
			ink: inkFor('#D3EECE'),
			builtin: false,
			countsDown: false,
			shareDefault: false,
			onCalendar: false,
		});
		expect(t.position).toBe(Math.max(...before.map((x) => x.position)) + 1);
		expect(after.slice(0, 5)).toEqual(before); // no rename, recolour, reorder or delete
		expect(after[5]?.id).toBe(t.id);
	});

	it('C5 createSchema takes onCalendar (default true) and create writes on_calendar', () => {
		const input = itemTypes.createSchema.parse({ name: 'Quiet', bg: '#3D5A80' });
		expect(input.onCalendar).toBe(true);
		expect(() => itemTypes.createSchema.parse({ name: 'Quiet', bg: '#3D5A80', onCalendar: 'no' })).toThrow();
		const on = itemTypes.create(me, input);
		expect(on.onCalendar).toBe(true);
		const off = itemTypes.create(
			me,
			itemTypes.createSchema.parse({ name: 'Off', bg: '#3D5A80', onCalendar: false }),
		);
		const stored = handle().sqlite.prepare('SELECT on_calendar FROM item_types WHERE id = ?').get(off.id) as {
			on_calendar: number;
		};
		expect(stored.on_calendar).toBe(0); // written by create, not left to the DB default
		expect(preset('class').onCalendar).toBe(false);
	});

	it('C7 a slug clash creates nothing and names the type that owns it (bad_slug)', () => {
		itemTypes.create(me, itemTypes.createSchema.parse({ name: 'Health hub', bg: '#3D5A80', slug: 'health' }));
		expect(code(() => preset('health'))).toBe('bad_slug');
		expect(() => preset('health')).toThrow('/health is used by Health hub.');
		expect(itemTypes.list(me)).toHaveLength(6);
		expect(itemTypes.list(me).some((t) => t.name === 'Health')).toBe(false);
	});

	it('C8 the five fill 5→10 once each; an 11th is refused and a repeat never duplicates', () => {
		for (const p of TYPE_PRESETS) preset(p.slug);
		const all = itemTypes.list(me);
		expect(all).toHaveLength(MAX_TYPES);
		expect(all.slice(5).map((t) => [t.name, t.slug])).toEqual(TYPE_PRESETS.map((p) => [p.name, p.slug]));
		expect(new Set(all.map((t) => t.slug)).size).toBe(MAX_TYPES);
		expect(new Set(all.map((t) => t.name)).size).toBe(MAX_TYPES);
		// the 11th (preset or manual) hits the existing cap message
		expect(() => preset('class')).toThrow(/10 types/);
		expect(() =>
			itemTypes.create(me, itemTypes.createSchema.parse({ name: 'Eleven', bg: '#3D5A80' })),
		).toThrow(/10 types/);

		// a free slot: the same preset twice leaves one row, the second call is the slug clash
		freshDb();
		me = usersRepo.createWithCalendar({
			username: 'jeremy',
			displayName: 'J',
			passwordHash: 'x',
			role: 'admin',
		}).id;
		preset('errand');
		expect(() => preset('errand')).toThrow('/errand is used by Errand.');
		expect(itemTypes.list(me).filter((t) => t.slug === 'errand')).toHaveLength(1);
	});

	it('C9 preset rows are mine only, a partner keeps five, built-ins stay undeletable', () => {
		const partnersBefore = itemTypes.list(other);
		preset('class');
		expect(itemTypes.list(other)).toEqual(partnersBefore);
		expect(itemTypes.list(other)).toHaveLength(5);
		const mine = handle()
			.sqlite.prepare("SELECT owner_id, name FROM item_types WHERE slug IN ('class')")
			.all() as { owner_id: string; name: string }[];
		expect(mine).toEqual([{ owner_id: me, name: 'Class' }]);
		for (const p of TYPE_PRESETS.slice(1)) preset(p.slug);
		expect(itemTypes.list(me)).toHaveLength(MAX_TYPES);
		const work = itemTypes.list(me).find((t) => t.key === 'Work');
		expect(() => itemTypes.remove(me, work?.id ?? '', null)).toThrow(/Built-in/);
	});

	it('C11 a preset writes no undo entry (D-V4-11: Delete keeps its own)', () => {
		preset('class');
		const n = handle().sqlite.prepare('SELECT count(*) AS n FROM undo_actions').get() as {
			n: number;
		};
		expect(n.n).toBe(0);
	});
});
