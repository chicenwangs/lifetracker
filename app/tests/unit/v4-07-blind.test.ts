// Blind tests for card 07, from its Done-when lines only: C5 (route 404s + headers), C6 (range / own-only),
// C7 (all-day DTEND), C8 (one VEVENT per series + RRULE/EXDATE), C9 (UTC/UID/notes), C10 (escaping/folding),
// C11 (rate limit). No builder test was opened.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as itemsRepo from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import * as itemTypes from '../../src/lib/server/repo/itemtypes';
import * as keys from '../../src/lib/server/repo/sharekeys';
import * as grants from '../../src/lib/server/repo/grants';
import * as rl from '../../src/lib/server/ratelimit';
import { sha256hex } from '../../src/lib/server/crypto';
import { agenda } from '../../src/lib/server/agenda';
import { getCalendar } from '../../src/lib/server/calendar';
import { buildIcs } from '../../src/lib/server/ics';
import { GET } from '../../src/routes/cal/[file]/+server';
import { addDays, localToUtc, todayLocal, weekdayOf } from '../../src/lib/time';
import type { ItemDTO } from '../../src/lib/types';

const TZ = 'Asia/Kuala_Lumpur';
const T0 = '2026-11-27';
let meId: string;
let tokenSeq = 0;
let ipSeq = 0;

beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	meId = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	}).id;
});
afterEach(() => vi.restoreAllMocks());

const meNow = (): App.SafeUser => usersRepo.safe(usersRepo.byId(meId)!);
const mkUser = (username: string) =>
	usersRepo.createWithCalendar({ username, displayName: username, passwordHash: 'x', role: 'member' }).id;
const mk = (over: Record<string, unknown> = {}, owner = meId) =>
	items.create(owner, items.itemCreateSchema.parse({ title: 'Blind 07', ...over }));
const mkBlock = (over: Record<string, unknown>) => blocks.create(meId, blocks.blockCreateSchema.parse(over));

/** store a fresh token hash and return the plain token */
const issue = (owner = meId) => {
	const token = `blind07_${++tokenSeq}_${'x'.repeat(24)}`;
	usersRepo.setIcsTokenHash(owner, sha256hex(token));
	return token;
};
/** call the public route directly with a per-call client IP */
const call = (file: string, address = `10.9.0.${++ipSeq % 250}`) =>
	GET({ params: { file }, getClientAddress: () => address } as unknown as Parameters<typeof GET>[0]);

const icsDate = (d: string) => d.replace(/-/g, '');
const icsStamp = (z: string) => z.replace(/[-:]/g, '');

/** VEVENT logical lines (fold continuation lines are kept attached to their property) */
function eventLines(body: string): string[][] {
	const out: string[][] = [];
	let cur: string[] | null = null;
	for (const line of body.split('\r\n')) {
		if (line === 'BEGIN:VEVENT') {
			cur = [];
			continue;
		}
		if (line === 'END:VEVENT') {
			if (cur) out.push(cur);
			cur = null;
			continue;
		}
		if (cur) cur.push(line);
	}
	return out;
}
const eventOf = (body: string, id: string) =>
	eventLines(body).find((e) => e.includes(`UID:${id}@lifetracker`));

