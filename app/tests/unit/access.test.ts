import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import * as keys from '../../src/lib/server/repo/sharekeys';
import * as grants from '../../src/lib/server/repo/grants';
import { getCalendar } from '../../src/lib/server/calendar';

let a: string;
let b: App.SafeUser;
const D = '2026-11-10';
const mk = (u: string) =>
	usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
const cal = () => getCalendar(b, D, '2026-11-11');

beforeEach(() => {
	freshDb();
	a = mk('jeremy');
	const bid = mk('neina');
	b = usersRepo.safe(usersRepo.byId(bid)!);
	const date = items.create(
		a,
		items.itemCreateSchema.parse({ title: 'Dinner date', type: 'Dating', date: D }),
	);
	items.create(
		a,
		items.itemCreateSchema.parse({ title: 'Secret gift', type: 'Dating', date: D, private: true }),
	);
	const work = items.create(
		a,
		items.itemCreateSchema.parse({ title: 'Network lab', type: 'Work', date: D, notes: 'secret notes' }),
	);
	items.create(a, items.itemCreateSchema.parse({ title: 'step', type: 'Work', date: D, parentId: work.id }));
	blocks.create(
		a,
		blocks.blockCreateSchema.parse({
			itemId: work.id,
			startAt: '2026-11-10T01:00:00Z',
			endAt: '2026-11-10T02:00:00Z',
		}),
	);
	blocks.create(
		a,
		blocks.blockCreateSchema.parse({
			label: 'Gym',
			type: 'Hobby',
			startAt: '2026-11-10T10:00:00Z',
			endAt: '2026-11-10T11:00:00Z',
		}),
	);
	blocks.create(
		a,
		blocks.blockCreateSchema.parse({
			itemId: date.id,
			startAt: '2026-11-10T11:00:00Z',
			endAt: '2026-11-10T12:00:00Z',
		}),
	);
});

describe('what a grantee receives', () => {
	it('nothing before a code is redeemed', () => {
		expect(cal()).toEqual({ items: [], blocks: [] });
	});
	it('visible types full (read-only), others Busy, private always Busy, steps never', () => {
		keys.redeem(b.id, keys.create(a, { types: ['Dating', 'Blocks'], hiddenAs: 'busy', expiry: '7d' }).code);
		const c = cal();
		expect(c.items.map((i) => i.title).sort()).toEqual(['Busy', 'Busy', 'Dinner date']);
		expect(c.items.every((i) => i.theirs && !i.editable && i.owner?.name === 'jeremy')).toBe(true);
		expect(c.blocks.map((x) => x.label).sort()).toEqual(['Busy', 'Busy', 'Dinner date']);
		const s = JSON.stringify(c);
		for (const leak of ['Secret gift', 'Network lab', 'secret notes', 'Gym', '"step"', 'Work', 'Hobby'])
			expect(s).not.toContain(leak);
		expect(c.blocks.every((x) => x.itemId === null)).toBe(true);
	});
	it("hidden = 'none' drops the rest; no Blocks = no blocks", () => {
		keys.redeem(b.id, keys.create(a, { types: ['Work'], hiddenAs: 'none', expiry: '7d' }).code);
		const c = cal();
		expect(c.items.map((i) => i.title)).toEqual(['Network lab']);
		expect(c.blocks).toEqual([]);
	});
	it('overlap off (per grant or per user) hides them; revoke hides them', () => {
		keys.redeem(b.id, keys.create(a, { types: ['Dating'], hiddenAs: 'none', expiry: '7d' }).code);
		const g = grants.received(b.id)[0]!;
		grants.setInOverlap(b.id, g.id, false);
		expect(cal().items).toEqual([]);
		grants.setInOverlap(b.id, g.id, true);
		expect(getCalendar({ ...b, overlapOn: false }, D, '2026-11-11').items).toEqual([]);
		expect(cal().items).toHaveLength(1);
		grants.removeGiven(a, g.id);
		expect(cal().items).toEqual([]);
	});
});

