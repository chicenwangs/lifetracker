// Quick add parser (FR-Q1..Q3c, TECHNICAL §8, rev 2026-11-06b "planner first").
// PURE: client preview + server (truth) use the same code. Never throws; problems[] only shown on Enter.
//
// Any order:  title  day  time  [/type]  [/calendar | /both]
// · No destination = PLANNER ONLY (a time block, keeps the month calendar clean). Needs a time.
// · /calendar = calendar item only (big events, time optional). /both = calendar item + linked planner block.
// · Options start with `/`; unknown `/x` = problem. `#x` is just part of the title.
// · Days, times and their little words (on, at, by, from) need no prefix. LAST day wins, LAST time wins.
// · Day words tolerate common typos (tommorow, wensday, febuary …) and punctuation (tomorrow, / fri.).
// · Planner times snap to 15 min; single time = ctx.blockMin (60); end <= start = crosses midnight.
// · v2: types, default type, default destination, block length and date order come from ctx (user prefs).
//   Missing ctx fields = v1.1.0 behaviour.
import { addDays, hhmm, isDate, makeDate, weekdayOf } from './time';
import type { ItemType, ItemTypeDTO } from './types';
import { defaultTypes, slugMap } from './itemtypes';

export interface QAContext {
	today: string; // local YYYY-MM-DD
	nowMinutes: number; // local minutes since 00:00
	/** drag-created range on a timeline: used when the text has no day / no time of its own (typed ones win) */
	slot?: QASlot;
	/** the user's item types (default: the 5 built-ins) */
	types?: Pick<ItemTypeDTO, 'key' | 'slug' | 'name' | 'isDefault'>[];
	/** no destination typed: 'planner' (default) or 'calendar' */
	qaTarget?: 'planner' | 'calendar';
	/** single time = this many minutes (default 60) */
	blockMin?: number;
	/** 'us' reads 11/16 as M/D first (default 'my' = D/M) */
	region?: 'my' | 'us';
}
export interface QASlot {
	date: string; // local YYYY-MM-DD
	start: number; // minutes from 00:00
	end: number; // minutes from the start day's 00:00 (> 1440 = next day)
	/** day only (month cell double-click): no time from the slot, defaults to the calendar */
	day?: boolean;
}
export type QATarget = 'planner' | 'calendar' | 'both';
export interface QAParse {
	ok: boolean; // = problems.length === 0
	title: string;
	type: ItemType;
	typeSet: boolean;
	target: QATarget;
	targetSet: boolean;
	date: string;
	dateSet: boolean;
	/** start HH:MM (snapped when a block is made) or null = all day */
	time: string | null;
	startMinutes: number | null;
	/** block only (planner/both): end minutes from the start day's 00:00 (> 1440 = next day) */
	endMinutes: number | null;
	endTime: string | null;
	endNextDay: boolean;
	/** time came from the dragged slot (no time typed) */
	fromSlot: boolean;
	notes: string[]; // informational, e.g. "rounded to 15 min"
	warnings: string[]; // shown with the result, never block
	problems: string[]; // shown on Enter; `code` in backticks
}

// ---------- vocabulary ----------

export const TARGET_WORDS: Record<string, QATarget> = {
	planner: 'planner',
	plan: 'planner',
	timeline: 'planner',
	block: 'planner',
	calendar: 'calendar',
	cal: 'calendar',
	both: 'both',
};

const W_TODAY = new Set([
	'today',
	'tdy',
	'tday',
	'2day',
	'todya',
	'tdoay',
	'tody',
	'todat',
	'tonight',
	'tonite',
	'tnite',
	'tonigh',
	'tonght',
]);
const W_TMR = new Set(
	(
		'tmr tmrw tmw tmro tmrow tmrrw tmrw tomo tomoz tmoro 2moro 2morro 2morrow 2mrw 2mro tomorrow tomorow ' +
		'tommorow tommorrow tomorro tomrrow tomorrw tomarrow tommarow tomoro tomrw tommorw tomorrrow tomrow tmrww'
	).split(' '),
);
const W_YDAY = new Set(['yesterday', 'yday', 'ystd', 'yest', 'yesterdy', 'yesturday', 'yestarday', 'ytd']);
const PART_OF_DAY = new Set(['morning', 'afternoon', 'evening', 'arvo', 'night']);

const WEEKDAY_WORDS: Record<string, number> = {};
(
	[
		[1, 'mon monday mondy monady mnday mondya'],
		[2, 'tue tues tuesday tuseday teusday tusday tuesdy tueday'],
		[3, 'wed weds wednes wednesday wensday wendsday wedensday wednsday wednseday wedsday wednesdy wedneday'],
		[4, 'thu thur thurs thrs thursday thrusday thursady tursday thurday thurdsay thursdy'],
		[5, 'fri friday fridy firday frday fryday fridya'],
		[6, 'sat saturday saterday satruday saturaday satuday satday saturdy'],
		[7, 'sun sunday sundy sunady snday sundya'],
	] as const
).forEach(([n, words]) => words.split(' ').forEach((w) => (WEEKDAY_WORDS[w] = n)));
const WEEKDAY_FUZZY: [string, number][] = [
	['tuesday', 2],
	['wednesday', 3],
	['thursday', 4],
	['saturday', 6],
];

