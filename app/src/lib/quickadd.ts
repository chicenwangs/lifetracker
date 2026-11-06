// Quick add parser (FR-Q1..Q3, TECHNICAL §8). PURE: client preview + server (truth) use same code.
// Rules: whole-token matches only · !type / #course only when known · LAST date token wins (earlier stay in title)
// · D/M is day/month · rollover to next future date · default type = course ? Work : Event · no date = today.
import { addDays, isDate, makeDate, weekdayOf } from './time';
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
export type QAResult =
	| {
			ok: true;
			title: string;
			date: string;
			time: string | null;
			type: ItemType;
			courseId: string | null;
			courseCode: string | null;
			warnings: string[];
	  }
	| { ok: false; reason: string };

const TYPE_WORDS: Record<string, ItemType> = {
	work: 'Work',
	exam: 'Exam',
	event: 'Event',
	hobby: 'Hobby',
	date: 'Dating',
	dating: 'Dating',
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

const DAYNUM = /^(\d{1,2})(st|nd|rd|th)?$/;
const T12 = /^(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?(am|pm)$/;
const T24 = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;
const DM = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

type Hit = {
	idx: number[];
	kind: 'rel' | 'weekday' | 'dm' | 'ymd';
	date?: string;
	wd?: number;
	m?: number;
	d?: number;
	y?: number;
};

function yearDate(y: number, m: number, d: number): string | null {
	const s = makeDate(y, m, d);
	return isDate(s) && s === `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` ? s : null;
}

export function parseQuickAdd(text: string, ctx: QAContext): QAResult {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	if (!tokens.length) return { ok: false, reason: 'Type something.' };
	const low = tokens.map((t) => t.toLowerCase());
	const used = new Set<number>();
	const warnings: string[] = [];

	// --- !type, #course (last wins) ---
	let type: ItemType | null = null;
	let course: QACourse | null = null;
	low.forEach((t, i) => {
		if (t.length > 1 && t.startsWith('!') && TYPE_WORDS[t.slice(1)]) {
			type = TYPE_WORDS[t.slice(1)] ?? null;
			used.add(i);
		} else if (t.length > 1 && t.startsWith('#')) {
			const a = t.slice(1);
			const c = ctx.courses.find((c) => c.aliases.includes(a) || c.code.toLowerCase() === a);
			if (c) {
				course = c;
				used.add(i);
			}
		}
	});

	// --- time (last wins). 2pm 2:30pm 14:00 14.30 noon midnight, "2 pm" ---
	let time: string | null = null;
	let timeIdx: number[] = [];
	low.forEach((t, i) => {
		if (used.has(i)) return;
		let h: number | null = null;
		let mm = 0;
		let idx = [i];
		let m: RegExpExecArray | null;
		if ((m = T12.exec(t))) {
			h = (Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0);
			mm = Number(m[2] ?? 0);
		} else if ((m = T24.exec(t))) {
			h = Number(m[1]);
			mm = Number(m[2]);
		} else if (t === 'noon') h = 12;
		else if (t === 'midnight') h = 0;
		else if (/^(1[0-2]|0?[1-9])$/.test(t) && (low[i + 1] === 'am' || low[i + 1] === 'pm')) {
			h = (Number(t) % 12) + (low[i + 1] === 'pm' ? 12 : 0);
			idx = [i, i + 1];
		}
		if (h !== null) {
			time = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
			timeIdx = idx;
		}
	});
	timeIdx.forEach((i) => used.add(i));

	// --- dates: collect, LAST wins ---
	const hits: Hit[] = [];
	for (let i = 0; i < low.length; i++) {
		if (used.has(i)) continue;
		const t = low[i] ?? '';
		const next = low[i + 1];
		if (t === 'today' || t === 'tdy') hits.push({ idx: [i], kind: 'rel', date: ctx.today });
		else if (t === 'tmr' || t === 'tmrw' || t === 'tomorrow')
			hits.push({ idx: [i], kind: 'rel', date: addDays(ctx.today, 1) });
		else if (WEEKDAYS[t]) hits.push({ idx: [i], kind: 'weekday', wd: WEEKDAYS[t] });
		else if (YMD.test(t) && isDate(t)) hits.push({ idx: [i], kind: 'ymd', date: t });
		else if (DM.test(t)) {
			const m = DM.exec(t);
			if (m)
				hits.push({
					idx: [i],
					kind: 'dm',
					d: Number(m[1]),
					m: Number(m[2]),
					y: m[3] ? Number(m[3]) : undefined,
				});
		} else if (DAYNUM.test(t) && next && MONTHS[next] && !used.has(i + 1)) {
			hits.push({ idx: [i, i + 1], kind: 'dm', d: Number(DAYNUM.exec(t)?.[1]), m: MONTHS[next] });
			i++;
		} else if (MONTHS[t] && next && DAYNUM.test(next) && !used.has(i + 1)) {
			hits.push({ idx: [i, i + 1], kind: 'dm', d: Number(DAYNUM.exec(next)?.[1]), m: MONTHS[t] });
			i++;
		}
	}

	let date: string | null = null;
	const timePassed = time !== null && minutesOfTime(time) <= ctx.nowMinutes;
	for (let k = hits.length - 1; k >= 0 && !date; k--) {
		const h = hits[k];
		if (!h) continue;
		let d: string | null = null;
		if (h.kind === 'rel' || h.kind === 'ymd') d = h.date ?? null;
		else if (h.kind === 'weekday' && h.wd) {
			let delta = (h.wd - weekdayOf(ctx.today) + 7) % 7;
			if (delta === 0 && timePassed) delta = 7;
			d = addDays(ctx.today, delta);
		} else if (h.kind === 'dm' && h.d && h.m) {
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
	if (!date) {
		date = ctx.today;
		if (timePassed) warnings.push('Time already passed today.');
	} else if (date < ctx.today) warnings.push('Date is in the past.');
	else if (date === ctx.today && timePassed) warnings.push('Time already passed today.');

	const title = tokens
		.filter((_, i) => !used.has(i))
		.join(' ')
		.trim();
	if (!title) return { ok: false, reason: 'Need a title.' };
	const c = course as QACourse | null;
	return {
		ok: true,
		title: title.slice(0, 300),
		date,
		time,
		type: type ?? (c ? 'Work' : 'Event'),
		courseId: c?.id ?? null,
		courseCode: c?.code ?? null,
		warnings,
	};
}

function minutesOfTime(t: string): number {
	return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}
