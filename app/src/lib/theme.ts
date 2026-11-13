// Auto theme (FEATURES §4). Pure, shared: SSR picks the first paint, the client re-checks every minute.
import { nowLocalMinutes } from './time';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type Theme = 'light' | 'dark';

const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** light iff local time in [lightStart, darkStart); wraps when lightStart > darkStart */
export function resolveTheme(
	mode: ThemeMode,
	lightStart: string,
	darkStart: string,
	tz: string,
	now: number = Date.now(),
): Theme {
	if (mode !== 'auto') return mode;
	const t = nowLocalMinutes(tz, now);
	const [l, d] = [min(lightStart), min(darkStart)];
	if (l === d) return 'dark'; // D-08: rejected on save; old rows can't have it, but never throw while rendering
	return (l < d ? t >= l && t < d : t >= l || t < d) ? 'light' : 'dark';
}

/** "Light 07:00–16:59, Dark 17:00–06:59" */
export function schedulePreview(lightStart: string, darkStart: string): string {
	const before = (hhmm: string) => {
		const m = (min(hhmm) + 1439) % 1440;
		return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
	};
	return `Light ${lightStart}–${before(darkStart)}, Dark ${darkStart}–${before(lightStart)}`;
}