describe('block leaks (review 2026-11-08)', () => {
	const linked = (itemId: string, h: number) =>
		blocks.create(
			a,
			blocks.blockCreateSchema.parse({
				itemId,
				startAt: `2026-11-10T0${h}:00:00Z`,
				endAt: `2026-11-10T0${h}:30:00Z`,
			}),
		);
	it('a block whose item was deleted shows as Busy, not with its label', () => {
		const it0 = items.create(
			a,
			items.itemCreateSchema.parse({ title: 'Gone thing', type: 'Dating', date: D }),
		);
		linked(it0.id, 3);
		items.softDelete(a, it0.id);
		keys.redeem(b.id, keys.create(a, { types: ['Dating', 'Blocks'], hiddenAs: 'busy', expiry: '7d' }).code);
		expect(JSON.stringify(cal())).not.toContain('Gone thing');
	});
	it('a block linked to a step is Busy even if the step type is shared', () => {
		const par = items.create(a, items.itemCreateSchema.parse({ title: 'Parent', type: 'Work', date: D }));
		const st = items.create(
			a,
			items.itemCreateSchema.parse({ title: 'Hidden step', type: 'Dating', date: D, parentId: par.id }),
		);
		linked(st.id, 4);
		keys.redeem(b.id, keys.create(a, { types: ['Dating', 'Blocks'], hiddenAs: 'busy', expiry: '7d' }).code);
		expect(JSON.stringify(cal())).not.toContain('Hidden step');
	});
	it("a shown linked block sends only the item's type, never its own", () => {
		keys.redeem(b.id, keys.create(a, { types: ['Dating', 'Blocks'], hiddenAs: 'none', expiry: '7d' }).code);
		const shown = cal().blocks.find((x) => x.label === 'Dinner date');
		expect(shown).toMatchObject({ type: null, itemType: 'Dating', itemId: null });
	});
});

describe('security review 2026-11-08', () => {
	it('unlinking a block from a private item drops the private title', () => {
		const sec = items.create(
			a,
			items.itemCreateSchema.parse({ title: 'Secret biopsy', type: 'Dating', date: D, private: true }),
		);
		const bl = blocks.create(
			a,
			blocks.blockCreateSchema.parse({
				itemId: sec.id,
				startAt: '2026-11-10T05:00:00Z',
				endAt: '2026-11-10T06:00:00Z',
			}),
		);
		blocks.patch(a, bl.id, { itemId: null });
		keys.redeem(b.id, keys.create(a, { types: ['None', 'Blocks'], hiddenAs: 'busy', expiry: '7d' }).code);
		expect(JSON.stringify(cal())).not.toContain('Secret biopsy');
	});
	it('a shown linked block carries the current item title, not an old label', () => {
		const w = items.create(a, items.itemCreateSchema.parse({ title: 'Old name', type: 'Event', date: D }));
		blocks.create(
			a,
			blocks.blockCreateSchema.parse({
				itemId: w.id,
				startAt: '2026-11-10T06:00:00Z',
				endAt: '2026-11-10T07:00:00Z',
			}),
		);
		items.patch(a, w.id, { title: 'New name' });
		keys.redeem(b.id, keys.create(a, { types: ['Event', 'Blocks'], hiddenAs: 'none', expiry: '7d' }).code);
		const s = JSON.stringify(cal());
		expect(s).toContain('New name');
		expect(s).not.toContain('Old name');
	});
	it('rejects calendar-invalid instants (Feb 31)', () => {
		expect(() =>
			blocks.blockCreateSchema.parse({
				label: 'x',
				startAt: '2026-02-31T10:00:00Z',
				endAt: '2026-03-01T10:00:00Z',
			}),
		).toThrow();
	});
	it('at most 20 open share codes', () => {
		for (let i = 0; i < 20; i++) keys.create(a, { types: ['Work'], hiddenAs: 'none', expiry: '24h' });
		expect(() => keys.create(a, { types: ['Work'], hiddenAs: 'none', expiry: '24h' })).toThrow(
			/20 open codes/,
		);
	});
});
