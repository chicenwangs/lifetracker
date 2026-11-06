// Plan-ahead (Settings > Preferences). Pure: which day Home's planner opens on when no ?d= given.
// night: once today's last thing is over, open tomorrow (plan before bed).
// morning / off / not picked: always today.
import { addDays, dayBoundsUtc, isoPlus, localToUtc, minutesOf } from './time';

export type PlanMode = 'night' | 'morning' | 'off' | null;

export interface Span {
	startAt: string; // UTC Z
	endAt: string; // UTC Z
}
export interface TimedItem {
	date: string | null;
	time: string | null;
}

const TIMED_ITEM_MIN = 60;

/** Spans for timed items (items have no end time -> 60 min). */
export function itemSpans(items: TimedItem[], tz: string): Span[] {
	const out: Span[] = [];
	for (const i of items) {
		if (!i.date || !i.time) continue;
		const s = localToUtc(i.date, minutesOf(i.time), tz);
		out.push({ startAt: s, endAt: isoPlus(s, TIMED_ITEM_MIN * 60_000) });
	}
	return out;
}

/**
 * Last item of today = latest end among things that START today and END by midnight.
 * Overnight blocks (Sleep 23:00-06:00) are ignored, so planning before bed still flips.
 * Nothing scheduled today -> stay on today.
 */
export function planDay(
	mode: PlanMode,
	today: string,
	tz: string,
	spans: Span[],
	nowMs: number = Date.now(),
): string {
	if (mode !== 'night') return today;
	const t = dayBoundsUtc(today, tz);
	const tomorrow = addDays(today, 1);
	const n = dayBoundsUtc(tomorrow, tz);
	let lastEnd = -Infinity;
	let firstTomorrow = Infinity;
	for (const s of spans) {
		const a = Date.parse(s.startAt);
		const b = Date.parse(s.endAt);
		if (a >= Date.parse(t.start) && a < Date.parse(t.end) && b <= Date.parse(t.end))
			lastEnd = Math.max(lastEnd, b);
		if (a >= Date.parse(n.start) && a < Date.parse(n.end)) firstTomorrow = Math.min(firstTomorrow, a);
	}
	if (lastEnd === -Infinity) return today;
	return nowMs >= lastEnd && nowMs < firstTomorrow ? tomorrow : today;
}
