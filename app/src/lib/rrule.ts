// Repeating items (RFC 5545 RRULE subset, #72). Pure, shared client + server.
// All dates are owner-local 'YYYY-MM-DD' (never new Date('YYYY-MM-DD')).
import { addDays, isDate, makeDate, weekdayOf } from './time';

export const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Freq = (typeof FREQS)[number];

export const WD_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WdCode = (typeof WD_CODES)[number];
export const WD_SHORT: Record<WdCode, string> = {
	MO: 'Mon',
	TU: 'Tue',
	WE: 'Wed',
	TH: 'Thu',
	FR: 'Fri',
	SA: 'Sat',
	SU: 'Sun',
};
export const WD_LONG: Record<WdCode, string> = {
	MO: 'Monday',
	TU: 'Tuesday',
	WE: 'Wednesday',
	TH: 'Thursday',
	FR: 'Friday',
	SA: 'Saturday',
	SU: 'Sunday',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];

export interface ParsedRRule {
	freq: Freq;
	interval: number;
	/** WEEKLY: ['MO','WE'] · MONTHLY: ['3TU'] or ['-1FR'] */
	byday?: string[];
	/** MONTHLY: 1..31 */
	bymonthday?: number;
	/** inclusive YYYY-MM-DD */
	until?: string;
	/** total occurrences 1..999 */
	count?: number;
}

export function splitOccId(raw: string): { id: string; occDate: string | null } {
	const at = raw.indexOf('@');
	if (at < 0) return { id: raw, occDate: null };
	const id = raw.slice(0, at);
	const occDate = raw.slice(at + 1);
	return isDate(occDate) ? { id, occDate } : { id: raw, occDate: null };
}

export const baseItemId = (raw: string): string => splitOccId(raw).id;

export function parseExdates(raw: string | readonly string[] | null | undefined): string[] {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string' && isDate(x));
	try {
		const a = JSON.parse(raw as string);
		return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && isDate(x)) : [];
	} catch {
		return [];
	}
}

