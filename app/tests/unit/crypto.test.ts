import { beforeAll, describe, expect, it } from 'vitest';
import {
	formatCode,
	newId,
	normaliseCode,
	randomBase32,
	timingSafeEqualStr,
} from '../../src/lib/server/crypto';
import { freshDb } from './helpers';

beforeAll(() => freshDb());

describe('codes', () => {
	it('random + format', () => {
		const raw = randomBase32(12);
		expect(raw).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
		expect(formatCode('LT', raw)).toMatch(/^LT-.{4}-.{4}-.{4}$/);
		expect(newId('itm')).toMatch(/^itm_[0-9a-z]{16}$/);
	});
	it('normalise with/without prefix, case, spaces', () => {
		expect(normaliseCode('LT-ABCD-EFGH-JKMN', 'LT')).toBe('ABCDEFGHJKMN');
		expect(normaliseCode('lt abcd efgh jkmn', 'LT')).toBe('ABCDEFGHJKMN');
		expect(normaliseCode('ABCDEFGHJKMN', 'LT')).toBe('ABCDEFGHJKMN');
		expect(normaliseCode('INV-1234-5678-9ABC', 'INV')).toBe('123456789ABC');
	});
	it('O->0, I/L->1', () => {
		expect(normaliseCode('LT-OOOO-IIII-LLLL', 'LT')).toBe('000011111111');
	});
	it('bad length / chars -> null', () => {
		expect(normaliseCode('LT-ABCD-EFGH', 'LT')).toBeNull();
		expect(normaliseCode('LT-ABCD-EFGH-JKMNP', 'LT')).toBeNull();
		expect(normaliseCode('LT-ABCD-EFGH-JKM!', 'LT')).toBeNull();
		expect(normaliseCode('LT-ABCD-EFGH-JKMU', 'LT')).toBeNull(); // U not in alphabet
	});
	it('timing safe eq', () => {
		expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
		expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
		expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
	});
});
