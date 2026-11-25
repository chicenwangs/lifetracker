// v3.3 PR 11: import a calendar file (.ics). Own small parser — VEVENT only (UID, SUMMARY, DTSTART/DTEND, RRULE,
// EXDATE, TZID). Anything outside our model is skipped and listed, never guessed. No dependency, no outbound calls.
// Limits: 1 MB text, 2000 events, 64 KB per unfolded line, 500 EXDATEs, 300-char titles.
import { addDays, isDate, localToUtc, utcToLocal } from '$lib/time';
import { formatRRule, parseRRule } from '$lib/rrule';
import * as itemsRepo from './repo/items';
import * as itemTypesRepo from './repo/itemtypes';
import { undoable, type Target, type UndoRef } from './undo';
import { bad } from './http';

export const ICS_MAX_BYTES = 1024 * 1024;
export const ICS_MAX_EVENTS = 2000;
const MAX_LINE = 64 * 1024;
const MAX_TITLE = 300;
const MAX_EXDATES = 500;
const MAX_SKIPPED = 100;
const SUPPORTED_FREQ = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

export interface Skipped {
	/** the event's title, or "(no title)" — for the preview list */
	title: string;
	/** plain words, e.g. "repeats by week number — not supported" */
	reason: string;
}
export interface IcsEvent {
	uid: string;
	title: string;
	date: string;
	time: string | null;
	endDate: string | null;
	rrule: string | null;
	exdates: string[];
}
export interface IcsParse {
	events: IcsEvent[];
	skipped: Skipped[];
}

type Prop = { name: string; params: Record<string, string>; value: string };
type Dt = { date: string; time: string | null } | { reason: string };

const isZone = (tz: string): boolean => {
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
};
const unquote = (v: string) => v.replace(/^"(.*)"$/, '$1');
/** RFC 5545 TEXT: \\ \; \, \n */
const untext = (v: string) =>
	v
		.replace(/\\[nN]/g, ' ')
		.replace(/\\([\\,;])/g, '$1')
		.replace(/[\r\n]+/g, ' ')
		.trim();

/** physical lines -> logical lines (a continuation starts with one space or tab) */
function unfold(text: string): string[] {
	const out: string[] = [];
	for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
		if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length) out[out.length - 1] += raw.slice(1);
		else out.push(raw);
	}
	return out;
}

function prop(line: string): Prop | null {
	const i = line.indexOf(':');
	if (i <= 0) return null;
	const head = line.slice(0, i);
	const value = line.slice(i + 1);
	const [first = '', ...rest] = head.split(';');
	const params: Record<string, string> = {};
	for (const p of rest) {
		const eq = p.indexOf('=');
		if (eq > 0) params[p.slice(0, eq).toUpperCase()] = unquote(p.slice(eq + 1));
	}
	return { name: first.trim().toUpperCase(), params, value };
}

/** DTSTART/DTEND/EXDATE value -> the user's local date (+ time when it has one) */
function parseDt(p: Prop, meTz: string): Dt {
	const v = p.value.trim();
	const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
	if (!m) return { reason: 'an invalid date' };
	const date = `${m[1]}-${m[2]}-${m[3]}`;
	if (!isDate(date)) return { reason: 'an invalid date' };
	if (m[4] === undefined) return { date, time: null }; // all-day: a calendar date, no zone to convert
	const minutes = Number(m[4]) * 60 + Number(m[5]);
	if (minutes > 1439 || Number(m[5]) > 59) return { reason: 'an invalid time' };
	const iso = `${date}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`;
	if (m[7]) {
		const l = utcToLocal(iso, meTz);
		return { date: l.date, time: l.time };
	}
	const tzid = p.params.TZID;
	if (!tzid) return { date, time: `${m[4]}:${m[5]}` }; // floating: the user's own wall time
	if (!isZone(tzid)) return { reason: `an unknown timezone (${tzid})` };
	const l = utcToLocal(localToUtc(date, minutes, tzid), meTz);
	return { date: l.date, time: l.time };
}

