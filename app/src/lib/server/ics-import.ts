// ICS file import (card 11, D-V4-12 / D-V4-29 / D-V4-37): our own RFC 5545 VEVENT subset.
// One VEVENT = one ordinary planner item. Nothing is fetched and nothing is guessed: a value we cannot
// understand skips that event with a plain-words reason instead of importing something wrong.
import { TZDate } from '@date-fns/tz';
import { addDays, isDate, toIsoZ, utcToLocal } from '$lib/time';
import { formatRRule, parseRRule } from '$lib/rrule';
import { undoable, type Target, type UndoRef } from './undo';
import { bad } from './http';
import * as calendarsRepo from './repo/calendars';
import * as itemsRepo from './repo/items';
import * as itemTypesRepo from './repo/itemtypes';
import type { IcsRow } from './repo/items';

/** C1: client and server refuse a file part over this many bytes */
export const MAX_BYTES = 1_000_000;
/** C8: more VEVENTs than this in one file refuses the whole import */
export const MAX_EVENTS = 2_000;

export type IcsEvent = Omit<IcsRow, 'type'>;
export interface IcsSkipped {
	title: string;
	reason: string;
}
export interface IcsParse {
	/** every VEVENT in the file, imported or not (C8 counts them all) */
	total: number;
	events: IcsEvent[];
	skipped: IcsSkipped[];
	/** importable events with a rule */
	repeating: number;
	/** importable titles cut from over 300 characters (reported in the preview) */
	shortened: number;
}

interface Prop {
	name: string;
	params: Record<string, string>;
	value: string;
}

const MAX_TITLE = 300;

/** first colon outside a quoted parameter value; -1 = not a content line */
function colonAt(line: string): number {
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') quoted = !quoted;
		else if (c === ':' && !quoted) return i;
	}
	return -1;
}

function prop(line: string): Prop | null {
	const at = colonAt(line);
	if (at < 0) return null;
	const head = line.slice(0, at);
	const semi = head.indexOf(';');
	const name = (semi < 0 ? head : head.slice(0, semi)).trim().toUpperCase();
	const params: Record<string, string> = {};
	if (semi >= 0)
		for (const p of head.slice(semi + 1).split(';')) {
			const eq = p.indexOf('=');
			if (eq < 0) continue;
			params[p.slice(0, eq).trim().toUpperCase()] = p
				.slice(eq + 1)
				.trim()
				.replace(/^"|"$/g, '');
		}
	return { name, params, value: line.slice(at + 1) };
}

