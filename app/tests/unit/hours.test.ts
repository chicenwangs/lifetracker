import { describe, expect, it } from 'vitest';
import { clampHours, DEFAULT_HOURS, parseHours } from '../../src/lib/hours';

describe('visible hours (rolled timeline)', () => {
	it('parses the cookie, falls back to default', () => {
		expect(parseHours('0-24')).toEqual({ start: 0, end: 24 });
		expect(parseHours('8-22')).toEqual({ start: 8, end: 22 });
		expect(parseHours(undefined)).toEqual(DEFAULT_HOURS);
		expect(parseHours('9-10')).toEqual(DEFAULT_HOURS); // < 3 h
		expect(parseHours('x')).toEqual(DEFAULT_HOURS);
		expect(parseHours('5-30')).toEqual(DEFAULT_HOURS);
	});
	it('clamps to 0..24 and keeps 3 h, the dragged edge gives way', () => {
		expect(clampHours(-4, 24, 'start')).toEqual({ start: 0, end: 24 });
		expect(clampHours(7, 30, 'end')).toEqual({ start: 7, end: 24 });
		expect(clampHours(22, 24, 'start')).toEqual({ start: 21, end: 24 });
		expect(clampHours(7, 8, 'end')).toEqual({ start: 7, end: 10 });
		expect(clampHours(0, 1, 'end')).toEqual({ start: 0, end: 3 });
		expect(clampHours(7.4, 23.6, 'end')).toEqual({ start: 7, end: 24 });
	});
});