/** RRULE -> our subset, or a plain-words reason. WKST is dropped only when it cannot change the result. */
function mapRule(raw: string): { rrule: string } | { reason: string } {
	const parts = raw
		.trim()
		.toUpperCase()
		.replace(/^RRULE:/, '')
		.split(';')
		.filter(Boolean);
	const kv: Record<string, string> = {};
	for (const p of parts) {
		const i = p.indexOf('=');
		if (i < 0) return { reason: 'an invalid repeat rule' };
		kv[p.slice(0, i)] = p.slice(i + 1);
	}
	const interval = Number(kv.INTERVAL ?? '1');
	if (kv.WKST && kv.FREQ === 'WEEKLY' && interval > 1)
		return { reason: 'a week start (WKST) with a multi-week repeat — not supported' };
	const cleaned = parts.filter((p) => !p.startsWith('WKST=')).join(';');
	const r = parseRRule(cleaned);
	if (!r) return { reason: repeatReason(kv) };
	return { rrule: formatRRule(r) };
}
function repeatReason(kv: Record<string, string>): string {
	if (kv.FREQ && !SUPPORTED_FREQ.includes(kv.FREQ)) return `repeats ${kv.FREQ.toLowerCase()} — not supported`;
	const labels: [string, string][] = [
		['BYSETPOS', 'by position in the set (BYSETPOS)'],
		['BYWEEKNO', 'by week number (BYWEEKNO)'],
		['BYYEARDAY', 'by year day (BYYEARDAY)'],
		['BYMONTH', 'by month (BYMONTH)'],
		['BYHOUR', 'by time of day (BYHOUR)'],
		['BYMINUTE', 'by minute (BYMINUTE)'],
		['BYSECOND', 'by second (BYSECOND)'],
		['BYYEARDAY', 'by year day (BYYEARDAY)'],
	];
	for (const [k, label] of labels) if (kv[k] !== undefined) return `repeats ${label} — not supported`;
	return 'a repeat rule outside the supported set — not supported';
}

/** one VEVENT: the event, or a skipped entry (title + reason) */
function oneEvent(props: Prop[], meTz: string): IcsEvent | Skipped {
	const get = (name: string) => props.find((p) => p.name === name);
	const all = (name: string) => props.filter((p) => p.name === name);
	const summary = get('SUMMARY');
	const title = summary ? untext(summary.value) : '';
	const label = title || '(no title)';
	const skip = (reason: string): Skipped => ({ title: label, reason });
	if (get('RECURRENCE-ID')) return skip('a modified occurrence of a series — not supported');
	if ((get('STATUS')?.value ?? '').toUpperCase() === 'CANCELLED') return skip('cancelled');
	const uid = (get('UID')?.value ?? '').trim();
	if (!uid) return skip('no UID');
	if (uid.length > 200) return skip('a UID longer than 200 characters');
	if (!title) return skip('no title');
	if (title.length > MAX_TITLE) return skip('a title longer than 300 characters');
	const start = get('DTSTART');
	if (!start) return skip('no start date');
	const s = parseDt(start, meTz);
	if ('reason' in s) return skip(s.reason);
	if (get('DURATION') && !get('DTEND')) return skip('a duration without an end time — not supported');
	const end = get('DTEND');
	let endDate: string | null = null;
	if (end) {
		const e = parseDt(end, meTz);
		if ('reason' in e) return skip(e.reason);
		if (e.time === null) {
			// all-day DTEND is exclusive: the last day is the one before it
			const last = addDays(e.date, -1);
			if (last < s.date) return skip('ends before it starts');
			endDate = last === s.date ? null : last;
		} else {
			if (e.date < s.date || (e.date === s.date && e.time <= (s.time ?? '00:00')))
				return skip('ends before it starts');
			// an end at midnight is not a second day
			endDate = e.date > s.date && e.time !== '00:00' ? e.date : null;
		}
	}
	let rrule: string | null = null;
	const rule = get('RRULE');
	if (rule) {
		const mapped = mapRule(rule.value);
		if ('reason' in mapped) return skip(mapped.reason);
		rrule = mapped.rrule;
	}
	const exdates: string[] = [];
	for (const ex of all('EXDATE')) {
		for (const one of ex.value.split(',')) {
			const v = one.trim();
			if (!v) continue;
			const d = parseDt({ ...ex, value: v }, meTz);
			if ('reason' in d) return skip(`a skipped date: ${d.reason}`);
			if (!exdates.includes(d.date)) exdates.push(d.date);
			if (exdates.length > MAX_EXDATES) return skip(`more than ${MAX_EXDATES} skipped dates`);
		}
	}
	exdates.sort();
	return { uid, title, date: s.date, time: s.time, endDate, rrule, exdates };
}