/** RFC 5545 TEXT: \\ \, \; \n */
const unescape = (s: string) =>
	s.replace(/\\([\\,;nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

/** folded lines: a CRLF + one space/tab continues the previous physical line (C3) */
function unfold(raw: string): string[] {
	const lines = raw
		.replace(/^\uFEFF/, '')
		.replace(/\r\n?/g, '\n')
		.split('\n');
	const out: string[] = [];
	for (const line of lines) {
		if (/^[ \t]/.test(line) && out.length) out[out.length - 1] += line.slice(1);
		else out.push(line);
	}
	return out;
}

/** IANA check: Outlook's Windows names ("Pacific Standard Time") are not zones and must be skipped */
function knownZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

type Dt = { ok: true; date: string; time: string | null } | { ok: false; reason: string };

/** DTSTART/DTEND/EXDATE value -> the user's local date (+ time), D-V4-12 / D-V4-29 */
function parseDt(p: Prop, tz: string): Dt {
	const v = p.value.trim();
	const d = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
	if (d) {
		const date = `${d[1]}-${d[2]}-${d[3]}`;
		return isDate(date) ? { ok: true, date, time: null } : { ok: false, reason: 'start date not understood' };
	}
	const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
	if (!m) return { ok: false, reason: 'start date not understood' };
	const date = `${m[1]}-${m[2]}-${m[3]}`;
	const [hh, mi] = [Number(m[4]), Number(m[5])];
	if (!isDate(date) || hh > 23 || mi > 59) return { ok: false, reason: 'start date not understood' };
	if (m[7]) {
		// UTC instant -> the user's zone
		const loc = utcToLocal(toIsoZ(Date.parse(`${date}T${m[4]}:${m[5]}:00Z`)), tz);
		return { ok: true, date: loc.date, time: loc.time };
	}
	const tzid = p.params.TZID;
	if (tzid) {
		if (!knownZone(tzid)) return { ok: false, reason: 'unknown time zone — not supported' };
		const ms = new TZDate(
			Number(m[1]),
			Number(m[2]) - 1,
			Number(m[3]),
			hh,
			mi,
			Number(m[6] ?? 0),
			tzid,
		).getTime();
		const loc = utcToLocal(toIsoZ(ms), tz);
		return { ok: true, date: loc.date, time: loc.time };
	}
	// floating: already the user's wall clock
	return { ok: true, date, time: `${m[4]}:${m[5]}` };
}

/** plain-words reason for a rule parseRRule refused (C5) */
function ruleReason(parts: string[]): string {
	const keys = parts.map((p) => p.slice(0, Math.max(0, p.indexOf('='))).toUpperCase());
	const val = (k: string) => {
		const hit = parts.find((p) => p.slice(0, p.indexOf('=')).toUpperCase() === k);
		return hit ? (hit.split('=')[1] ?? '').toUpperCase() : '';
	};
	if (keys.includes('BYSETPOS')) return 'repeats by set position, not supported';
	if (keys.includes('BYWEEKNO')) return 'repeats by week number, not supported';
	if (keys.includes('BYMONTH')) return 'repeats by month, not supported';
	if (keys.includes('WKST')) return 'uses a week start, not supported';
	const freq = val('FREQ');
	if (freq === 'HOURLY') return 'repeats hourly, not supported';
	if (freq === 'MINUTELY') return 'repeats by the minute, not supported';
	if (freq === 'SECONDLY') return 'repeats by the second, not supported';
	if (freq && !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq))
		return `repeats ${freq.toLowerCase()}, not supported`;
	const n = (k: string) => Number(val(k));
	if (
		keys.includes('INTERVAL') &&
		(!Number.isInteger(n('INTERVAL')) || n('INTERVAL') < 1 || n('INTERVAL') > 99)
	)
		return 'repeat interval out of range';
	if (keys.includes('COUNT') && (!Number.isInteger(n('COUNT')) || n('COUNT') < 1 || n('COUNT') > 999))
		return 'repeat count out of range';
	if (
		keys.includes('BYMONTHDAY') &&
		(!Number.isInteger(n('BYMONTHDAY')) || n('BYMONTHDAY') < 1 || n('BYMONTHDAY') > 31)
	)
		return 'repeat day out of range';
	if (keys.includes('BYDAY')) return 'repeat weekdays not understood';
	if (keys.includes('UNTIL')) return 'repeat end not understood';
	return 'repeat rule not supported';
}

/** C5: a UTC UNTIL instant becomes the user's local date before parseRRule sees it */
function ruleOf(raw: string, tz: string): { rrule: string | null; reason?: string } {
	const parts = raw.trim().split(';').filter(Boolean);
	const prepared: string[] = [];
	for (const p of parts) {
		const eq = p.indexOf('=');
		if (eq < 0) return { rrule: null, reason: 'repeat rule not supported' };
		const k = p.slice(0, eq).trim().toUpperCase();
		const v = p.slice(eq + 1).trim();
		const t = /^(\d{8})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
		if (k === 'UNTIL' && t) {
			const d8 = t[1] ?? '';
			const iso = toIsoZ(
				Date.parse(`${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}T${t[2]}:${t[3]}:${t[4]}Z`),
			);
			prepared.push(`UNTIL=${utcToLocal(iso, tz).date.replace(/-/g, '')}`);
			continue;
		}
		prepared.push(`${k}=${v}`);
	}
	const parsed = parseRRule(prepared.join(';'));
	return parsed ? { rrule: formatRRule(parsed) } : { rrule: null, reason: ruleReason(parts) };
}

function exdatesOf(props: Prop[], tz: string): string[] {
	const out = new Set<string>();
	for (const p of props)
		for (const one of p.value.split(',')) {
			const r = parseDt({ ...p, value: one.trim() }, tz);
			if (r.ok) out.add(r.date); // C6: an unparseable value is ignored, the rest of the event imports
		}
	return [...out].sort();
}

function addEvent(props: Prop[], tz: string, seen: Set<string>, out: IcsParse): void {
	const get = (name: string) => props.find((p) => p.name === name);
	const rawTitle = unescape(get('SUMMARY')?.value ?? '').trim() || 'Untitled';
	const title0 = rawTitle.slice(0, MAX_TITLE);
	const uidRaw = (get('UID')?.value ?? '').trim();
	if (!uidRaw) return void out.skipped.push({ title: title0, reason: 'no ID' }); // D-V4-37
	const uid = unescape(uidRaw);
	// D-V4-29: the first VEVENT with a UID wins, even when it is skipped for another reason
	if (seen.has(uid)) return void out.skipped.push({ title: title0, reason: 'duplicate UID' });
	seen.add(uid);

	const startProp = get('DTSTART');
	if (!startProp) return void out.skipped.push({ title: title0, reason: 'no start date' });
	const start = parseDt(startProp, tz);
	if (!start.ok) return void out.skipped.push({ title: title0, reason: start.reason });

	let rrule: string | null = null;
	const ruleProp = get('RRULE');
	if (ruleProp?.value.trim()) {
		const r = ruleOf(ruleProp.value, tz);
		if (!r.rrule)
			return void out.skipped.push({ title: title0, reason: r.reason ?? 'repeat rule not supported' });
		rrule = r.rrule;
	}

	// DTEND: all-day end is exclusive (end_date = DTEND - 1 day); a timed end only sets a later local day
	let endDate: string | null = null;
	const endProp = get('DTEND');
	if (endProp) {
		const end = parseDt(endProp, tz);
		if (end.ok) {
			if (start.time === null) {
				const last = addDays(end.date, -1);
				if (last > start.date) endDate = last;
			} else if (end.date > start.date) endDate = end.date;
		}
	}

	let title = rawTitle;
	if (title.length > MAX_TITLE) {
		title = title.slice(0, MAX_TITLE);
		out.shortened++;
	}
	out.events.push({
		uid,
		title,
		date: start.date,
		time: start.time,
		endDate,
		rrule,
		exdates: exdatesOf(
			props.filter((p) => p.name === 'EXDATE'),
			tz,
		),
	});
	if (rrule) out.repeating++;
}

/** C3: parse one file. Pure: no DB, no clock, no network. */
export function parseIcs(raw: string, tz: string): IcsParse {
	const out: IcsParse = { total: 0, events: [], skipped: [], repeating: 0, shortened: 0 };
	const seen = new Set<string>();
	let current: Prop[] | null = null;
	const stack: string[] = [];
	for (const line of unfold(raw)) {
		if (!line.trim()) continue;
		const p = prop(line);
		if (!p) continue;
		if (p.name === 'BEGIN') {
			const kind = p.value.trim().toUpperCase();
			stack.push(kind);
			if (kind === 'VEVENT') {
				out.total++;
				if (!current) current = [];
			}
			continue;
		}
		if (p.name === 'END') {
			const kind = stack.pop() ?? p.value.trim().toUpperCase();
			if (kind === 'VEVENT' && current) {
				addEvent(current, tz, seen, out);
				current = null;
			}
			continue;
		}
		// only the VEVENT's own properties: VALARM/VTODO/VJOURNAL and VTIMEZONE are ignored (C3)
		if (current && stack[stack.length - 1] === 'VEVENT') current.push(p);
	}
	return out;
}

export interface IcsPreview {
	events: number;
	repeating: number;
	skipped: IcsSkipped[];
	shortened: number;
	/** C2: importable UIDs that already have a live row in my calendar */
	willUpdate: number;
}
export interface IcsDone {
	/** importable events the file holds (the same number the Import button showed) */
	events: number;
	imported: number;
	updated: number;
	undo: UndoRef;
}

export function refuseTooMany(parsed: IcsParse): void {
	if (parsed.total > MAX_EVENTS)
		bad(`This file has ${parsed.total} events. The most you can import at once is ${MAX_EVENTS}.`);
}

/** preview counts for the signed-in user's own default calendar (never another calendar or owner) */
export function previewFor(meId: string, parsed: IcsParse): IcsPreview {
	refuseTooMany(parsed);
	const cal = calendarsRepo.defaultFor(meId);
	const ids = itemsRepo.icsIds(
		cal.id,
		parsed.events.map((e) => e.uid),
	);
	return {
		events: parsed.events.length,
		repeating: parsed.repeating,
		skipped: parsed.skipped,
		shortened: parsed.shortened,
		willUpdate: parsed.events.filter((e) => ids.has(e.uid)).length,
	};
}

/**
 * C7/C8/C9/C10: insert new UIDs, update title/time/rule(+exdates) of live UIDs (never their date), all in
 * one undo entry. A trashed row with the UID never matches (the partial index would not let it anyway).
 */
export function importIcs(me: App.SafeUser, parsed: IcsParse, type: string | null): IcsDone {
	refuseTooMany(parsed);
	if (!parsed.events.length) bad('No events to import.');
	const cal = calendarsRepo.defaultFor(me.id);
	itemTypesRepo.mustHave(me.id, type);
	const ids = itemsRepo.icsIds(
		cal.id,
		parsed.events.map((e) => e.uid),
	);
	itemsRepo.checkCapFor(cal.id, parsed.events.filter((e) => !ids.has(e.uid)).length);
	const targets: Target[] = parsed.events
		.filter((e) => ids.has(e.uid))
		.map((e) => ({ t: 'items', id: ids.get(e.uid) as string }));

	let imported = 0;
	let updated = 0;
	const r = undoable(me.id, `Import ${parsed.events.length} events`, targets, () => {
		const created: Target[] = [];
		for (const e of parsed.events) {
			const row = ids.get(e.uid);
			if (row) {
				itemsRepo.updateFromIcs(cal.id, me.id, row, e);
				updated++;
			} else {
				created.push({ t: 'items', id: itemsRepo.insertFromIcs(cal.id, me.id, { ...e, type }) });
				imported++;
			}
		}
		return { result: null, created };
	});
	return { events: parsed.events.length, imported, updated, undo: r.undo };
}
