// Push hardening (security audit 2026-11-16, #22): host allowlist, device cap, endpoint ownership, stuck retries.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as rem from '../../src/lib/server/reminders';
import { MAX_DEVICES, pushHostOk, subscribe, subscriptionCount, tick } from '../../src/lib/server/jobs';
import { handle } from '../../src/lib/server/db';

const mk = (u: string) =>
	usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role: 'member' }).id;
const sub = (endpoint: string, auth = 'a1') => ({ endpoint, keys: { p256dh: 'p', auth } });
let a: string;
let b: string;
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	a = mk('alice');
	b = mk('bob');
});

describe('push', () => {
	it('only real browser push services pass', () => {
		for (const ok of [
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://updates.push.services.mozilla.com/wpush/v2/x',
			'https://wns2-par02p.notify.windows.com/w/?token=x',
			'https://web.push.apple.com/abc',
		])
			expect(pushHostOk(ok), ok).toBe(true);
		for (const no of [
			'https://127.0.0.1/x',
			'https://192.168.1.10:8443/x',
			'https://evil.example/fcm.googleapis.com',
			'https://fcm.googleapis.com.evil.example/x',
			'https://evilfcm.googleapis.com.example/x',
			'https://fcm.googleapis.com:8443/x',
			'http://fcm.googleapis.com/x',
			'https://user:pw@fcm.googleapis.com/x',
			'not a url',
		])
			expect(pushHostOk(no), no).toBe(false);
	});

	it('caps devices per user; re-subscribing the same device does not count twice', () => {
		for (let i = 0; i < MAX_DEVICES; i++)
			expect(subscribe(a, sub(`https://fcm.googleapis.com/${i}`), null)).toBe('ok');
		expect(subscribe(a, sub('https://fcm.googleapis.com/0'), null)).toBe('ok'); // same endpoint again
		expect(subscribe(a, sub('https://fcm.googleapis.com/new'), null)).toBe('full');
		expect(subscriptionCount(a)).toBe(MAX_DEVICES);
	});

	it("another account can't take over an endpoint without the device's keys", () => {
		subscribe(a, sub('https://fcm.googleapis.com/dev', 'secretA'), null);
		expect(subscribe(b, sub('https://fcm.googleapis.com/dev', 'guess'), null)).toBe('taken');
		expect(subscriptionCount(a)).toBe(1);
		// same browser switching account keeps the same auth secret: allowed
		expect(subscribe(b, sub('https://fcm.googleapis.com/dev', 'secretA'), null)).toBe('ok');
		expect([subscriptionCount(a), subscriptionCount(b)]).toEqual([0, 1]);
	});

	it('a stuck reminder counts as a try and ends as missed, not an endless loop', async () => {
		const NOW = Date.parse('2026-11-13T02:00:00Z');
		const i = items.create(
			a,
			items.itemCreateSchema.parse({ title: 'Quiz', date: '2026-11-20', time: '10:00' }),
		);
		const r = rem.add(a, 'planner_item', i.id, { offset: '2h' }, NOW);
		const db = handle().sqlite;
		db.prepare(`UPDATE reminders SET status = 'processing', claimed_at = ?, attempts = 4 WHERE id = ?`).run('2026-11-13T00:00:00Z', r.id); // prettier-ignore
		await tick(NOW);
		const row = db.prepare(`SELECT status, attempts FROM reminders WHERE id = ?`).get(r.id) as { status: string; attempts: number }; // prettier-ignore
		expect(row).toEqual({ status: 'missed', attempts: 5 });
	});

	it('caps waiting reminders per owner', () => {
		const NOW = Date.parse('2026-11-13T02:00:00Z');
		const db = handle().sqlite;
		const i = items.create(
			a,
			items.itemCreateSchema.parse({ title: 'x', date: '2026-12-20', time: '10:00' }),
		);
		const ins = db.prepare(`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, due_at, status, created_at, updated_at) VALUES (?, ?, 'planner_item', ?, 'absolute', ?, 'scheduled', ?, ?)`); // prettier-ignore
		for (let n = 0; n < rem.MAX_OPEN; n++) ins.run(`rem_${n}`, a, i.id, `2026-12-01T00:${String(n % 60).padStart(2, '0')}:${String(Math.floor(n / 60)).padStart(2, '0')}Z`, 'x', 'x'); // prettier-ignore
		expect(() => rem.add(a, 'planner_item', i.id, { offset: '1d' }, NOW)).toThrow(/reminders waiting/);
	});
});