export function parseIcs(text: string, meTz: string): IcsParse {
	if (typeof text !== 'string') throw bad('Send a calendar file.', 'no_file');
	if (text.length > ICS_MAX_BYTES) throw bad('That file is bigger than 1 MB.', 'too_large');
	const events: IcsEvent[] = [];
	const skipped: Skipped[] = [];
	let cur: Prop[] | null = null;
	let tooLong = false;
	for (const line of unfold(text)) {
		const up = line.trim().toUpperCase();
		if (up === 'BEGIN:VEVENT') {
			cur = [];
			tooLong = false;
			continue;
		}
		if (up === 'END:VEVENT') {
			if (cur) {
				if (tooLong) {
					if (skipped.length < MAX_SKIPPED)
						skipped.push({ title: '(line too long)', reason: 'a line longer than 64 KB' });
				} else {
					const e = oneEvent(cur, meTz);
					if ('reason' in e) {
						if (skipped.length < MAX_SKIPPED) skipped.push(e);
					} else if (events.length >= ICS_MAX_EVENTS) {
						if (skipped.length < MAX_SKIPPED)
							skipped.push({ title: e.title, reason: `more than ${ICS_MAX_EVENTS} events in one file` });
					} else events.push(e);
				}
			}
			cur = null;
			continue;
		}
		if (!cur) continue;
		if (line.length > MAX_LINE) {
			tooLong = true;
			continue;
		}
		const p = prop(line);
		if (p) cur.push(p);
	}
	if (!events.length && !skipped.length) throw bad('No calendar events in that file.', 'no_events');
	return { events, skipped };
}

export interface IcsPreview {
	events: number;
	repeating: number;
	updates: number;
	skipped: Skipped[];
	/** true when the list stopped at MAX_SKIPPED */
	skippedCapped: boolean;
}

/** counts only — no database writes */
export function previewIcs(me: App.SafeUser, text: string): IcsPreview {
	const { events, skipped } = parseIcs(text, me.timezone);
	const existing = itemsRepo.byIcsUids(
		me.id,
		events.map((e) => e.uid),
	);
	return {
		events: events.length,
		repeating: events.filter((e) => e.rrule).length,
		updates: events.filter((e) => existing.has(e.uid)).length,
		skipped,
		skippedCapped: skipped.length >= MAX_SKIPPED,
	};
}

/** one undo entry for the whole file (inserts + updates). Owner-scoped: my default calendar only. */
export function importIcs(
	me: App.SafeUser,
	text: string,
	typeKey: string | null,
): { imported: number; updated: number; undo: UndoRef } {
	const { events, skipped } = parseIcs(text, me.timezone);
	if (!events.length)
		bad(
			skipped.length
				? 'Nothing could be imported. Check the skipped list.'
				: 'No calendar events in that file.',
			'no_events',
		);
	itemTypesRepo.mustHave(me.id, typeKey); // null = No type
	const existing = itemsRepo.byIcsUids(
		me.id,
		events.map((e) => e.uid),
	);
	const targets: Target[] = [...existing.values()].map((r) => ({ t: 'items' as const, id: r.id }));
	const r = undoable(
		me.id,
		`Import ${events.length} calendar event${events.length === 1 ? '' : 's'}`,
		targets,
		() => {
			let imported = 0;
			let updated = 0;
			const created: Target[] = [];
			for (const e of events) {
				const fields = {
					title: e.title,
					type: typeKey,
					date: e.date,
					time: e.time,
					endDate: e.endDate,
					rrule: e.rrule,
					exdates: e.exdates.length ? e.exdates : null,
				};
				const cur = existing.get(e.uid);
				if (cur) {
					itemsRepo.patch(me.id, cur.id, fields);
					updated++;
				} else {
					const row = itemsRepo.create(me.id, itemsRepo.itemCreateSchema.parse({ ...fields, icsUid: e.uid }));
					created.push({ t: 'items', id: row.id });
					imported++;
				}
			}
			return { result: { imported, updated }, created };
		},
	);
	return { imported: r.result.imported, updated: r.result.updated, undo: r.undo };
}
