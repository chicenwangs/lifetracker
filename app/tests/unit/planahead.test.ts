import { describe, expect, it } from 'vitest';
import { itemSpans, planDay } from '../../src/lib/planahead';
import { localToUtc } from '../../src/lib/time';

const KL = 'Asia/Kuala_Lumpur';
const at = (d: string, hm: string) => Date.parse(localToUtc(d, hm, KL));
const span = (d: string, a: string, b: string, d2 = d) => ({
	startAt: localToUtc(d, a, KL),
	endAt: localToUtc(d2, b, KL),
});
const T = '2026-11-06';

describe('planDay', () => {
	const day = [span(T, '09:00', '10:00'), span(T, '20:00', '21:30')];
	it('night: before last item ends -> today', () => {
		expect(planDay('night', T, KL, day, at(T, '21:00'))).toBe(T);
	});
	it('night: after last item ends -> tomorrow', () => {
		expect(planDay('night', T, KL, day, at(T, '21:30'))).toBe('2026-11-07');
		expect(planDay('night', T, KL, day, at(T, '23:59'))).toBe('2026-11-07');
	});
	it('night: overnight Sleep block ignored for last item', () => {
		const withSleep = [...day, span(T, '23:00', '06:00', '2026-11-07')];
		expect(planDay('night', T, KL, withSleep, at(T, '22:00'))).toBe('2026-11-07');
	});
	it('night: nothing today -> today', () => {
		expect(planDay('night', T, KL, [span('2026-11-07', '09:00', '10:00')], at(T, '23:00'))).toBe(T);
	});
	it('morning / off / unset -> today', () => {
		for (const m of ['morning', 'off', null] as const) expect(planDay(m, T, KL, day, at(T, '23:00'))).toBe(T);
	});
	it('timed items count as 60 min', () => {
		const s = itemSpans(
			[
				{ date: T, time: '18:00' },
				{ date: T, time: null },
				{ date: null, time: null },
			],
			KL,
		);
		expect(s).toHaveLength(1);
		expect(planDay('night', T, KL, s, at(T, '18:59'))).toBe(T);
		expect(planDay('night', T, KL, s, at(T, '19:00'))).toBe('2026-11-07');
	});
});
