// Test harness: fresh in-memory DB + env + fake cookies.
import type { Cookies } from '@sveltejs/kit';
import { migrateDb, openDb, setHandle, type Handle } from '../../src/lib/server/db';
import { initEnv } from '../../src/lib/server/env';

export const TEST_SECRET = 'test-secret-'.padEnd(40, 'x');

export function freshDb(over: Record<string, string> = {}): Handle {
	initEnv({
		NODE_ENV: 'test',
		DATABASE_PATH: ':memory:',
		ORIGIN: 'http://localhost:5173',
		APP_SECRET: TEST_SECRET,
		SETUP_TOKEN: 'setup-token-123-long-enough',
		...over,
	});
	const h = openDb(':memory:');
	migrateDb(h);
	setHandle(h);
	return h;
}

export interface FakeCookies extends Cookies {
	jar: Map<string, { value: string; opts: Record<string, unknown> }>;
}

export function fakeCookies(): FakeCookies {
	const jar = new Map<string, { value: string; opts: Record<string, unknown> }>();
	const c = {
		jar,
		get: (n: string) => jar.get(n)?.value,
		getAll: () => [...jar].map(([name, v]) => ({ name, value: v.value })),
		set: (n: string, value: string, opts: Record<string, unknown>) => void jar.set(n, { value, opts }),
		delete: (n: string) => void jar.delete(n),
		serialize: () => '',
	};
	return c as unknown as FakeCookies;
}
