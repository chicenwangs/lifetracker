// #181: a queued offline op is kept when the server fails or the session expired; only a clear 4xx drops it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueAction, flushQueue, queued } from '../../src/lib/client/offline';

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