describe('C5 public route contract', () => {
	it('C5 serves 200 text/calendar with a 5-minute private cache, and every bad or internally failing token gets the same bare 404 JSON', async () => {
		const today = todayLocal(TZ);
		mk({ title: 'C5 feed item', date: today, time: '09:00' });
		const token = issue();

		const ok = await call(`${token}.ics`);
		expect(ok.status).toBe(200);
		expect(ok.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
		expect(ok.headers.get('cache-control')).toBe('private, max-age=300');
		const body = await ok.text();
		expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(body.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(body).toContain('SUMMARY:C5 feed item');

		const bare404 = async (file: string) => {
			const r = await call(file);
			expect(r.status, file).toBe(404);
			expect(r.headers.get('content-type')).toBe('application/json');
			const text = await r.text();
			expect(text).toBe('{}'); // no message, no token echo
			expect(text).not.toContain(token);
			return r;
		};
		await bare404('no-extension');
		await bare404('unknown.ics');
		await bare404('');

		// Rotate: the old token dies, the new one works
		const rotated = issue();
		await bare404(`${token}.ics`);
		expect((await call(`${rotated}.ics`)).status).toBe(200);

		// an internal failure (a corrupt timezone makes safe()/todayLocal throw) must not escape as a 500
		handle().sqlite.prepare("UPDATE users SET timezone = 'Not/AZone' WHERE id = ?").run(meId);
		const spy = vi.spyOn(console, 'error');
		const boom = await call(`${rotated}.ics`);
		expect(boom.status).toBe(404);
		expect(await boom.text()).toBe('{}');
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('C6 feed range and scope', () => {
	it('C6 exports only own default-calendar agenda rows from today−30 through today+365, with hidden types applied and no shared or block rows', async () => {
		const today = todayLocal(TZ);
		const at = (n: number, title: string) => mk({ title, date: addDays(today, n) });
		const keep = [
			at(-30, 'C6 minus30'),
			at(0, 'C6 today'),
			at(100, 'C6 plus100'), // beyond the old 62-day cap
			at(365, 'C6 plus365'),
		];
		const drop = [at(-31, 'C6 minus31'), at(366, 'C6 plus366')];

		const hidden = itemTypes.create(meId, {
			name: 'C6 hidden',
			bg: '#123456',
			countsDown: false,
			shareDefault: false,
		});
		drop.push(mk({ title: 'C6 hidden item', date: today, type: hidden.key }));
		usersRepo.setPrefs(meId, { hiddenTypes: [hidden.key], overlapOn: true });

		// a real grant with overlap explicitly on: getCalendar sees the partner row, the feed must not
		const other = mkUser('partner07');
		const theirs = items.create(other, items.itemCreateSchema.parse({ title: 'C6 partner', date: today }));
		keys.redeem(meId, keys.create(other, { types: ['None'], hiddenAs: 'none', expiry: '24h' }).code);
		const grant = grants.received(meId)[0]!;
		expect(grants.setInOverlap(meId, grant.id, true)).toBe(true);
		const me = meNow();
		const shared = getCalendar(me, today, addDays(today, 2)).items;
		expect(shared.some((i) => i.id === theirs.id && i.theirs)).toBe(true); // overlap really is on

		// a block is not an event
		mkBlock({
			label: 'C6 block only',
			startAt: localToUtc(today, '09:00', TZ),
			endAt: localToUtc(today, '10:00', TZ),
		});

		const text = await (await call(`${issue()}.ics`)).text();
		for (const i of keep) expect(text).toContain(`SUMMARY:${i.title}`);
		for (const i of drop) expect(text).not.toContain(i.title);

		// exactly the series ids agenda() returns over the same range (the 400-day cap is what lifts 62)
		const expected = agenda(me, addDays(today, -30), addDays(today, 366), { maxDays: 400 }).items.map(
			(i) => i.seriesId ?? i.id,
		);
		expect(new Set(expected)).toEqual(new Set(keep.map((i) => i.id)));
		const uids = [...text.matchAll(/^UID:(.+)@lifetracker$/gm)].map((m) => m[1]!);
		expect(new Set(uids)).toEqual(new Set(expected));

		// the default stays 62 and getCalendar's own cap is untouched
		expect(() => agenda(me, addDays(today, -30), addDays(today, 366))).toThrow('range 1..62 days');
		expect(() => getCalendar(me, addDays(today, -30), addDays(today, 366))).toThrow('range 1..62 days');
		expect(() => agenda(me, today, addDays(today, 62))).not.toThrow();
	});
});

describe('C7 all-day values', () => {
	it('C7 all-day items use VALUE=DATE and DTEND = end_date + 1 day; a timed item keeps its time as a UTC instant', async () => {
		const d = todayLocal(TZ);
		const single = mk({ title: 'C7 single', date: d });
		const span = mk({ title: 'C7 span', date: d, endDate: addDays(d, 2) });
		const timed = mk({ title: 'C7 timed', date: d, time: '09:30' });

		const body = await (await call(`${issue()}.ics`)).text();
		const one = eventOf(body, single.id)!;
		expect(one).toContain(`DTSTART;VALUE=DATE:${icsDate(d)}`);
		expect(one.some((l) => l.startsWith('DTEND'))).toBe(false); // no end_date -> no DTEND

		const three = eventOf(body, span.id)!;
		expect(three).toContain(`DTSTART;VALUE=DATE:${icsDate(d)}`);
		expect(three).toContain(`DTEND;VALUE=DATE:${icsDate(addDays(d, 3))}`); // inclusive end -> exclusive ICS

		const at = eventOf(body, timed.id)!;
		expect(at).toContain(`DTSTART:${icsStamp(localToUtc(d, '09:30', TZ))}`);
		expect(at).toContain(`DTEND:${icsStamp(localToUtc(d, '10:30', TZ))}`);
		expect(body).not.toContain('TZID');
		expect(body).not.toContain('VTIMEZONE');
	});
});

describe('C8 one VEVENT per series', () => {
	it('C8 groups occurrences by seriesId, keeps only the wanted RRULE parts and writes one EXDATE per stored date in both encodings', async () => {
		const d = todayLocal(TZ);
		const wd = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][weekdayOf(d) - 1];
		const day = Number(d.slice(8, 10));

		const allDay = mk({
			title: 'C8 all-day series',
			date: d,
			rrule: `FREQ=WEEKLY;BYDAY=${wd};UNTIL=${addDays(d, 30)}`,
		});
		const timed = mk({ title: 'C8 timed series', date: d, time: '09:00', rrule: 'FREQ=DAILY;COUNT=3' });
		const monthly = mk({
			title: 'C8 monthly series',
			date: d,
			rrule: `FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=${day};COUNT=2`,
		});
		// skip one occurrence of each: that stores an EXDATE and detaches a one-off row
		items.patch(meId, `${allDay.id}@${addDays(d, 7)}`, { title: 'C8 all-day moved', scope: 'this' });
		items.patch(meId, `${timed.id}@${addDays(d, 1)}`, { title: 'C8 timed moved', scope: 'this' });
		expect(items.mustOwn(meId, allDay.id).exdates).toContain(addDays(d, 7));
		expect(items.mustOwn(meId, timed.id).exdates).toContain(addDays(d, 1));

		const body = await (await call(`${issue()}.ics`)).text();
		const a = eventOf(body, allDay.id)!;
		expect(a).toContain(`UID:${allDay.id}@lifetracker`);
		expect(a).toContain(`DTSTART;VALUE=DATE:${icsDate(d)}`); // the group's seriesDate
		expect(a).toContain(`RRULE:FREQ=WEEKLY;BYDAY=${wd};UNTIL=${icsDate(addDays(d, 30))}`); // all-day UNTIL=YYYYMMDD
		expect(a).toContain(`EXDATE;VALUE=DATE:${icsDate(addDays(d, 7))}`);
		expect(eventLines(body).filter((e) => e.includes(`UID:${allDay.id}@lifetracker`))).toHaveLength(1);

		const t = eventOf(body, timed.id)!;
		expect(t).toContain(`DTSTART:${icsStamp(localToUtc(d, '09:00', TZ))}`);
		expect(t).toContain('RRULE:FREQ=DAILY;COUNT=3');
		expect(t).toContain(`EXDATE:${icsStamp(localToUtc(addDays(d, 1), '09:00', TZ))}`); // timed EXDATE is a UTC instant
		expect(eventLines(body).filter((e) => e.includes(`UID:${timed.id}@lifetracker`))).toHaveLength(1);

		// BYMONTHDAY survives; the output carries only the six allowed parts
		const m = eventOf(body, monthly.id)!;
		expect(m).toContain(`RRULE:FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=${day};COUNT=2`);
		expect(eventLines(body).filter((e) => e.includes(`UID:${monthly.id}@lifetracker`))).toHaveLength(1);

		// never the expanded id@date identity
		expect(body).not.toContain(`UID:${allDay.id}@${addDays(d, 7)}@lifetracker`);
		expect(body).not.toContain(`UID:${timed.id}@${addDays(d, 1)}@lifetracker`);
	});
});

describe('C9 UTC, UID and notes', () => {
	it('C9 timed items are UTC instants of 60 min or the earliest linked block, UID is the series id, notes only for public items via one notesFor call', async () => {
		const d = todayLocal(TZ);
		const plain = mk({ title: 'C9 plain', date: d, time: '09:00' });
		const linked = mk({ title: 'C9 linked', date: d, time: '11:00' });
		mkBlock({
			label: 'C9 later block',
			startAt: localToUtc(d, '13:00', TZ),
			endAt: localToUtc(d, '15:00', TZ),
			itemId: linked.id,
		});
		mkBlock({
			label: 'C9 earliest block',
			startAt: localToUtc(d, '11:00', TZ),
			endAt: localToUtc(d, '11:45', TZ),
			itemId: linked.id,
		});
		const noted = mk({ title: 'C9 noted', date: d, notes: 'Alpha\nBeta, gamma; back\\slash' });
		const secret = mk({ title: 'C9 secret', date: d, notes: 'hidden note', private: true });
		const series = mk({ title: 'C9 series', date: d, time: '15:00', rrule: 'FREQ=DAILY;COUNT=2' });

		const spy = vi.spyOn(itemsRepo, 'notesFor');
		const body = await (await call(`${issue()}.ics`)).text();

		// one batched lookup for every exported series (D-V4-37)
		expect(spy).toHaveBeenCalledTimes(1);
		const asked = spy.mock.calls[0]?.[0] as string[];
		expect(new Set(asked)).toEqual(new Set([plain.id, linked.id, noted.id, secret.id, series.id]));

		const plainEv = eventOf(body, plain.id)!;
		expect(plainEv).toContain(`DTSTART:${icsStamp(localToUtc(d, '09:00', TZ))}`);
		expect(plainEv).toContain(`DTEND:${icsStamp(localToUtc(d, '10:00', TZ))}`); // 60-minute default

		// the earliest linked block sets the length (45 min), not the later 120-minute one
		const linkedEv = eventOf(body, linked.id)!;
		expect(linkedEv).toContain(`DTSTART:${icsStamp(localToUtc(d, '11:00', TZ))}`);
		expect(linkedEv).toContain(`DTEND:${icsStamp(localToUtc(d, '11:45', TZ))}`);

		expect(body).not.toContain('TZID');
		expect(body).not.toContain('VTIMEZONE');
		expect(eventOf(body, series.id)).toContain(`UID:${series.id}@lifetracker`);
		expect(body).not.toContain(`UID:${series.id}@${d}@lifetracker`);

		expect(eventOf(body, noted.id)!.join('\r\n')).toContain(
			'DESCRIPTION:Alpha\\nBeta\\, gamma\\; back\\\\slash',
		);
		const secretEv = eventOf(body, secret.id)!;
		expect(secretEv).toContain('SUMMARY:Busy');
		expect(secretEv.some((l) => l.startsWith('DESCRIPTION:'))).toBe(false);
	});
});

describe('C10 escaping and folding', () => {
	it('C10 escapes backslash/comma/semicolon/newlines and folds every physical line at 75 octets without splitting a codepoint', () => {
		const long = 'é'.repeat(80); // 160 octets, no split allowed
		const row = (id: string, title: string): ItemDTO => ({
			id,
			title,
			type: null,
			status: 'todo',
			date: T0,
			time: null,
			endDate: null,
			parentId: null,
			private: false,
			stepsDone: 0,
			stepsTotal: 0,
			editable: true,
		});
		const body = buildIcs(
			{
				timezone: TZ,
				rows: [row('itm_a', 'A\\B, C; D\nE'), row('itm_b', long)],
				notes: new Map([['itm_a', 'N1, N2; N3\nN4\\N5']]),
			},
			Date.parse('2026-11-27T00:00:00Z'),
		);

		expect(body.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:')).toBe(true);
		expect(body).toContain('\r\nEND:VCALENDAR\r\n');
		expect(body).toContain('SUMMARY:A\\\\B\\, C\\; D\\nE');
		expect(body).toContain('DESCRIPTION:N1\\, N2\\; N3\\nN4\\\\N5');

		const lines = body.split('\r\n');
		for (const line of lines) {
			expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
			expect(line.includes('\uFFFD')).toBe(false);
		}
		expect(lines.some((l) => l.startsWith(' '))).toBe(true); // folded continuation lines
		// removing the CRLF + one leading space rebuilds the logical line
		const unfolded = lines.map((l, i) => (i > 0 && l.startsWith(' ') ? l.slice(1) : l)).join('');
		expect(unfolded).toContain(`SUMMARY:${long}`);
	});
});

describe('C11 rate limit', () => {
	it('C11 counts every request per client IP, returns 429 with no feed body over 120 per window, and groups IPv6 by /64', async () => {
		const token = issue();
		const ip4 = '203.0.113.7';
		for (let i = 0; i < 120; i++) expect((await call('unknown.ics', ip4)).status).toBe(404); // every request counts
		const over = await call(`${token}.ics`, ip4);
		expect(over.status).toBe(429);
		expect(over.headers.get('content-type')).toBe('application/json');
		expect(await over.text()).toBe('{}');

		// another client IP still has its own budget
		expect((await call(`${token}.ics`, '203.0.113.8')).status).toBe(200);

		// ipKey: one IPv6 /64 shares one budget
		const v6 = rl.ipKey('2001:db8:1:2::1');
		for (let i = 0; i < 120; i++) rl.fail(`cal:${v6}`, 0);
		expect((await call(`${token}.ics`, '2001:db8:1:2::abcd')).status).toBe(429);
		expect((await call(`${token}.ics`, '2001:db8:1:3::1')).status).toBe(200);
	});
});
