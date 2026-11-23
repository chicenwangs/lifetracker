// #181: a queued offline op is kept when the server fails or the session expired; only a clear 4xx drops it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	enqueue,
	enqueueAction,
	flushQueue,
	markSignOut,
	queued,
	settleSignOut,
} from '../../src/lib/client/offline';

const store = new Map<string, string>();
beforeEach(() => {
	store.clear();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => store.set(k, v),
		removeItem: (k: string) => store.delete(k),
	});
	vi.stubGlobal('location', { href: '', pathname: '/today', search: '' });
});
const reply = (status: number) =>
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('{}', { status })),
	);

describe('offline queue flush', () => {
	it('keeps ops on 500 and 401, drops them on 404, sends them on 200', async () => {
		enqueueAction({ key: 'a', method: 'PATCH', path: '/api/items/a', payload: { title: 'x' } });
		for (const s of [500, 401]) {
			reply(s);
			await flushQueue();
			expect(queued()).toBe(1);
		}
		reply(404);
		await flushQueue();
		expect(queued()).toBe(0);
		enqueueAction({ key: 'b', method: 'PATCH', path: '/api/items/b', payload: { title: 'y' } });
		reply(200);
		expect((await flushQueue()).planner).toBe(1);
		expect(queued()).toBe(0);
	});
});

// #304: a queued note edit the server refused as stale is kept as an offline copy, never reported as plainly sent
describe('stale note edit', () => {
	it('409 on the queued PATCH posts an (offline copy) and counts it as a copy, not as sent', async () => {
		enqueue({ key: 'n1', noteId: 'kn_1', revision: 1, payload: { title: 'T', body: 'OFFLINE-B' } });
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (u: string, init: { method: string; body: string }) => {
				calls.push(`${init.method} ${u} ${init.body}`);
				return new Response('{}', { status: init.method === 'PATCH' ? 409 : 201 });
			}),
		);
		const r = await flushQueue();
		expect(r).toMatchObject({ sent: 0, copies: 1 });
		expect(calls[1]).toContain('(offline copy)');
		expect(queued()).toBe(0);
	});
});

// #313: a sign-out that never reached the server must not wipe the queue
describe('sign-out wipe', () => {
	const add = () => enqueueAction({ key: 'a', method: 'POST', path: '/api/items', payload: { title: 'x' } });
	it('keeps the queue when still signed in after the sign-out attempt', () => {
		add();
		markSignOut();
		settleSignOut(true);
		expect(queued()).toBe(1);
		settleSignOut(false); // mark is gone: a later signed-out load (session expiry) does not wipe either
		expect(queued()).toBe(1);
	});
	it('wipes once the next page loads signed out', () => {
		add();
		markSignOut();
		settleSignOut(false);
		expect(queued()).toBe(0);
	});
});
