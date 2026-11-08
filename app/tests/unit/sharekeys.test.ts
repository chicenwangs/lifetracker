import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as keys from '../../src/lib/server/repo/sharekeys';
import * as grants from '../../src/lib/server/repo/grants';
import { handle } from '../../src/lib/server/db';

let a: string;
let b: string;
let c: string;
const mk = (u: string) =>
	usersRepo.createWithCalendar({
		username: u,
		displayName: u.toUpperCase(),
		passwordHash: 'x',
		role: 'member',
	}).id;
const view = { types: ['Event', 'Dating', 'Blocks'], hiddenAs: 'busy', expiry: '7d' } as const;

beforeEach(() => {
	freshDb();
	a = mk('jeremy');
	b = mk('neina');
	c = mk('carl');
});

describe('share codes', () => {
	it('code shown once, stored as HMAC only, single use', () => {
		const k = keys.create(a, view);
		expect(k.code).toMatch(/^LT-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
		const raw = JSON.stringify(handle().sqlite.prepare('SELECT * FROM share_keys').all());
		expect(raw).not.toContain(k.code.slice(3).replace(/-/g, ''));
		const r = keys.redeem(b, k.code.toLowerCase().replace(/-/g, ' '));
		expect(r.ok).toBe(true);
		expect(grants.received(b)).toMatchObject([
			{ name: 'JEREMY', visibleTypes: ['Event', 'Dating', 'Blocks'] },
		]);
		expect(grants.given(a)).toMatchObject([{ name: 'NEINA' }]);
		expect(keys.redeem(c, k.code)).toMatchObject({ ok: false, status: 400 });
		expect(keys.listUnused(a)).toHaveLength(0);
	});
	it('own code refused; cancelled code refused', () => {
		const k = keys.create(a, view);
		expect(keys.redeem(a, k.code)).toMatchObject({ ok: false, message: expect.stringMatching(/own code/) });
		expect(keys.revoke(a, k.id)).toBe(true);
		expect(keys.redeem(b, k.code)).toMatchObject({ ok: false });
		expect(keys.revoke(b, keys.create(a, view).id)).toBe(false); // not mine
	});
	it('5 bad tries lock redeem for 15 min', () => {
		for (let i = 0; i < 5; i++) keys.redeem(b, 'LT-0000-0000-0000');
		const good = keys.create(a, view);
		expect(keys.redeem(b, good.code)).toMatchObject({ ok: false, status: 429 });
	});
	it('mutual = both make + both redeem; redeem again replaces settings and reopens', () => {
		expect(keys.redeem(b, keys.create(a, view).code).ok).toBe(true);
		expect(keys.redeem(a, keys.create(b, view).code).ok).toBe(true);
		expect(grants.received(a)).toHaveLength(1);
		expect(grants.received(b)).toHaveLength(1);
		const g = grants.received(b)[0]!;
		expect(grants.leave(b, g.id)).toBe(true);
		expect(grants.received(b)).toHaveLength(0);
		keys.redeem(b, keys.create(a, { types: ['Work'], hiddenAs: 'none', expiry: '24h' }).code);
		expect(grants.received(b)).toMatchObject([{ id: g.id, visibleTypes: ['Work'], hiddenAs: 'none' }]);
		expect(grants.removeGiven(a, g.id)).toBe(true);
		expect(grants.received(b)).toHaveLength(0);
		expect(grants.removeGiven(c, g.id)).toBe(false);
	});
});