export function parseRRule(raw: string | null | undefined): ParsedRRule | null {
	if (!raw || typeof raw !== 'string') return null;
	const parts = raw
		.trim()
		.toUpperCase()
		.replace(/^RRULE:/, '')
		.split(';')
		.filter(Boolean);
	let freq: Freq | null = null;
	let interval = 1;
	let byday: string[] | undefined;
	let bymonthday: number | undefined;
	let until: string | undefined;
	let count: number | undefined;

	for (const p of parts) {
		const eq = p.indexOf('=');
		if (eq < 0) return null;
		const k = p.slice(0, eq);
		const v = p.slice(eq + 1);
		if (k === 'FREQ') {
			if (!FREQS.includes(v as Freq)) return null;
			freq = v as Freq;
		} else if (k === 'INTERVAL') {
			const n = Number(v);
			if (!Number.isInteger(n) || n < 1 || n > 99) return null;
			interval = n;
		} else if (k === 'BYDAY') {
			const list = v.split(',').filter(Boolean);
			if (!list.length || !list.every((d) => /^(-1|[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/.test(d))) return null;
			byday = list;
		} else if (k === 'BYMONTHDAY') {
			const n = Number(v);
			if (!Number.isInteger(n) || n < 1 || n > 31) return null;
			bymonthday = n;
		} else if (k === 'UNTIL') {
			const d = /^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
			if (!isDate(d)) return null;
			until = d;
		} else if (k === 'COUNT') {
			const n = Number(v);
			if (!Number.isInteger(n) || n < 1 || n > 999) return null;
			count = n;
		} else {
			return null;
		}
	}
	if (!freq) return null;
	if (until && count) return null;
	return { freq, interval, byday, bymonthday, until, count };
}

export function formatRRule(r: ParsedRRule): string {
	const out = [`FREQ=${r.freq}`];
	if (r.interval > 1) out.push(`INTERVAL=${r.interval}`);
	if (r.byday?.length) out.push(`BYDAY=${r.byday.join(',')}`);
	if (r.bymonthday) out.push(`BYMONTHDAY=${r.bymonthday}`);
	if (r.until) out.push(`UNTIL=${r.until}`);
	else if (r.count) out.push(`COUNT=${r.count}`);
	return out.join(';');
}

function dateParts(date: string): [number, number, number] {
	return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}

function daysInMonth(y: number, m: number): number {
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function nthWeekdayOfDate(date: string): {
	nth: number;
	isLast: boolean;
	wd: WdCode;
	token: string;
	label: string;
} {
	const [, m, d] = dateParts(date);
	const wd = WD_CODES[weekdayOf(date) - 1] as WdCode;
	const nth = Math.floor((d - 1) / 7) + 1;
	const nextWeek = addDays(date, 7);
	const isLast = Number(nextWeek.slice(5, 7)) !== m;
	const token = nth >= 5 || isLast ? `${nth === 5 ? -1 : nth}${wd}` : `${nth}${wd}`;
	const ord = nth === 5 ? 'last' : (ORD[nth] ?? `${nth}th`);
	return { nth, isLast, wd, token, label: `${ord} ${WD_LONG[wd]}` };
}

export function presetsForDate(date: string): { value: string; label: string }[] {
	const [, m, d] = dateParts(date);
	const wd = WD_CODES[weekdayOf(date) - 1] as WdCode;
	const nth = nthWeekdayOfDate(date);
	return [
		{ value: '', label: 'Does not repeat' },
		{ value: 'FREQ=DAILY', label: 'Daily' },
		{ value: `FREQ=WEEKLY;BYDAY=${wd}`, label: `Weekly on ${WD_LONG[wd]}` },
		{ value: `FREQ=MONTHLY;BYMONTHDAY=${d}`, label: `Monthly on day ${d}` },
		{ value: `FREQ=MONTHLY;BYDAY=${nth.token}`, label: `Monthly on the ${nth.label}` },
		{ value: 'FREQ=YEARLY', label: `Yearly on ${MONTHS[m - 1]} ${d}` },
		{ value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Every weekday (Mon–Fri)' },
	];
}

export function describeRRule(raw: string | null | undefined): string {
	const r = parseRRule(raw);
	if (!r) return 'Does not repeat';
	let base: string;
	if (r.freq === 'DAILY') {
		base = r.interval === 1 ? 'Daily' : `Every ${r.interval} days`;
	} else if (r.freq === 'WEEKLY') {
		const days = r.byday?.map((c) => WD_SHORT[c.slice(-2) as WdCode] ?? c).join(', ');
		if (r.interval === 1 && r.byday?.join(',') === 'MO,TU,WE,TH,FR') base = 'Every weekday';
		else if (r.interval === 1) base = days ? `Weekly on ${days}` : 'Weekly';
		else base = `Every ${r.interval} weeks${days ? ` on ${days}` : ''}`;
	} else if (r.freq === 'MONTHLY') {
		let on = '';
		if (r.bymonthday) on = ` on day ${r.bymonthday}`;
		else if (r.byday?.[0]) {
			const m = /^(-1|[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/.exec(r.byday[0]);
			if (m) {
				const n = m[1] === '-1' ? 'last' : (ORD[Number(m[1] || 1)] ?? '');
				on = ` on the ${n} ${WD_SHORT[m[2] as WdCode]}`.replace(/\s+/g, ' ');
			}
		}
		base = (r.interval === 1 ? 'Monthly' : `Every ${r.interval} months`) + on;
	} else {
		base = r.interval === 1 ? 'Yearly' : `Every ${r.interval} years`;
	}
	if (r.until) base += ` · until ${r.until}`;
	else if (r.count) base += ` · ${r.count} times`;
	return base;
}

function nthWeekdayInMonth(y: number, m: number, nth: number, wdIdx: number): string | null {
	if (nth === -1) {
		const lastD = daysInMonth(y, m);
		const lastDate = makeDate(y, m, lastD);
		const lastWd = weekdayOf(lastDate);
		const diff = (lastWd - wdIdx + 7) % 7;
		return makeDate(y, m, lastD - diff);
	}
	const firstDate = makeDate(y, m, 1);
	const firstWd = weekdayOf(firstDate);
	const delta = (wdIdx - firstWd + 7) % 7;
	const d = 1 + delta + (nth - 1) * 7;
	return d <= daysInMonth(y, m) ? makeDate(y, m, d) : null;
}

/**
 * Expand a repeating item's occurrence start dates whose span `[occ, occ + spanDays]` overlaps `[from, to)`.
 * Always capped so long ranges cannot hang.
 */
export function expandRRule(
	startDate: string,
	raw: string,
	exdates: readonly string[],
	from: string,
	to: string,
	spanDays = 0,
): string[] {
	const r = parseRRule(raw);
	if (!r || !isDate(startDate) || startDate >= to) return [];
	if (r.until && addDays(r.until, spanDays) < from) return [];
	const ex = new Set(exdates);
	const out: string[] = [];
	const maxCount = r.count ?? 2000;
	let seen = 0;

	const consider = (d: string): boolean => {
		if (d < startDate) return true;
		if (r.until && d > r.until) return false;
		seen++;
		if (!ex.has(d) && d < to && addDays(d, spanDays) >= from) out.push(d);
		return seen < maxCount && d < to;
	};

	if (r.freq === 'DAILY') {
		let cur = startDate;
		for (let step = 0; step < 2000; step++) {
			if (!consider(cur)) break;
			cur = addDays(cur, r.interval);
		}
	} else if (r.freq === 'WEEKLY') {
		const wds = r.byday?.length
			? r.byday
					.map((c) => WD_CODES.indexOf(c.slice(-2) as WdCode) + 1)
					.filter((n) => n >= 1)
					.sort((a, b) => a - b)
			: [weekdayOf(startDate)];
		const startMon = addDays(startDate, 1 - weekdayOf(startDate));
		outer: for (let wk = 0; wk < 1000; wk++) {
			const mon = addDays(startMon, wk * 7 * r.interval);
			if (mon >= to && seen > 0) break;
			for (const wd of wds) {
				const d = addDays(mon, wd - 1);
				if (!consider(d)) break outer;
			}
		}
	} else if (r.freq === 'MONTHLY') {
		const [y0, m0, d0] = dateParts(startDate);
		const byDayMatch = r.byday?.[0] ? /^(-1|[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/.exec(r.byday[0]) : null;
		for (let k = 0; k < 600; k++) {
			const totalM = y0 * 12 + (m0 - 1) + k * r.interval;
			const y = Math.floor(totalM / 12);
			const m = (totalM % 12) + 1;
			let d: string | null;
			if (byDayMatch) {
				const nth = byDayMatch[1] ? Number(byDayMatch[1]) : 1;
				const wdIdx = WD_CODES.indexOf(byDayMatch[2] as WdCode) + 1;
				d = nthWeekdayInMonth(y, m, nth, wdIdx);
			} else {
				const targetD = Math.min(r.bymonthday ?? d0, daysInMonth(y, m));
				d = makeDate(y, m, targetD);
			}
			if (!d) continue;
			if (!consider(d)) break;
		}
	} else {
		const [y0, m0, d0] = dateParts(startDate);
		for (let k = 0; k < 200; k++) {
			const y = y0 + k * r.interval;
			const targetD = Math.min(d0, daysInMonth(y, m0));
			const d = makeDate(y, m0, targetD);
			if (!consider(d)) break;
		}
	}
	return out;
}

/** Return a copy of `raw` with `UNTIL=untilDate` (and `COUNT` removed), used when splitting "this and following". */
export function withUntil(raw: string, untilDate: string): string {
	const r = parseRRule(raw);
	if (!r) return raw;
	return formatRRule({ ...r, until: untilDate, count: undefined });
}