const MONTH_WORDS: Record<string, number> = {};
(
	[
		[1, 'jan january janurary janury januray'],
		[2, 'feb february febuary feburary febrary febraury'],
		[3, 'mar march'],
		[4, 'apr april'],
		[5, 'may'],
		[6, 'jun june'],
		[7, 'jul july'],
		[8, 'aug august agust augst auguest'],
		[9, 'sep sept september septmber setpember'],
		[10, 'oct october ocotber octobre'],
		[11, 'nov november novmber novemeber novembre'],
		[12, 'dec december decmber decemeber decembre'],
	] as const
).forEach(([n, words]) => words.split(' ').forEach((w) => (MONTH_WORDS[w] = n)));
const MONTH_FUZZY: [string, number][] = [
	['january', 1],
	['february', 2],
	['september', 9],
	['october', 10],
	['november', 11],
	['december', 12],
];

const NUMBER_WORDS: Record<string, number> = {
	a: 1,
	an: 1,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
};
type Unit = 'day' | 'week' | 'month';
const UNIT_WORDS: Record<string, [Unit, number]> = {
	day: ['day', 1],
	days: ['day', 1],
	week: ['week', 1],
	weeks: ['week', 1],
	wk: ['week', 1],
	wks: ['week', 1],
	fortnight: ['week', 2],
	fortnights: ['week', 2],
	month: ['month', 1],
	months: ['month', 1],
};
const RANGE_SEP = new Set(['to', 'till', 'til', 'until', '-', '–', '—']);
const PREPS = new Set(['on', 'at', 'by', 'from', 'between', 'around', '@']);

