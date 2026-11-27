// Read-only calendar feed (card 07, D-V4-08 / D-V4-25 / D-V4-37). Pure: no DB, no clock of its own.
// One VEVENT per series. Timed values are UTC instants (no TZID / VTIMEZONE); all-day values are VALUE=DATE.
import { addDays, diffDays, localToUtc, toIsoZ } from '$lib/time';
import { parseRRule } from '$lib/rrule';
import type { ItemDTO } from '$lib/types';

const PRODID = '-//Life Tracker//Calendar feed//EN';
/** D-V4-08: a timed item without a linked planner block runs 60 minutes */
export const DEFAULT_MIN = 60;

export interface FeedInput {
	timezone: string;
	/** agenda() rows: the expanded occurrences of the user's own items (range already applied) */
	rows: ItemDTO[];
	/** series/item id -> notes, one batched itemsRepo.notesFor call (D-V4-37) */
	notes: Map<string, string | null>;
	/** minutes of the series' earliest linked planner block; undefined = the 60-minute default */
	blockMin?: (seriesId: string) => number | undefined;
}

/** RFC 5545 TEXT: backslash, comma, semicolon and newlines */
const esc = (s: string): string =>
	s
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');

/** 2026-11-13 -> 20261113 */
const icsDate = (d: string): string => d.replace(/-/g, '');
/** 2026-11-13T10:00:00Z -> 20261113T100000Z (localToUtc/toIsoZ output) */
const icsStamp = (iso: string): string => iso.replace(/[-:]/g, '');

/** every physical line at most 75 octets; continuation lines start with one space (which counts) */
function fold(line: string): string {
	const bytes = Buffer.from(line, 'utf8');
	if (bytes.length <= 75) return line;
	const out: string[] = [];
	let i = 0;
	while (i < bytes.length) {
		let end = Math.min(i + (i === 0 ? 75 : 74), bytes.length);
		while (end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--; // never split a UTF-8 codepoint
		out.push((i === 0 ? '' : ' ') + bytes.subarray(i, end).toString('utf8'));
		i = end;
	}
	return out.join('\r\n');
}

/** one VEVENT for a series: DTSTART = its series date (a one-off: its date), UID = the series id */
function event(key: string, r: ItemDTO, input: FeedInput, stamp: string): string[] {
	const start = r.seriesDate ?? r.date;
	if (!start) return [];
	const allDay = !r.time;
	const span = r.date && r.endDate ? diffDays(r.date, r.endDate) : 0;
	const lines = ['BEGIN:VEVENT', `UID:${key}@lifetracker`, `DTSTAMP:${stamp}`];
	if (allDay) {
		lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`);
		if (r.endDate) lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(start, span + 1))}`);
	} else {
		const s = localToUtc(start, r.time as string, input.timezone);
		const min = input.blockMin?.(key) ?? DEFAULT_MIN;
		lines.push(`DTSTART:${icsStamp(s)}`, `DTEND:${icsStamp(toIsoZ(Date.parse(s) + min * 60_000))}`);
	}
	const rule = parseRRule(r.rrule);
	if (rule) {
		const parts = [`FREQ=${rule.freq}`];
		if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
		if (rule.byday?.length) parts.push(`BYDAY=${rule.byday.join(',')}`);
		if (rule.bymonthday) parts.push(`BYMONTHDAY=${rule.bymonthday}`);
		if (rule.until)
			parts.push(
				`UNTIL=${allDay ? icsDate(rule.until) : icsStamp(localToUtc(rule.until, r.time as string, input.timezone))}`,
			);
		else if (rule.count) parts.push(`COUNT=${rule.count}`);
		lines.push(`RRULE:${parts.join(';')}`);
	}
	for (const d of r.exdates ?? [])
		lines.push(
			allDay
				? `EXDATE;VALUE=DATE:${icsDate(d)}`
				: `EXDATE:${icsStamp(localToUtc(d, r.time as string, input.timezone))}`,
		);
	lines.push(`SUMMARY:${r.private ? 'Busy' : esc(r.title)}`);
	const notes = input.notes.get(key);
	if (!r.private && notes) lines.push(`DESCRIPTION:${esc(notes)}`);
	lines.push('END:VEVENT');
	return lines;
}

/** the whole feed: one VEVENT per series, grouped by seriesId (a one-off: its id) */
export function buildIcs(input: FeedInput, now: number = Date.now()): string {
	const seen = new Map<string, ItemDTO>();
	for (const r of input.rows) {
		const key = r.seriesId ?? r.id;
		if (!seen.has(key)) seen.set(key, r);
	}
	const stamp = icsStamp(toIsoZ(now));
	const events = [...seen]
		.map(([key, r]) => ({ key, r, start: r.seriesDate ?? r.date ?? '' }))
		.sort((a, b) => (a.start === b.start ? a.key.localeCompare(b.key) : a.start < b.start ? -1 : 1))
		.map(({ key, r }) => event(key, r, input, stamp));
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, ...events.flat(), 'END:VCALENDAR'];
	return lines.map(fold).join('\r\n') + '\r\n';
}
