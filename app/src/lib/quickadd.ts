// Quick add parser (FR-Q1..Q3, TECHNICAL §8, rev 2026-11-06 "N palette").
// PURE: client preview + server (truth) use same code.
// Grammar, any order:  /type  title  /calendar|/planner  day  time  [#course]
// · options start with `/` (types + destinations), courses with `#`. Unknown `/x` = problem; unknown `#x` stays title.
// · whole-token matches only · LAST date wins, LAST time wins (earlier ones stay in title)
// · days: today tdy tonight tmr tomorrow · mon..sun · this mon · next mon (= the coming Mon, never today)
//   · next next mon (+1 week per extra next) · in 3 days / in 2 weeks · 10 nov · nov 10 · 10/11 (D/M) · 2026-11-10
// · times: 6pm 6:30pm 18:30 18.30 noon midnight "6 pm" · ranges 6pm to 10pm, 6-10pm, 18:00-22:00 · for 2h / 90m / 1h30
// · /planner = item + linked block: needs a time, snaps to 15 min, single time = 60 min, end <= start = next day.
// · default type = course ? Work : Event · default destination calendar · default day today.
// Never throws, never blocks typing: problems[] only shown on Enter.
import { addDays, hhmm, isDate, makeDate, weekdayOf } from './time';
import type { ItemType } from './types';

export interface QACourse {
	id: string;
	code: string;
	aliases: string[];
}
export interface QAContext {
	today: string; // local YYYY-MM-DD
	nowMinutes: number; // local minutes since 00:00
	courses: QACourse[];
}
export type QATarget = 'calendar' | 'planner';
export interface QAParse {
	ok: boolean; // = problems.length === 0
	title: string;
	type: ItemType;
	typeSet: boolean;
	courseId: string | null;
	courseCode: string | null;
	target: QATarget;
	targetSet: boolean;
	date: string;
	dateSet: boolean;
	/** start HH:MM (snapped for planner) or null = all day */
	time: string | null;
	startMinutes: number | null;
	/** planner only: end minutes from the start day's 00:00 (may be > 1440 = next day) */
	endMinutes: number | null;
	endTime: string | null;
	endNextDay: boolean;
	notes: string[]; // informational, e.g. "rounded to 15 min"
	warnings: string[]; // shown with the result, never block
	problems: string[]; // shown on Enter; `code` in backticks
}

export const TYPE_WORDS: Record<string, ItemType> = {
	work: 'Work',
	exam: 'Exam',
	event: 'Event',
	hobby: 'Hobby',
	date: 'Dating',
	dating: 'Dating',
};
export const TARGET_WORDS: Record<string, QATarget> = {
	calendar: 'calendar',
	cal: 'calendar',
	planner: 'planner',
	plan: 'planner',
	timeline: 'planner',
};
const WEEKDAYS: Record<string, number> = {
	mon: 1,
	monday: 1,
	tue: 2,
	tues: 2,
	tuesday: 2,
	wed: 3,
	weds: 3,
	wednesday: 3,
	thu: 4,
	thur: 4,
	thurs: 4,
	thursday: 4,
	fri: 5,
	friday: 5,
	sat: 6,
	saturday: 6,
	sun: 7,
	sunday: 7,
};
const MONTHS: Record<string, number> = {
	jan: 1,
	january: 1,
	feb: 2,
	february: 2,
	mar: 3,
	march: 3,
	apr: 4,
	april: 4,
	may: 5,
	jun: 6,
	june: 6,
	jul: 7,
	july: 7,
	aug: 8,
	august: 8,
	sep: 9,
	sept: 9,
	september: 9,
	oct: 10,
	october: 10,
	nov: 11,
	november: 11,
	dec: 12,
	december: 12,
};
const RANGE_SEP = new Set(['to', 'till', 'until', '-', '–']);

