// Visible hour range of the planner + week timelines ("rolled" hours are hidden). Pure, shared.
export interface HourRange {
	start: number; // 0..21
	end: number; // 3..24
}
export const DEFAULT_HOURS: HourRange = { start: 7, end: 24 };
export const MIN_SPAN = 3;

/** keep a range valid; `moving` says which edge the user drags so the other one stays put */
export function clampHours(start: number, end: number, moving: 'start' | 'end' = 'end'): HourRange {
	if (!Number.isFinite(start) || !Number.isFinite(end)) return { ...DEFAULT_HOURS };
	let s = Math.max(0, Math.min(24, Math.round(start)));
	let e = Math.max(0, Math.min(24, Math.round(end)));
	if (e - s < MIN_SPAN) {
		if (moving === 'start') s = e - MIN_SPAN;
		else e = s + MIN_SPAN;
	}
	if (s < 0) [s, e] = [0, MIN_SPAN];
	if (e > 24) [s, e] = [24 - MIN_SPAN, 24];
	return { start: s, end: e };
}

/** cookie value "7-24" -> range (bad/missing = default) */
export function parseHours(v: string | undefined | null): HourRange {
	const m = /^(\d{1,2})-(\d{1,2})$/.exec(v ?? '');
	if (!m) return { ...DEFAULT_HOURS };
	const s = Number(m[1]);
	const e = Number(m[2]);
	if (s < 0 || e > 24 || e - s < MIN_SPAN) return { ...DEFAULT_HOURS };
	return { start: s, end: e };
}

export const pad2 = (h: number) => String(h).padStart(2, '0');
