// ICS feed text (RFC 5545) for GET /cal/<token>.ics. Pure: rows in, text out. Item date/time = owner-local.
import { TZDate } from '@date-fns/tz';
import { parseRRule } from '$lib/rrule';
import { addDays, localToUtc, makeDate, minutesOf, weekdayOf } from '$lib/time';

export interface IcsItem {
	id: string;
	title: string;
	date: string;
	time: string | null;
	endDate: string | null;
	private: boolean;
	rrule: string | null;
	exdates: string[];
	/** linked planner block length in minutes; default 60 */
	minutes?: number;
}

/** TEXT value escaping: backslash, semicolon, comma, newline */
export function escapeText(s: string): string {
	return s
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');
}

/** fold a content line at 75 octets (UTF-8), never inside a character */
export function fold(line: string): string {
	const out: string[] = [];
	let cur = '';
	let bytes = 0;
	for (const ch of line) {
		const n = Buffer.byteLength(ch);
		if (bytes + n > (out.length ? 74 : 75)) {
			out.push(cur);
			cur = '';
			bytes = 0;
		}
		cur += ch;
		bytes += n;
	}
	out.push(cur);
	return out.join('\r\n ');
}

const d8 = (date: string) => date.replaceAll('-', '');
const local = (date: string, min: number) => {
	const day = addDays(date, Math.floor(min / 1440));
	const m = ((min % 1440) + 1440) % 1440;
	return `${d8(day)}T${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
};
const utc = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '');

/** offset of tz at instant ms, in minutes east of UTC */
function offsetAt(tz: string, ms: number): number {
	return -new TZDate(ms, tz).getTimezoneOffset();
}
const off = (m: number) =>
	`${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}${String(Math.abs(m) % 60).padStart(2, '0')}`;

const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const monthLen = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** day of month of the n-th (or -1 = last) weekday wd (1=Mon) in y-m */
function nthWeekday(y: number, m: number, n: number, wd: number): number {
	const len = monthLen(y, m);
	if (n < 0) return len - ((weekdayOf(makeDate(y, m, len)) - wd + 7) % 7);
	return 1 + ((wd - weekdayOf(makeDate(y, m, 1)) + 7) % 7) + (n - 1) * 7;
}

/** VTIMEZONE: one STANDARD if the zone has no DST in `year`, else its two transitions as yearly rules
 * (BYMONTH + n-th/last weekday) so every year of the feed is covered. */
export function vtimezone(tz: string, year: number): string[] {
	const start = Date.UTC(year, 0, 1);
	const end = Date.UTC(year + 1, 0, 1);
	const changes: { at: number; from: number; to: number }[] = [];
	let prev = offsetAt(tz, start);
	for (let t = start + 3_600_000; t <= end; t += 3_600_000) {
		const o = offsetAt(tz, t);
		if (o !== prev) {
			changes.push({ at: t, from: prev, to: o });
			prev = o;
		}
	}
	const out = ['BEGIN:VTIMEZONE', `TZID:${tz}`];
	if (!changes.length) {
		out.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${off(prev)}`, `TZOFFSETTO:${off(prev)}`, 'END:STANDARD'); // prettier-ignore
	} else {
		for (const c of changes) {
			const kind = c.to > c.from ? 'DAYLIGHT' : 'STANDARD';
			const wall = new Date(c.at + c.from * 60_000).toISOString(); // local wall time just before the change
			const m = Number(wall.slice(5, 7));
			const day = Number(wall.slice(8, 10));
			const wd = weekdayOf(wall.slice(0, 10));
			const n = day + 7 > monthLen(year, m) ? -1 : Math.ceil(day / 7);
			const first = makeDate(1970, m, nthWeekday(1970, m, n, wd));
			out.push(`BEGIN:${kind}`, `DTSTART:${d8(first)}T${wall.slice(11, 13)}${wall.slice(14, 16)}00`, `RRULE:FREQ=YEARLY;BYMONTH=${m};BYDAY=${n}${WD[wd - 1]}`, `TZOFFSETFROM:${off(c.from)}`, `TZOFFSETTO:${off(c.to)}`, `END:${kind}`); // prettier-ignore
		}
	}
	out.push('END:VTIMEZONE');
	return out;
}

function rruleLine(raw: string, it: IcsItem, tz: string): string | null {
	const r = parseRRule(raw);
	if (!r) return null;
	const parts = [`FREQ=${r.freq}`];
	if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
	if (r.byday?.length) parts.push(`BYDAY=${r.byday.join(',')}`);
	if (r.bymonthday) parts.push(`BYMONTHDAY=${r.bymonthday}`);
	// UNTIL must match DTSTART's type: DATE for all-day, UTC DATE-TIME for timed (inclusive local day)
	if (r.until) parts.push(`UNTIL=${it.time ? utc(localToUtc(r.until, 1439, tz)) : d8(r.until)}`);
	else if (r.count) parts.push(`COUNT=${r.count}`);
	return `RRULE:${parts.join(';')}`;
}

export function buildIcs(o: { tz: string; items: IcsItem[]; now: number; name?: string }): string {
	const year = Number(new Date(o.now).toISOString().slice(0, 4));
	const stamp = utc(new Date(o.now).toISOString());
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Tracker//Planner//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(o.name ?? 'Life Tracker')}`, `X-WR-TIMEZONE:${o.tz}`]; // prettier-ignore
	if (o.items.some((i) => i.time)) lines.push(...vtimezone(o.tz, year));
	for (const it of o.items) {
		lines.push('BEGIN:VEVENT', `UID:${it.id}@lifetracker`, `DTSTAMP:${stamp}`);
		if (it.time) {
			const s = minutesOf(it.time);
			lines.push(`DTSTART;TZID=${o.tz}:${local(it.date, s)}`, `DTEND;TZID=${o.tz}:${local(it.endDate ?? it.date, s + (it.minutes ?? 60))}`); // prettier-ignore
		} else {
			lines.push(`DTSTART;VALUE=DATE:${d8(it.date)}`, `DTEND;VALUE=DATE:${d8(addDays(it.endDate ?? it.date, 1))}`); // prettier-ignore
		}
		const rr = it.rrule ? rruleLine(it.rrule, it, o.tz) : null;
		if (rr) {
			lines.push(rr);
			for (const x of it.exdates) {
				lines.push(it.time ? `EXDATE;TZID=${o.tz}:${local(x, minutesOf(it.time))}` : `EXDATE;VALUE=DATE:${d8(x)}`); // prettier-ignore
			}
		}
		lines.push(`SUMMARY:${it.private ? 'Busy' : escapeText(it.title || 'Untitled')}`);
		if (it.private) lines.push('CLASS:PRIVATE');
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(fold).join('\r\n') + '\r\n';
}
