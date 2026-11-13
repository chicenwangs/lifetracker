// FEATURES §3b tests.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as types from '../../src/lib/server/repo/itemtypes';
import * as sharekeys from '../../src/lib/server/repo/sharekeys';
import { undo, undoable } from '../../src/lib/server/undo';
import { quickAdd } from '../../src/lib/server/quickadd-server';
import { BUILTIN_TYPES, contrast, inkFor } from '../../src/lib/itemtypes';
import { examCountdown } from '../../src/lib/time';

let me: string;
let user: App.SafeUser;
beforeEach(() => {
	freshDb();
	const row = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	});
	me = row.id;
	user = usersRepo.safe(row);
});
const add = (name: string, extra: Partial<types.Create> = {}) =>
	types.create(me, types.createSchema.parse({ name, bg: '#3D5A80', ...extra }));
const NOW = Date.parse('2026-11-13T02:00:00Z');

describe('item types', () => {
	it('new account gets the 5 built-ins; migration seeds the same rows', () => {
		const l = types.list(me);
		expect(l.map((t) => [t.key, t.name, t.slug])).toEqual(BUILTIN_TYPES.map((t) => [t.key, t.name, t.slug]));
		expect(l.filter((t) => t.isDefault).map((t) => t.key)).toEqual(['Event']);
		expect(l.filter((t) => t.countsDown).map((t) => t.key)).toEqual(['Exam']);
		const sql = readFileSync('drizzle/0003_v2_foundations.sql', 'utf8').replace(/ AS \w+/g, '');
		for (const t of BUILTIN_TYPES)
			expect(sql).toContain(`'${t.key}', '${t.name}', '${t.bg}', '${t.ink}', '${t.slug}'`);
	});

	it('10 total: 5 custom ok, the 11th is refused', () => {
		for (let i = 1; i <= 5; i++) add(`T${i}`);
		expect(() => add('Eleven')).toThrow(/10 types/);
	});

	it('slug: reserved words and duplicates refused', () => {
		expect(() => add('Calendar')).toThrow(/already a quick-add option/);
		add('Side project');
		expect(() => add('Side-project')).toThrow(/used by Side project/);
	});

	it('ink picked for contrast', () => {
		expect(inkFor('#FAEDB8')).toBe('#00003D');
		expect(inkFor('#3D5A80')).toBe('#FFFFFF');
		expect(contrast('#B84A44', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // Deadline chip (UX-AUDIT #3)
	});

	it('items + blocks: unknown type refused, custom type accepted, rename keeps items', () => {
		expect(() => items.create(me, items.itemCreateSchema.parse({ title: 'x', type: 'Nope' }))).toThrow(
			/unknown type/,
		);
		const t = add('Bills', { countsDown: true });
		const i = items.create(
			me,
			items.itemCreateSchema.parse({ title: 'rent', type: t.key, date: '2026-11-20' }),
		);
		types.patch(me, t.id, types.patchSchema.parse({ name: 'Payments' }));
		expect(items.getOwn(me, i.id)?.type).toBe(t.key);
	});

	it('delete moves items to the chosen type; one undo puts everything back', () => {
		const t = add('Bills');
		const i = items.create(me, items.itemCreateSchema.parse({ title: 'rent', type: t.key }));
		const using = [{ t: 'items' as const, id: i.id }];
		undoable(me, 'Delete type', [{ t: 'item_types', id: t.id }, ...using], () => ({
			result: types.remove(me, t.id, 'Work'),
		}));
		expect(items.getOwn(me, i.id)?.type).toBe('Work');
		expect(types.list(me).some((x) => x.id === t.id)).toBe(false);
		undo(me);
		expect(items.getOwn(me, i.id)?.type).toBe(t.key);
		expect(types.list(me).some((x) => x.id === t.id)).toBe(true);
	});

	it('built-ins and the default type cannot be deleted', () => {
		const work = types.list(me).find((t) => t.key === 'Work');
		expect(() => types.remove(me, work?.id ?? '', null)).toThrow(/Built-in/);
		const t = add('Main');
		types.patch(me, t.id, { isDefault: true });
		expect(
			types
				.list(me)
				.filter((x) => x.isDefault)
				.map((x) => x.id),
		).toEqual([t.id]); // exactly one
		expect(() => types.remove(me, t.id, null)).toThrow(/default type/);
	});

	it('quick add: custom slug, old /exam alias, default = starred type', () => {
		const t = add('Bills');
		expect(quickAdd(user, 'rent fri /calendar /bills', NOW).item?.type).toBe(t.key);
		expect(quickAdd(user, 'quiz fri /calendar /exam', NOW).item?.type).toBe('Exam');
		types.patch(me, t.id, { isDefault: true });
		expect(quickAdd(user, 'water fri /calendar', NOW).item?.type).toBe(t.key);
	});

	it('countdown follows the flag, not the name', () => {
		const i = { status: 'todo', date: '2026-11-15' };
		expect(examCountdown(i, '2026-11-13', true)?.short).toBe('2d');
		expect(examCountdown(i, '2026-11-13', false)).toBeNull();
	});

	it('share codes accept my custom types, refuse unknown ones', () => {
		const t = add('Bills');
		expect(sharekeys.create(me, { types: [t.key, 'Blocks'], hiddenAs: 'busy', expiry: '7d' }).code).toMatch(
			/^LT-/,
		);
		expect(() =>
			sharekeys.create(me, { types: ['ity_someoneelse'], hiddenAs: 'busy', expiry: '7d' }),
		).toThrow(/unknown type/);
	});
});
