// FEATURES §4 table TH-01..10.
import { describe, expect, it } from 'vitest';
import { resolveTheme, schedulePreview } from '../../src/lib/theme';

const KL = 'Asia/Kuala_Lumpur';
const at = (hhmm: string) => Date.parse(`2026-11-13T${hhmm}:00+08:00`);

describe('auto theme', () => {
	it('TH-01..04 Auto in KL: 06:59 dark, 07:00 light, 16:59 light, 17:00 dark', () => {
		expect(['06:59', '07:00', '16:59', '17:00'].map((t) => resolveTheme('auto', '07:00', '17:00', KL, at(t)))).toEqual(['dark', 'light', 'light', 'dark']);
	}); // prettier-ignore
	it('TH-05/06 fixed modes ignore the clock', () => {
		expect(resolveTheme('light', '07:00', '17:00', KL, at('22:00'))).toBe('light');
		expect(resolveTheme('dark', '07:00', '17:00', KL, at('10:00'))).toBe('dark');
	});
	it('TH-07 timezone change recalculates', () => {
		// 10:00 in KL = 02:00 UTC -> dark in London
		expect(resolveTheme('auto', '07:00', '17:00', KL, at('10:00'))).toBe('light');
		expect(resolveTheme('auto', '07:00', '17:00', 'Europe/London', at('10:00'))).toBe('dark');
	});
	it('TH-10 wrap: light 20:00, dark 06:00 at 23:00 = light', () => {
		expect(resolveTheme('auto', '20:00', '06:00', KL, at('23:00'))).toBe('light');
		expect(resolveTheme('auto', '20:00', '06:00', KL, at('12:00'))).toBe('dark');
	});
	it('preview text', () => {
		expect(schedulePreview('07:00', '17:00')).toBe('Light 07:00–16:59, Dark 17:00–06:59');
	});
});
