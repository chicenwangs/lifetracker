import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/lib/server/env';

const base = {
	DATABASE_PATH: '../data/app.db',
	ORIGIN: 'http://localhost:5173',
	APP_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
	it('ok with defaults', () => {
		const e = parseEnv(base);
		expect(e.NODE_ENV).toBe('development');
		expect(e.TZ).toBe('Asia/Kuala_Lumpur');
		expect(e.SETUP_TOKEN).toBe('');
		expect(e.ADDRESS_HEADER).toBeUndefined();
	});

	it('secure cookies only for https ORIGIN (not NODE_ENV)', () => {
		expect(parseEnv({ ...base, NODE_ENV: 'production' }).secureCookies).toBe(false);
		expect(parseEnv({ ...base, ORIGIN: 'https://lt.example.com' }).secureCookies).toBe(true);
	});

	it('rejects short APP_SECRET, no value in message', () => {
		const secret = 'shortsecret';
		expect(() => parseEnv({ ...base, APP_SECRET: secret })).toThrow(/APP_SECRET/);
		try {
			parseEnv({ ...base, APP_SECRET: secret });
		} catch (err) {
			expect(String(err)).not.toContain(secret);
		}
	});

	it('rejects ORIGIN with trailing slash or missing', () => {
		expect(() => parseEnv({ ...base, ORIGIN: 'http://localhost:5173/' })).toThrow(/ORIGIN/);
		expect(() => parseEnv({ DATABASE_PATH: 'x', APP_SECRET: 'x'.repeat(32) })).toThrow(/ORIGIN/);
	});

	it('empty ADDRESS_HEADER = unset', () => {
		expect(parseEnv({ ...base, ADDRESS_HEADER: '' }).ADDRESS_HEADER).toBeUndefined();
		expect(parseEnv({ ...base, ADDRESS_HEADER: 'CF-Connecting-IP' }).ADDRESS_HEADER).toBe('CF-Connecting-IP');
	});
});