const DAYNUM = /^(\d{1,2})(st|nd|rd|th)?$/;
const ORDINAL = /^(\d{1,2})(st|nd|rd|th)$/;
const YEAR = /^(19|20)\d\d$/;
const T12 = /^(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?(am|pm)$/;
const T24 = /^([01]?\d|2[0-3])[:.h]([0-5]\d)$/;
const HM_NOSUFFIX = /^(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?$/;
const DM = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DUR_H = /^(\d+(?:\.\d+)?)(?:h|hr|hrs|hour|hours)(?:(\d{1,2})(?:m|min|mins)?)?$/;
const DUR_M = /^(\d+)(?:m|min|mins|minute|minutes)$/;

// ---------- small helpers ----------

/** own-property lookup: "constructor" / "__proto__" are plain title words, never dictionary hits */
function own<T>(map: Record<string, T>, k: string | undefined): T | undefined {
	return k !== undefined && Object.hasOwn(map, k) ? map[k] : undefined;
}

/** lower-case, strip wrapping punctuation: "Tomorrow," -> "tomorrow", "(fri)" -> "fri". Keeps inner dots (14.30). */
function norm(t: string): string {
	return t
		.toLowerCase()
		.replace(/^[("'[]+/, '')
		.replace(/[)"'\],;:!?]+$/, '')
		.replace(/\.$/, '');
}
/** optimal string alignment distance (Levenshtein + adjacent swap) */
function osa(a: string, b: string): number {
	const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const row = d[i] as number[];
			const prev = d[i - 1] as number[];
			row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
				row[j] = Math.min(row[j] ?? 0, ((d[i - 2] as number[])[j - 2] ?? 0) + 1);
		}
	return (d[a.length] as number[])[b.length] ?? 99;
}
function isTomorrow(t: string | undefined): boolean {
	if (!t) return false;
	if (W_TMR.has(t)) return true;
	return t.length >= 6 && t.length <= 10 && t[0] === 't' && osa(t, 'tomorrow') <= 2;
}
function isToday(t: string | undefined): boolean {
	if (!t) return false;
	if (W_TODAY.has(t)) return true;
	return t.length >= 6 && t.length <= 8 && t.startsWith('to') && osa(t, 'tonight') <= 1;
}
function isYesterday(t: string | undefined): boolean {
	if (!t) return false;
	if (W_YDAY.has(t)) return true;
	return t.length >= 7 && t.length <= 11 && t[0] === 'y' && osa(t, 'yesterday') <= 2;
}
function weekdayOfWord(t: string | undefined): number | null {
	if (!t) return null;
	const w = own(WEEKDAY_WORDS, t);
	if (w) return w;
	if (t.length < 7) return null;
	if (t.endsWith('s') && own(WEEKDAY_WORDS, t.slice(0, -1))) return null; // plural "tuesdays" = not a date
	for (const [full, n] of WEEKDAY_FUZZY)
		if (t[0] === full[0] && osa(t, full) <= (full.length >= 9 ? 2 : 1)) return n;
	return null;
}
function monthOfWord(t: string | undefined): number | null {
	if (!t) return null;
	const m = own(MONTH_WORDS, t);
	if (m) return m;
	if (t.length < 6) return null;
	for (const [full, n] of MONTH_FUZZY) if (t[0] === full[0] && osa(t, full) <= 1) return n;
	return null;
}
function numberOf(t: string | undefined): number | null {
	if (!t) return null;
	if (/^\d{1,3}$/.test(t)) return Number(t);
	return own(NUMBER_WORDS, t) ?? null;
}
const ampmOf = (t: string | undefined): 'am' | 'pm' | null => {
	const x = (t ?? '').replace(/\./g, '');
	return x === 'am' || x === 'pm' ? x : null;
};

function ymd(y: number, m: number, d: number): string | null {
	const s = makeDate(y, m, d);
	return isDate(s) && s === `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` ? s : null;
}
function parts(date: string): [number, number, number] {
	return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}
function lastDayOfMonth(y: number, m: number): string {
	for (let d = 31; d >= 28; d--) {
		const s = ymd(y, m, d);
		if (s) return s;
	}
	return makeDate(y, m, 28);
}
function addMonths(date: string, n: number): string {
	const [y, m, d] = parts(date);
	const t = y * 12 + (m - 1) + n;
	const ny = Math.floor(t / 12);
	const nm = (t % 12) + 1;
	return ymd(ny, nm, d) ?? lastDayOfMonth(ny, nm);
}
const mondayOfWeek = (date: string) => addDays(date, 1 - weekdayOf(date));

/** one time token -> minutes. `fallback` am/pm lets "6 to 10pm" read the 6 as 6pm. */
function timeOf(raw: string, fallback?: 'am' | 'pm' | null): number | null {
	const t = raw.replace(/(\d)([ap])\.m\.?$/, '$1$2m');
	let m: RegExpExecArray | null;
	if ((m = T12.exec(t))) return ((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2] ?? 0);
	if ((m = T24.exec(t))) return Number(m[1]) * 60 + Number(m[2]);
	if (t === 'noon' || t === 'midday' || t === '12noon') return 720;
	if (t === 'midnight') return 0;
	if (fallback && (m = HM_NOSUFFIX.exec(t)))
		return ((Number(m[1]) % 12) + (fallback === 'pm' ? 12 : 0)) * 60 + Number(m[2] ?? 0);
	return null;
}
/** time starting at token i: "6pm" | "6 pm" | "6:30 p.m." -> [minutes, tokens used] */
function timeAt(low: string[], i: number, fallback?: 'am' | 'pm' | null): [number, number] | null {
	const t = low[i] ?? '';
	const ap = ampmOf(low[i + 1]);
	if (ap && HM_NOSUFFIX.test(t)) {
		const v = timeOf(t + ap);
		if (v !== null) return [v, 2];
	}
	const v = timeOf(t, fallback);
	return v === null ? null : [v, 1];
}
const wrap = (v: number | null): [number, number] | null => (v === null ? null : [v, 1]);
/** forward gap in minutes on a 24 h clock (0 counts as a full day) */
const fwd = (from: number, to: number) => (((to - from) % 1440) + 1440) % 1440 || 1440;
/** of two readings of a bare time, the one closest to `ref` (after it, or before it) */
function soonest(
	ref: number,
	am: [number, number] | null,
	pm: [number, number] | null,
	dir: 'after' | 'before',
): [number, number] | null {
	if (!am || !pm) return am ?? pm;
	const g = (x: [number, number]) => (dir === 'after' ? fwd(ref, x[0]) : fwd(x[0], ref));
	return g(am) <= g(pm) ? am : pm;
}
/** "for 2h" "for 90m" "for 1h30" "for 2 hours" "for an hour" "for half an hour" -> [minutes, tokens after "for"] */
function durationAt(low: string[], i: number): [number, number] | null {
	const a = low[i] ?? '';
	const b = low[i + 1];
	let m: RegExpExecArray | null;
	if ((m = DUR_H.exec(a))) return [Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0)), 1];
	if ((m = DUR_M.exec(a))) return [Number(m[1]), 1];
	if (a === 'half' && (b === 'an' || b === 'a') && /^(hour|hr)$/.test(low[i + 2] ?? '')) return [30, 3];
	const n = /^\d+(\.\d+)?$/.test(a) ? Number(a) : own(NUMBER_WORDS, a);
	if (n && b) {
		if (/^(h|hr|hrs|hour|hours)$/.test(b)) return [Math.round(n * 60), 2];
		if (/^(m|min|mins|minute|minutes)$/.test(b)) return [Math.round(n), 2];
	}
	return null;
}

// ---------- parser ----------

type DateHit = {
	idx: number[];
	resolve: (timePassed: boolean) => string | null;
	explicit?: boolean; // names a calendar date (16 nov, 16/11, 2026-11-16, the 16th)
	weekday?: number; // weekday-only hit (mergeable into an explicit date: "mon 16 nov")
	checkWeekday?: number;
};
type TimeHit = { idx: number[]; start: number; end: number | null };
const range = (from: number, len: number) => Array.from({ length: len }, (_, k) => from + k);
const snap = (min: number) => Math.round(min / 15) * 15;

export function parseQuickAdd(text: string, ctx: QAContext): QAParse {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	const low = tokens.map(norm);
	const used = new Set<number>(); // tokens that are NOT title
	const problems: string[] = [];
	const warnings: string[] = [];
	const notes: string[] = [];
	const today = ctx.today;
	const todayWd = weekdayOf(today);
	const types = ctx.types ?? defaultTypes();
	const TYPE_WORDS = slugMap(types);

	let type: ItemType | null = null;
	const targets = new Set<QATarget>();
	let dur: number | null = null;
	let allDay = false;
	const dates: DateHit[] = [];
	const times: TimeHit[] = [];

	const nextOccurrence = (wd: number, timePassed: boolean) => {
		let delta = (wd - todayWd + 7) % 7;
		if (delta === 0 && timePassed) delta = 7;
		return addDays(today, delta);
	};
	const dayOfMonth = (d: number) => {
		const [y, m] = parts(today);
		for (let k = 0; k < 13; k++) {
			const t = (y * 12 + (m - 1) + k) as number;
			const s = ymd(Math.floor(t / 12), (t % 12) + 1, d);
			if (s && s >= today) return s;
		}
		return null;
	};
	const calendarDate = (d: number, m: number, y?: number) => {
		if (y !== undefined) return ymd(y < 100 ? 2000 + y : y, m, d);
		const y0 = Number(today.slice(0, 4));
		let s = ymd(y0, m, d);
		if (s && s < today) s = ymd(y0 + 1, m, d);
		if (!s && m === 2 && d === 29) s = ymd(y0 + 1, 2, 29) ?? ymd(y0 + 2, 2, 29) ?? ymd(y0 + 3, 2, 29);
		return s;
	};
	const pushDate = (h: DateHit) => dates.push(h);

	for (let i = 0; i < low.length; i++) {
		const t = low[i] ?? '';
		const n1 = low[i + 1];
		const n2 = low[i + 2];
		const n3 = low[i + 3];
		const raw = tokens[i] ?? '';

		// --- /options (raw token, case-insensitive) ---
		if (raw.startsWith('/') && !/^\/\d/.test(raw)) {
			const k = raw
				.slice(1)
				.toLowerCase()
				.replace(/[,.;:!?]+$/, '');
			if (!k) {
				used.add(i);
				continue;
			}
			if (!k.includes('/')) {
				if (own(TYPE_WORDS, k)) type = own(TYPE_WORDS, k) ?? null;
				else if (own(TARGET_WORDS, k)) targets.add(own(TARGET_WORDS, k) as QATarget);
				else problems.push(`\`${raw}\` isn't an option. Type \`/\` to see the list.`);
				used.add(i);
				continue;
			}
		}
		if (raw.startsWith('#') && raw.length > 1) continue; // "#spot" stays in the title

		// --- all day ---
		if ((t === 'all' && n1 === 'day') || t === 'allday' || t === 'all-day') {
			allDay = true;
			const len = t === 'all' ? 2 : 1;
			range(i, len).forEach((k) => used.add(k));
			i += len - 1;
			continue;
		}

		// --- relative phrases ---
		if (t === 'the' && n1 === 'day' && n2 === 'after' && isTomorrow(n3)) {
			pushDate({ idx: range(i, 4), resolve: () => addDays(today, 2) });
			i += 3;
			continue;
		}
		if (t === 'day' && n1 === 'after' && isTomorrow(n2)) {
			pushDate({ idx: range(i, 3), resolve: () => addDays(today, 2) });
			i += 2;
			continue;
		}
		if (t === 'overmorrow') {
			pushDate({ idx: [i], resolve: () => addDays(today, 2) });
			continue;
		}
		if (t === 'this' && n1 && PART_OF_DAY.has(n1)) {
			pushDate({ idx: [i, i + 1], resolve: () => today });
			i++;
			continue;
		}
		if ((isTomorrow(t) || isToday(t)) && n1 && PART_OF_DAY.has(n1)) {
			const d = isTomorrow(t) ? addDays(today, 1) : today;
			pushDate({ idx: [i, i + 1], resolve: () => d });
			i++;
			continue;
		}
		if (t === 'in' && numberOf(n1) !== null && n2 && own(UNIT_WORDS, n2)) {
			const [u, mult] = own(UNIT_WORDS, n2) as [Unit, number];
			const n = (numberOf(n1) as number) * mult;
			const d = u === 'month' ? addMonths(today, n) : addDays(today, u === 'week' ? 7 * n : n);
			pushDate({ idx: range(i, 3), resolve: () => d });
			i += 2;
			continue;
		}
		if (numberOf(t) !== null && n1 && own(UNIT_WORDS, n1) && n2 === 'from' && n3) {
			const base = n3 === 'now' || isToday(n3) ? today : isTomorrow(n3) ? addDays(today, 1) : null;
			if (base) {
				const [u, mult] = own(UNIT_WORDS, n1) as [Unit, number];
				const n = (numberOf(t) as number) * mult;
				const d = u === 'month' ? addMonths(base, n) : addDays(base, u === 'week' ? 7 * n : n);
				pushDate({ idx: range(i, 4), resolve: () => d });
				i += 3;
				continue;
			}
		}
		// next week [wd] · this week [wd] · next weekend · (this) weekend · next month · end of (the) month
		if ((t === 'next' || t === 'this') && n1 === 'week') {
			const wd = weekdayOfWord(n2);
			const mon = addDays(mondayOfWeek(today), t === 'next' ? 7 : 0);
			if (wd) {
				pushDate({ idx: range(i, 3), resolve: () => addDays(mon, wd - 1) });
				i += 2;
				continue;
			}
			if (t === 'next') {
				pushDate({ idx: [i, i + 1], resolve: () => mon });
				i++;
				continue;
			}
		}
		{
			const wd = weekdayOfWord(t);
			if (wd && (n1 === 'next' || n1 === 'this') && n2 === 'week') {
				const mon = addDays(mondayOfWeek(today), n1 === 'next' ? 7 : 0);
				pushDate({ idx: range(i, 3), resolve: () => addDays(mon, wd - 1) });
				i += 2;
				continue;
			}
		}
		if (t === 'next' && n1 === 'weekend') {
			pushDate({ idx: [i, i + 1], resolve: () => addDays(mondayOfWeek(today), 12) });
			i++;
			continue;
		}
		if ((t === 'this' || t === 'the') && n1 === 'weekend') {
			pushDate({ idx: [i, i + 1], resolve: () => (todayWd === 7 ? today : nextOccurrence(6, false)) });
			i++;
			continue;
		}
		if (t === 'weekend') {
			pushDate({ idx: [i], resolve: () => (todayWd === 7 ? today : nextOccurrence(6, false)) });
			continue;
		}
		if (t === 'next' && n1 === 'month') {
			const [y, m] = parts(addMonths(today, 1));
			pushDate({ idx: [i, i + 1], resolve: () => makeDate(y, m, 1) });
			i++;
			continue;
		}
		if (t === 'end' && n1 === 'of' && (n2 === 'month' || (n2 === 'the' && n3 === 'month'))) {
			const len = n2 === 'the' ? 4 : 3;
			const [y, m] = parts(today);
			pushDate({ idx: range(i, len), resolve: () => lastDayOfMonth(y, m) });
			i += len - 1;
			continue;
		}
		if (t === 'eom') {
			const [y, m] = parts(today);
			pushDate({ idx: [i], resolve: () => lastDayOfMonth(y, m) });
			continue;
		}

		// --- next/this weekday ---
		if (t === 'next' || t === 'this') {
			let j = i;
			let n = 0;
			if (t === 'this') j = i + 1;
			else
				while (low[j] === 'next') {
					n++;
					j++;
				}
			const wd = weekdayOfWord(low[j]);
			if (wd) {
				const nexts = n;
				pushDate({
					idx: range(i, j - i + 1),
					resolve: (passed) => {
						if (!nexts) return nextOccurrence(wd, passed);
						let delta = (wd - todayWd + 7) % 7;
						if (delta === 0) delta = 7;
						return addDays(today, delta + 7 * (nexts - 1));
					},
				});
				i = j;
				continue;
			}
		}

		// --- single day words ---
		if (isToday(t)) {
			pushDate({ idx: [i], resolve: () => today });
			continue;
		}
		if (isTomorrow(t)) {
			pushDate({ idx: [i], resolve: () => addDays(today, 1) });
			continue;
		}
		if (isYesterday(t)) {
			pushDate({ idx: [i], resolve: () => addDays(today, -1) });
			continue;
		}

		// --- explicit dates ---
		if (YMD.test(t) && isDate(t)) {
			pushDate({ idx: [i], resolve: () => t, explicit: true });
			continue;
		}
		let m: RegExpExecArray | null;
		if ((m = DM.exec(t))) {
			let d = Number(m[1]);
			let mo = Number(m[2]);
			if (ctx.region === 'us') [d, mo] = [mo, d]; // read M/D first
			if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // the other order when this one can't be valid
			const y = m[3] ? Number(m[3]) : undefined;
			if (calendarDate(d, mo, y)) {
				pushDate({ idx: [i], resolve: () => calendarDate(d, mo, y), explicit: true });
				continue;
			}
		}
		// 16 nov · 16th nov · 16th of november · (+ 2027)
		if (DAYNUM.test(t)) {
			const ofSkip = n1 === 'of' ? 1 : 0;
			const mo = monthOfWord(low[i + 1 + ofSkip]);
			if (mo) {
				const d = Number(DAYNUM.exec(t)?.[1]);
				let len = 2 + ofSkip;
				const yTok = low[i + len];
				const y = yTok && YEAR.test(yTok) ? Number(yTok) : undefined;
				if (y !== undefined) len++;
				if (calendarDate(d, mo, y)) {
					pushDate({ idx: range(i, len), resolve: () => calendarDate(d, mo, y), explicit: true });
					i += len - 1;
					continue;
				}
			}
		}
		// nov 16 · november 16th · nov 16 2027
		{
			const mo = monthOfWord(t);
			if (mo && n1 && DAYNUM.test(n1)) {
				const d = Number(DAYNUM.exec(n1)?.[1]);
				let len = 2;
				const y = n2 && YEAR.test(n2) ? Number(n2) : undefined;
				if (y !== undefined) len++;
				if (calendarDate(d, mo, y)) {
					pushDate({ idx: range(i, len), resolve: () => calendarDate(d, mo, y), explicit: true });
					i += len - 1;
					continue;
				}
			}
		}
		// the 16th (of november) · on 16th
		if ((t === 'the' && n1 && ORDINAL.test(n1)) || (ORDINAL.test(t) && low[i - 1] === 'on')) {
			const k = t === 'the' ? i + 1 : i;
			const d = Number(ORDINAL.exec(low[k] ?? '')?.[1]);
			const mo = low[k + 1] === 'of' ? monthOfWord(low[k + 2]) : null;
			const len = k - i + 1 + (mo ? 2 : 0);
			const res = mo ? () => calendarDate(d, mo) : () => dayOfMonth(d);
			if (res()) {
				pushDate({ idx: range(i, len), resolve: res, explicit: true });
				i += len - 1;
				continue;
			}
		}

		// --- weekday ---
		{
			const wd = weekdayOfWord(t);
			if (wd) {
				pushDate({ idx: [i], resolve: (passed) => nextOccurrence(wd, passed), weekday: wd });
				continue;
			}
		}

		// --- duration: for 2h ---
		if (t === 'for') {
			const d = durationAt(low, i + 1);
			if (d) {
				dur = d[0];
				range(i, d[1] + 1).forEach((k) => used.add(k));
				i += d[1];
				continue;
			}
		}

		// --- time ranges ---
		const dash = t.split(/[-–—]/);
		if (dash.length === 2 && dash[0] && dash[1]) {
			let b = timeOf(dash[1]);
			const a0 = timeOf(dash[0]);
			if (b === null && a0 !== null) {
				const r = soonest(a0, wrap(timeOf(dash[1], 'am')), wrap(timeOf(dash[1], 'pm')), 'after');
				b = r ? r[0] : null;
			}
			const a =
				b === null
					? null
					: (a0 ??
						soonest(b, wrap(timeOf(dash[0], 'am')), wrap(timeOf(dash[0], 'pm')), 'before')?.[0] ??
						null);
			if (a !== null && b !== null) {
				times.push({ idx: [i], start: a, end: b });
				continue;
			}
		}
		// "6pm to 10pm" · "6 to 10pm" · "6 pm - 10 pm" · "between 6 and 8pm"
		{
			const aProbe = timeAt(low, i);
			const aLen = aProbe ? aProbe[1] : 1;
			const sep = low[i + aLen];
			const isSep = sep && (RANGE_SEP.has(sep) || (sep === 'and' && low[i - 1] === 'between'));
			if (isSep) {
				const j = i + aLen + 1;
				let b = timeAt(low, j);
				// bare end ("6pm to 8"): am or pm, whichever comes soonest after the start
				if (!b && aProbe) b = soonest(aProbe[0], timeAt(low, j, 'am'), timeAt(low, j, 'pm'), 'after');
				if (b) {
					// bare start ("9 to 5pm", "6 to 8pm"): am or pm, whichever ends soonest before the end
					const a = aProbe ?? soonest(b[0], timeAt(low, i, 'am'), timeAt(low, i, 'pm'), 'before');
					if (a) {
						const len = a[1] + 1 + b[1];
						times.push({ idx: range(i, len), start: a[0], end: b[0] });
						i += len - 1;
						continue;
					}
				}
			}
			if (aProbe) {
				times.push({ idx: range(i, aProbe[1]), start: aProbe[0], end: null });
				i += aProbe[1] - 1;
				continue;
			}
		}
	}

	// --- weekday next to an explicit date belongs to it: "mon 16 nov", "Monday, 16 November" ---
	for (const e of dates.filter((h) => h.explicit)) {
		const lo = Math.min(...e.idx);
		const hi = Math.max(...e.idx);
		const w = dates.find(
			(h) => h.weekday && (Math.max(...h.idx) === lo - 1 || Math.min(...h.idx) === hi + 1),
		);
		if (w) {
			e.idx = [...e.idx, ...w.idx];
			e.checkWeekday = w.weekday;
			dates.splice(dates.indexOf(w), 1);
		}
	}

	// --- time: last wins ---
	const th = times[times.length - 1];
	th?.idx.forEach((i) => used.add(i));
	let start = th && !allDay ? th.start : null;
	let end = th && !allDay ? th.end : null;
	if (start !== null && end === null && dur !== null) end = start + dur;
	const fromSlot = start === null && !allDay && !!ctx.slot && !ctx.slot.day;
	if (fromSlot && ctx.slot) {
		start = ctx.slot.start;
		end = ctx.slot.end;
	}

	// --- date: last valid wins ---
	const timePassed = start !== null && start <= ctx.nowMinutes;
	let date: string | null = null;
	for (let k = dates.length - 1; k >= 0 && !date; k--) {
		const h = dates[k];
		const d = h?.resolve(timePassed);
		if (h && d) {
			date = d;
			h.idx.forEach((i) => used.add(i));
			if (h.checkWeekday && weekdayOf(d) !== h.checkWeekday) {
				const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
				warnings.push(
					`${d.slice(8)}/${d.slice(5, 7)} is a ${names[weekdayOf(d)]}, not a ${names[h.checkWeekday]}.`,
				);
			}
		}
	}
	const dateSet = date !== null;
	date ??= ctx.slot?.date ?? today;

	// --- little words glued to a day/time: "on fri", "at 6pm", "from 6 to 8" ---
	for (let i = 0; i < low.length; i++) {
		if (used.has(i) || !PREPS.has(low[i] ?? '') || !used.has(i + 1)) continue;
		if ((tokens[i + 1] ?? '').startsWith('/')) continue;
		used.add(i);
	}

	// --- where it goes ---
	// a month day (no time) defaults to the calendar; everything else to the planner
	// a month day defaults to the calendar, a dragged time range to the planner, plain typing to the user's pref
	let target: QATarget = ctx.slot ? (ctx.slot.day ? 'calendar' : 'planner') : (ctx.qaTarget ?? 'planner');
	if (targets.has('both') || (targets.has('calendar') && targets.has('planner'))) target = 'both';
	else if (targets.has('calendar')) target = 'calendar';
	else if (targets.has('planner')) target = 'planner';
	const makesBlock = target !== 'calendar';

	let endNextDay = false;
	if (makesBlock) {
		if (start === null) {
			problems.push(
				target === 'both'
					? '`/both` also adds a planner block, so it needs a time. Add one like `3pm` or `3pm to 5pm`, or use `/calendar` on its own.'
					: 'Planner entries need a time. Add one like `3pm` or `3pm to 4pm`, or add `/calendar` to put it on the calendar without a time.',
			);
		} else {
			const s0 = start;
			const e0 = end;
			start = snap(start);
			if (start >= 1440 && s0 < 1440) start = 1425; // 23:55 rounds down, stays on the same day
			if (end !== null) end = snap(end);
			if (s0 !== start || (e0 !== null && e0 !== end)) notes.push('rounded to 15 min');
			if (end === null) {
				const len = ctx.blockMin ?? 60;
				end = start + len;
				notes.push(`${len} min default`);
			}
			// crosses midnight only if the typed end is really before the start (not just snapped onto it)
			if (end <= start) end += e0 !== null && e0 <= s0 ? 1440 : 0;
			if (end - start < 15) end = start + 15;
			if (start >= 1440) {
				// 23:55 snapped to 24:00 = next day 00:00
				start -= 1440;
				end -= 1440;
				date = addDays(date, 1);
			}
			if (end - start > 1440)
				problems.push('A planner block can be at most 24 hours. Shorten it, or split it.');
			endNextDay = end > 1440;
		}
	} else if (end !== null) {
		if (!fromSlot) notes.push('end time needs /both');
		end = null;
	}

	if (date < today) warnings.push('Date is in the past.');
	else if (date === today && timePassed) warnings.push('Time already passed today.');

	const title = tokens
		.filter((_, i) => !used.has(i))
		.join(' ')
		.replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
		.trim()
		.slice(0, 300);
	if (!tokens.length) problems.unshift('Type something to add, like `gym tmr 6pm to 8pm`.');
	else if (!title)
		problems.push(
			"Add a title first. Any words that aren't an option, day or time become the title, like `build planner website`.",
		);

	return {
		ok: problems.length === 0,
		title,
		type: type ?? types.find((t) => t.isDefault)?.key ?? types[0]?.key ?? 'Event',
		typeSet: type !== null,
		target,
		targetSet: targets.size > 0,
		date,
		dateSet,
		time: start === null ? null : hhmm(start),
		startMinutes: start,
		endMinutes: makesBlock ? end : null,
		endTime: makesBlock && end !== null ? hhmm(end) : null,
		endNextDay,
		fromSlot,
		notes,
		warnings,
		problems,
	};
}

// ---------- palette helpers (pure, used by QuickAdd.svelte) ----------

export interface QAOption {
	group: 'Type' | 'Goes to';
	token: string; // inserted text incl. prefix, e.g. "/hobby"
	label: string;
	hint: string;
	type?: ItemType;
	target?: QATarget;
}
/** the "/" menu: the user's types (default marked), then destinations (default marked) */
export function slashOptions(ctx: Pick<QAContext, 'types' | 'qaTarget'> = {}): QAOption[] {
	const cal = ctx.qaTarget === 'calendar';
	return [
		...(ctx.types ?? defaultTypes()).map((t) => ({
			group: 'Type' as const,
			token: `/${t.slug}`,
			label: t.name,
			hint: t.isDefault ? 'default' : 'type',
			type: t.key,
		})),
		{ group: 'Goes to', token: '/planner', label: 'Planner', hint: cal ? 'time block' : 'default · time block', target: 'planner' },
		{ group: 'Goes to', token: '/calendar', label: 'Calendar', hint: cal ? 'default · item' : 'big event only', target: 'calendar' },
		{ group: 'Goes to', token: '/both', label: 'Both', hint: 'calendar + block', target: 'both' },
	]; // prettier-ignore
}

/** The token being typed at the end of the text, if it is an option prefix (`/x`). */
export function activeOptionToken(text: string): string | null {
	if (!text || /\s$/.test(text)) return null;
	const t = text.split(/\s/).pop() ?? '';
	return t.startsWith('/') && !/^\/\d/.test(t) ? t : null;
}

export function optionsFor(token: string, ctx: Pick<QAContext, 'types' | 'qaTarget'> = {}): QAOption[] {
	const q = token.slice(1).toLowerCase();
	return slashOptions(ctx).filter(
		(o) => o.token.slice(1).startsWith(q) || o.label.toLowerCase().startsWith(q),
	);
}

/** Grey ghost text after the cursor: rest of an option being typed, else the slots still missing. */
export function ghostHint(
	text: string,
	p: QAParse,
	slotted: boolean | 'day' = false,
	ctx: Pick<QAContext, 'types' | 'qaTarget'> = {},
): string {
	if (!text)
		return slotted === 'day'
			? 'title   optional: time  /type  /both'
			: slotted
				? 'title   optional: /type  /calendar'
				: 'title  day  time   optional: /type  /calendar or /both';
	const tok = activeOptionToken(text);
	if (tok) {
		if (tok.length < 2) return '';
		const first = optionsFor(tok, ctx)[0];
		return first && first.token.startsWith(tok.toLowerCase()) ? first.token.slice(tok.length) : '';
	}
	const missing: string[] = [];
	if (!p.title) missing.push('title');
	if (!p.dateSet && !slotted) missing.push('day');
	if (p.time === null && !slotted) missing.push('time');
	if (!p.typeSet) missing.push('/type');
	if (!p.targetSet) missing.push(slotted === 'day' ? '/both' : '/calendar or /both');
	if (!missing.length) return '';
	return (text.endsWith(' ') ? ' ' : '  ') + missing.join('  ');
}

const TARGET_TOKEN: Record<QATarget, string> = { planner: '', calendar: '/calendar', both: '/both' };
/** Replace any destination option in the text with `target` (planner = no token, it is the default). */
export function withTarget(text: string, target: QATarget): string {
	const kept = text
		.split(/(\s+)/)
		.filter((t) => {
			const k = t.toLowerCase().replace(/[,.;:!?]+$/, '');
			return !(k.startsWith('/') && own(TARGET_WORDS, k.slice(1)));
		})
		.join('')
		.replace(/\s{2,}/g, ' ')
		.trimEnd();
	const tok = TARGET_TOKEN[target];
	return tok ? `${kept}${kept ? ' ' : ''}${tok} ` : kept ? `${kept} ` : '';
}
