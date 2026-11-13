// ONLY place for date/tz math (TECHNICAL §3). Shared client + server. Pure.
// Items: local 'YYYY-MM-DD' + optional 'HH:MM' + inclusive end_date. Blocks/instants: UTC 'YYYY-MM-DDTHH:MM:SSZ'.
// Never new Date('YYYY-MM-DD').
import { TZDate } from '@date-fns/tz';
import { format, getISOWeek, getISOWeekYear } from 'date-fns';

export const DEFAULT_TZ = 'Asia/Kuala_Lumpur';
const MIN = 60_000;
const DAY_MIN = 1440;

// ---------- instants ----------
export function toIsoZ(ms: number): string {
	return new Date(ms).toISOString().slice(0, 19) + 'Z';
}
export function nowUtcIso(now: number = Date.now()): string {
	return toIsoZ(now);
}
export function isoPlus(iso: string, ms: number): string {
	return toIsoZ(Date.parse(iso) + ms);
}
export function durationMin(startZ: string, endZ: string): number {
	return Math.round((Date.parse(endZ) - Date.parse(startZ)) / MIN);
}

// ---------- local calendar dates (pure, no tz) ----------
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isDate(s: string): boolean {
	const m = DATE_RE.exec(s);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const t = new Date(Date.UTC(y, mo - 1, d));
	return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
function parts(date: string): [number, number, number] {
	const m = DATE_RE.exec(date);
	if (!m) throw new Error(`bad date ${date}`);
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function fromUtcMidnight(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}
export function makeDate(y: number, m: number, d: number): string {
	return fromUtcMidnight(Date.UTC(y, m - 1, d));
}
export function addDays(date: string, n: number): string {
	const [y, m, d] = parts(date);
	return fromUtcMidnight(Date.UTC(y, m - 1, d + n));
}
export function diffDays(a: string, b: string): number {
	const [y1, m1, d1] = parts(a);
	const [y2, m2, d2] = parts(b);
	return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
/** Mon=1 .. Sun=7 */
export function weekdayOf(date: string): number {
	const [y, m, d] = parts(date);
	const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return w === 0 ? 7 : w;
}
export function mondayOf(date: string): string {
	return addDays(date, 1 - weekdayOf(date));
}
export function isoWeekKey(date: string): string {
	const [y, m, d] = parts(date);
	const t = new TZDate(y, m - 1, d, 'UTC');
	return `${getISOWeekYear(t)}-W${String(getISOWeek(t)).padStart(2, '0')}`;
}
export function monthOf(date: string): { year: number; month: number } {
	const [y, m] = parts(date);
	return { year: y, month: m };
}
/** Monday-start 6-week grid around month. to = exclusive. */
export function monthGridRange(year: number, month: number): { from: string; to: string } {
	const from = mondayOf(makeDate(year, month, 1));
	return { from, to: addDays(from, 42) };
}
export function weekRange(date: string): { from: string; to: string } {
	const from = mondayOf(date);
	return { from, to: addDays(from, 7) };
}

// ---------- tz-aware ----------
export function todayLocal(tz: string, now: number = Date.now()): string {
	return format(new TZDate(now, tz), 'yyyy-MM-dd');
}
export function nowLocalMinutes(tz: string, now: number = Date.now()): number {
	const t = new TZDate(now, tz);
	return t.getHours() * 60 + t.getMinutes();
}
export function hhmm(min: number): string {
	const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function minutesOf(time: string): number {
	const [h, m] = time.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}
/** local date + minutes since 00:00 (may be >= 1440 -> next day) -> UTC Z */
export function localToUtc(date: string, minutes: number | string, tz: string): string {
	const min = typeof minutes === 'string' ? minutesOf(minutes) : minutes;
	const [y, m, d] = parts(addDays(date, Math.floor(min / DAY_MIN)));
	const r = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
	const t = new TZDate(y, m - 1, d, Math.floor(r / 60), r % 60, tz);
	return toIsoZ(t.getTime());
}
export function utcToLocal(iso: string, tz: string): { date: string; time: string; minutes: number } {
	const t = new TZDate(Date.parse(iso), tz);
	const minutes = t.getHours() * 60 + t.getMinutes();
	return { date: format(t, 'yyyy-MM-dd'), time: hhmm(minutes), minutes };
}
export function dayBoundsUtc(date: string, tz: string): { start: string; end: string } {
	return { start: localToUtc(date, 0, tz), end: localToUtc(addDays(date, 1), 0, tz) };
}

/** Piece of a block that falls on local `date`. Minutes from that day's 00:00. null = not on day. */
export function clipToDay(
	startZ: string,
	endZ: string,
	date: string,
	tz: string,
): { top: number; bottom: number; clippedStart: boolean; clippedEnd: boolean } | null {
	const { start, end } = dayBoundsUtc(date, tz);
	const s = Date.parse(startZ);
	const e = Date.parse(endZ);
	const ds = Date.parse(start);
	const de = Date.parse(end);
	if (e <= ds || s >= de) return null;
	return {
		top: Math.round((Math.max(s, ds) - ds) / MIN),
		bottom: Math.round((Math.min(e, de) - ds) / MIN),
		clippedStart: s < ds,
		clippedEnd: e > de,
	};
}

// ---------- planner snap ----------
export function snap15(min: number): number {
	return Math.round(min / 15) * 15;
}
export function fixRange(start: number, end: number): [number, number] {
	const s = snap15(start);
	let e = snap15(end);
	if (e <= s) e = s + 15;
	return [s, e];
}

// ---------- FullCalendar mapping (FC all-day end is exclusive) ----------
export interface DatedItem {
	date: string | null;
	time: string | null;
	endDate: string | null;
}
export function itemToFc(i: DatedItem): { start: string; end?: string; allDay: boolean } | null {
	if (!i.date) return null;
	const allDay = !i.time;
	const start = allDay ? i.date : `${i.date}T${i.time}`;
	if (!i.endDate || i.endDate === i.date) return { start, allDay };
	return { start, end: addDays(i.endDate, 1), allDay };
}
/** FC event after drag -> new date/end_date. Time NOT taken from FC (kept). */
export function fcDropToItem(orig: DatedItem, newStartStr: string): { date: string; endDate: string | null } {
	const date = newStartStr.slice(0, 10);
	if (!orig.date || !orig.endDate) return { date, endDate: null };
	return { date, endDate: addDays(orig.endDate, diffDays(orig.date, date)) };
}

// ---------- display ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** countdown badge. null = its type doesn't count down (item_types.counts_down), done, or no date. */
export function examCountdown(
	i: { status: string; date: string | null },
	today: string,
	countsDown: boolean,
): { days: number; short: string; long: string } | null {
	if (!countsDown || i.status === 'done' || !i.date) return null;
	const n = diffDays(today, i.date);
	if (n < 0) return { days: n, short: `${-n}d late`, long: `${-n} day${n === -1 ? '' : 's'} overdue` };
	if (n === 0) return { days: 0, short: 'Today', long: 'Due today' };
	return { days: n, short: `${n}d`, long: `${n} day${n === 1 ? '' : 's'} left` };
}

export function prettyDate(date: string): string {
	const [y, m, d] = parts(date);
	return `${WD[weekdayOf(date) - 1]} ${d} ${MONTHS[m - 1]} ${y}`;
}
export function prettyTime(time: string): string {
	const min = minutesOf(time);
	const h = Math.floor(min / 60) % 24; // 24:00 = 12am
	const mm = min % 60;
	const ap = h < 12 ? 'am' : 'pm';
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return mm ? `${h12}:${String(mm).padStart(2, '0')}${ap}` : `${h12}${ap}`;
}
export function monthLabel(year: number, month: number): string {
	return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1]} ${year}`;
}
