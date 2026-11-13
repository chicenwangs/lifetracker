// Reminder offsets (PRD §8, FEATURES §9, D-15). Pure, shared: quick-add preview + server truth.
// Exact words only: 1w 3d 2d 1d 2h 15min (D-15 added 15min). Anything else = a clear error, never a guess.
import { localToUtc } from './time';

export const OFFSETS = ['1w', '3d', '2d', '1d', '2h', '15min'] as const;
export type Offset = (typeof OFFSETS)[number];
export type Unit = 'minute' | 'hour' | 'day' | 'week';
export const OFFSET_LABEL: Record<Offset, string> = { '1w': '1 week before', '3d': '3 days before', '2d': '2 days before', '1d': '1 day before', '2h': '2 hours before', '15min': '15 min before' }; // prettier-ignore

export function parseOffset(s: string): { value: number; unit: Unit } | null {
	const m = /^(1w|3d|2d|1d|2h|15min)$/.exec(s.trim().toLowerCase());
	if (!m) return null;
	const t = m[1] as Offset;
	return t === '15min' ? { value: 15, unit: 'minute' } : { value: Number(t[0]), unit: ({ w: 'week', d: 'day', h: 'hour' } as const)[t[1] as 'w' | 'd' | 'h'] }; // prettier-ignore
}
export const offsetOf = (value: number, unit: Unit): Offset | null =>
	OFFSETS.find((o) => {
		const p = parseOffset(o);
		return p?.value === value && p.unit === unit;
	}) ?? null;

const MS: Record<Unit, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 };
export const offsetMs = (value: number, unit: Unit) => value * MS[unit];

/** D-13: an all-day item's reference time is 09:00 local on its date, so "1d" = 09:00 the day before */
export const ALL_DAY_REF = '09:00';

/** the instant an item "happens" (UTC Z): its date + time in the owner's tz, all-day = 09:00 */
export function itemRef(date: string, time: string | null, tz: string): string {
	return localToUtc(date, time ?? ALL_DAY_REF, tz);
}