const DAYNUM = /^(\d{1,2})(st|nd|rd|th)?$/;
const T12 = /^(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?(am|pm)$/;
const T24 = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;
const BAREHOUR = /^(1[0-2]|0?[1-9])$/;
const DM = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DUR = /^(?:(\d+(?:\.\d+)?)(?:h|hr|hrs|hour|hours))?(?:(\d+)(?:m|min|mins)?)?$/;

type DateHit = {
	idx: number[];
	raw: string;
	abs?: string;
	wd?: number;
	next?: number; // 0 = bare/this, n = "next" x n
	d?: number;
	m?: number;
	y?: number;
};
type TimeHit = { idx: number[]; start: number; end: number | null };

const suffixOf = (t: string | undefined) => /(am|pm)$/.exec(t ?? '')?.[1] as 'am' | 'pm' | undefined;

/** one time token -> minutes. `fallback` am/pm lets "6 to 10pm" read the 6 as 6pm. */
function timeOf(t: string, fallback?: 'am' | 'pm'): number | null {
	let m: RegExpExecArray | null;
	if ((m = T12.exec(t))) return ((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2] ?? 0);
	if ((m = T24.exec(t))) return Number(m[1]) * 60 + Number(m[2]);
	if (t === 'noon') return 720;
	if (t === 'midnight') return 0;
	if (fallback && BAREHOUR.test(t)) return ((Number(t) % 12) + (fallback === 'pm' ? 12 : 0)) * 60;
	return null;
}
function durationOf(t: string | undefined): number | null {
	if (!t) return null;
	const m = DUR.exec(t);
	if (!m || (!m[1] && !m[2])) return null;
	const min = Math.round((m[1] ? Number(m[1]) * 60 : 0) + (m[2] ? Number(m[2]) : 0));
	return min > 0 ? min : null;
}
function yearDate(y: number, m: number, d: number): string | null {
	const s = makeDate(y, m, d);
	return isDate(s) && s === `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` ? s : null;
}
const snap = (min: number) => Math.round(min / 15) * 15;

export function parseQuickAdd(text: string, ctx: QAContext): QAParse {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	const low = tokens.map((t) => t.toLowerCase());
	const used = new Set<number>(); // tokens that are NOT title
	const claimed = new Set<number>(); // tokens matched by some rule (winner or not)
	const problems: string[] = [];
	const warnings: string[] = [];
	const notes: string[] = [];

	let type: ItemType | null = null;
	let target: QATarget | null = null;
	let course: QACourse | null = null;
	let dur: number | null = null;
	const dates: DateHit[] = [];
	const times: TimeHit[] = [];
	const take = (...idx: number[]) => idx.forEach((i) => claimed.add(i));

	for (let i = 0; i < low.length; i++) {
		const t = low[i] ?? '';
		const n1 = low[i + 1];
		const n2 = low[i + 2];

		// --- /options + #courses ---
		if (t.startsWith('/') && t.length > 1 && !t.slice(1).includes('/')) {
			const k = t.slice(1);
			if (TYPE_WORDS[k]) type = TYPE_WORDS[k] ?? null;
			else if (TARGET_WORDS[k]) target = TARGET_WORDS[k] ?? null;
			else problems.push(`\`${tokens[i]}\` isn't an option. Type \`/\` to see the list.`);
			take(i);
			used.add(i);
			continue;
		}
		if (t === '/') {
			take(i);
			used.add(i);
			continue;
		}
		if (t.startsWith('#') && t.length > 1) {
			const a = t.slice(1);
			const c = ctx.courses.find((c) => c.aliases.includes(a) || c.code.toLowerCase() === a);
			if (c) {
				course = c;
				take(i);
				used.add(i);
			}
			continue;
		}

		// --- days ---
		if (t === 'today' || t === 'tdy' || t === 'tonight') {
			dates.push({ idx: [i], raw: tokens[i] ?? '', abs: ctx.today });
			take(i);
			continue;
		}
		if (t === 'tmr' || t === 'tmrw' || t === 'tomorrow') {
			dates.push({ idx: [i], raw: tokens[i] ?? '', abs: addDays(ctx.today, 1) });
			take(i);
			continue;
		}
		if (t === 'in' && n1 && /^\d{1,3}$/.test(n1) && n2 && /^(day|days|week|weeks)$/.test(n2)) {
			const n = Number(n1) * (n2.startsWith('w') ? 7 : 1);
			dates.push({ idx: [i, i + 1, i + 2], raw: '', abs: addDays(ctx.today, n) });
			take(i, i + 1, i + 2);
			i += 2;
			continue;
		}
		if (t === 'next' || t === 'this') {
			let j = i;
			let n = 0;
			if (t === 'this') j = i + 1;
			else
				while (low[j] === 'next') {
					n++;
					j++;
				}
			const w = low[j];
			if (w && WEEKDAYS[w]) {
				const idx = Array.from({ length: j - i + 1 }, (_, k) => i + k);
				dates.push({ idx, raw: '', wd: WEEKDAYS[w], next: n });
				take(...idx);
				i = j;
				continue;
			}
		}
		if (WEEKDAYS[t]) {
			dates.push({ idx: [i], raw: '', wd: WEEKDAYS[t], next: 0 });
			take(i);
			continue;
		}
		if (YMD.test(t) && isDate(t)) {
			dates.push({ idx: [i], raw: '', abs: t });
			take(i);
			continue;
		}
		let m: RegExpExecArray | null;
		if ((m = DM.exec(t))) {
			dates.push({ idx: [i], raw: '', d: Number(m[1]), m: Number(m[2]), y: m[3] ? Number(m[3]) : undefined });
			take(i);
			continue;
		}
		if (DAYNUM.test(t) && n1 && MONTHS[n1]) {
			dates.push({ idx: [i, i + 1], raw: '', d: Number(DAYNUM.exec(t)?.[1]), m: MONTHS[n1] });
			take(i, i + 1);
			i++;
			continue;
		}
		if (MONTHS[t] && n1 && DAYNUM.test(n1)) {
			dates.push({ idx: [i, i + 1], raw: '', d: Number(DAYNUM.exec(n1)?.[1]), m: MONTHS[t] });
			take(i, i + 1);
			i++;
			continue;
		}

		// --- duration: for 2h ---
		if (t === 'for' && durationOf(n1) !== null) {
			dur = durationOf(n1);
			take(i, i + 1);
			used.add(i);
			used.add(i + 1);
			i++;
			continue;
		}

		// --- time ranges ---
		const dash = t.split(/[-–]/);
		if (dash.length === 2 && dash[0] && dash[1]) {
			const b = timeOf(dash[1]);
			const a = b !== null ? timeOf(dash[0], suffixOf(dash[1])) : null;
			if (a !== null && b !== null) {
				times.push({ idx: [i], start: a, end: b });
				take(i);
				continue;
			}
		}
		// "6pm to 10pm", "6 to 10pm", "6pm - 10pm", "6 pm to 10 pm"
		{
			let a: number | null = null;
			let aLen = 1;
			if (n1 === 'am' || n1 === 'pm') {
				a = timeOf(t + n1);
				aLen = 2;
			}
			const sep = low[i + aLen];
			if (sep && RANGE_SEP.has(sep)) {
				let bTok = low[i + aLen + 1] ?? '';
				let bLen = 1;
				const after = low[i + aLen + 2];
				if (BAREHOUR.test(bTok) && (after === 'am' || after === 'pm')) {
					bTok += after;
					bLen = 2;
				}
				const b = timeOf(bTok);
				if (a === null && b !== null) a = timeOf(t, suffixOf(bTok));
				if (a !== null && b !== null) {
					const idx = Array.from({ length: aLen + 1 + bLen }, (_, k) => i + k);
					times.push({ idx, start: a, end: b });
					take(...idx);
					i = idx[idx.length - 1] ?? i;
					continue;
				}
			}
		}
		// single time, "5 pm"
		{
			const a = timeOf(t);
			if (a !== null) {
				times.push({ idx: [i], start: a, end: null });
				take(i);
				continue;
			}
			if (BAREHOUR.test(t) && (n1 === 'am' || n1 === 'pm')) {
				times.push({ idx: [i, i + 1], start: timeOf(t + n1) ?? 0, end: null });
				take(i, i + 1);
				i++;
				continue;
			}
		}
	}

	// --- time: last wins ---
	const th = times[times.length - 1];
	th?.idx.forEach((i) => used.add(i));
	let start = th ? th.start : null;
	let end = th ? th.end : null;
	if (start !== null && end === null && dur !== null) end = start + dur;

	// --- date: last valid wins ---
	const timePassed = start !== null && start <= ctx.nowMinutes;
	let date: string | null = null;
	for (let k = dates.length - 1; k >= 0 && !date; k--) {
		const h = dates[k];
		if (!h) continue;
		let d: string | null = null;
		if (h.abs) d = h.abs;
		else if (h.wd) {
			let delta = (h.wd - weekdayOf(ctx.today) + 7) % 7;
			if (h.next) {
				if (delta === 0) delta = 7;
				delta += 7 * (h.next - 1);
			} else if (delta === 0 && timePassed) delta = 7;
			d = addDays(ctx.today, delta);
		} else if (h.d && h.m) {
			const y0 = Number(ctx.today.slice(0, 4));
			if (h.y) d = yearDate(h.y, h.m, h.d);
			else {
				d = yearDate(y0, h.m, h.d);
				if (d && d < ctx.today) d = yearDate(y0 + 1, h.m, h.d);
				if (!d && h.m === 2 && h.d === 29)
					d = yearDate(y0 + 1, 2, 29) ?? yearDate(y0 + 2, 2, 29) ?? yearDate(y0 + 3, 2, 29);
			}
		}
		if (d) {
			date = d;
			h.idx.forEach((i) => used.add(i));
		}
	}
	const dateSet = date !== null;
	date ??= ctx.today;

	const finalTarget: QATarget = target ?? 'calendar';
	let endNextDay = false;
	if (finalTarget === 'planner') {
		if (start === null) {
			problems.push(
				'The planner needs a time. Add one like `6pm` or `6pm to 10pm`, or use `/calendar` instead.',
			);
		} else {
			const s0 = start;
			const e0 = end;
			start = snap(start);
			if (end !== null) end = snap(end);
			if (s0 !== start || (e0 !== null && e0 !== end)) notes.push('rounded to 15 min');
			if (end === null) {
				end = start + 60;
				notes.push('60 min default');
			}
			if (end <= start) end += 1440; // crosses midnight
			if (end - start < 15) end = start + 15;
			if (start >= 1440) start -= 1440;
			endNextDay = end > 1440;
		}
	} else if (end !== null) {
		notes.push('end time is only used by /planner');
		end = null;
	}

	if (!dateSet && timePassed) warnings.push('Time already passed today.');
	else if (date < ctx.today) warnings.push('Date is in the past.');
	else if (date === ctx.today && timePassed) warnings.push('Time already passed today.');

	const title = tokens
		.filter((_, i) => !used.has(i))
		.join(' ')
		.trim()
		.slice(0, 300);
	if (!tokens.length) problems.push('Type something to add, like `/hobby gym /planner fri 6pm to 8pm`.');
	else if (!title)
		problems.push(
			"Add a title first. Any words that aren't an option, day or time become the title, like `build planner website`.",
		);

	const c = course as QACourse | null;
	return {
		ok: problems.length === 0,
		title,
		type: type ?? (c ? 'Work' : 'Event'),
		typeSet: type !== null,
		courseId: c?.id ?? null,
		courseCode: c?.code ?? null,
		target: finalTarget,
		targetSet: target !== null,
		date,
		dateSet,
		time: start === null ? null : hhmm(start),
		startMinutes: start,
		endMinutes: finalTarget === 'planner' ? end : null,
		endTime: finalTarget === 'planner' && end !== null ? hhmm(end) : null,
		endNextDay,
		notes,
		warnings,
		problems,
	};
}

// ---------- palette helpers (pure, used by QuickAdd.svelte) ----------

export interface QAOption {
	group: 'Type' | 'Goes to' | 'Course';
	token: string; // inserted text incl. prefix, e.g. "/hobby"
	label: string;
	hint: string;
	type?: ItemType;
}
export const SLASH_OPTIONS: QAOption[] = [
	{ group: 'Type', token: '/work', label: 'Work', hint: 'school, jobs', type: 'Work' },
	{ group: 'Type', token: '/exam', label: 'Exam', hint: 'deadlines, tests', type: 'Exam' },
	{ group: 'Type', token: '/event', label: 'Event', hint: 'default', type: 'Event' },
	{ group: 'Type', token: '/hobby', label: 'Hobby', hint: 'side projects', type: 'Hobby' },
	{ group: 'Type', token: '/date', label: 'Dating', hint: 'dates', type: 'Dating' },
	{ group: 'Goes to', token: '/calendar', label: 'Calendar', hint: 'default' },
	{ group: 'Goes to', token: '/planner', label: 'Planner', hint: 'calendar + time block' },
];

/** The token being typed at the end of the text, if it is an option prefix (`/x` or `#x`). */
export function activeOptionToken(text: string): string | null {
	if (!text || /\s$/.test(text)) return null;
	const t = text.split(/\s/).pop() ?? '';
	return t.startsWith('/') || t.startsWith('#') ? t : null;
}

export function optionsFor(token: string, courses: QACourse[]): QAOption[] {
	const q = token.slice(1).toLowerCase();
	if (token.startsWith('#')) {
		return courses
			.filter((c) => !q || c.code.toLowerCase().startsWith(q) || c.aliases.some((a) => a.startsWith(q)))
			.map((c) => ({
				group: 'Course' as const,
				token: `#${(c.aliases[0] ?? c.code).toLowerCase()}`,
				label: c.code,
				hint: c.aliases.map((a) => `#${a}`).join(' '),
			}));
	}
	return SLASH_OPTIONS.filter((o) => o.token.slice(1).startsWith(q) || o.label.toLowerCase().startsWith(q));
}

/** Grey ghost text after the cursor: rest of an option being typed, else the slots still missing. */
export function ghostHint(text: string, p: QAParse, courses: QACourse[]): string {
	if (!text) return '/type  title  /calendar or /planner  day  time';
	const tok = activeOptionToken(text);
	if (tok) {
		if (tok.length < 2) return '';
		const first = optionsFor(tok, courses)[0];
		return first && first.token.startsWith(tok.toLowerCase()) ? first.token.slice(tok.length) : '';
	}
	const missing: string[] = [];
	if (!p.typeSet && !p.courseId) missing.push('/type');
	if (!p.title) missing.push('title');
	if (!p.targetSet) missing.push('/calendar or /planner');
	if (!p.dateSet) missing.push('day');
	if (p.time === null) missing.push('time');
	if (!missing.length) return '';
	return (text.endsWith(' ') ? ' ' : '  ') + missing.join('  ');
}
