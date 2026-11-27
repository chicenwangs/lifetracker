// Card 07 (O-1 item 4, D-V4-08, D-V4-25, D-V4-37): the ICS builder, the token form actions and the public
// /cal/<token>.ics route — all-day, UTC timed values, one VEVENT per series, Busy, the identical 404 and the
// per-IP rate limit.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as itemsRepo from '../../src/lib/server/repo/items';
import * as blocksRepo from '../../src/lib/server/repo/blocks';
import * as keys from '../../src/lib/server/repo/sharekeys';
import { agenda } from '../../src/lib/server/agenda';
import { buildIcs, DEFAULT_MIN, type FeedInput } from '../../src/lib/server/ics';
import { sha256hex } from '../../src/lib/server/crypto';
import { addDays, isDate, todayLocal } from '../../src/lib/time';
import { GET } from '../../src/routes/cal/[file]/+server';
import { actions, load } from '../../src/routes/settings/calendar-feed/+page.server';
import type { ItemDTO } from '../../src/lib/types';

const TZ = 'Asia/Kuala_Lumpur';
const NOW = Date.parse('2026-11-13T10:00:00Z');
const D = '2026-11-13';

let me: App.SafeUser;
const mk = (username: string) =>
	usersRepo.createWithCalendar({ username, displayName: username, passwordHash: 'x', role: 'member' }).id;
const item = (input: Record<string, unknown>) =>
	itemsRepo.create(me.id, itemsRepo.itemCreateSchema.parse(input));
const block = (input: Record<string, unknown>) =>
	blocksRepo.create(me.id, blocksRepo.blockCreateSchema.parse(input));

beforeEach(() => {
	freshDb();
	me = usersRepo.safe(usersRepo.byId(mk('jeremy'))!);
});
afterEach(() => vi.restoreAllMocks());

// ---------- the pure builder ----------
const row = (over: Partial<ItemDTO> = {}): ItemDTO => ({
	id: 'itm_a',
	title: 'A',
	type: null,
	status: 'todo',
	date: D,
	time: null,
	endDate: null,
	parentId: null,
	private: false,
	stepsDone: 0,
	stepsTotal: 0,
	editable: true,
	...over,
});
const feed = (rows: ItemDTO[], over: Partial<FeedInput> = {}) =>
	buildIcs({ timezone: TZ, rows, notes: new Map(), ...over }, NOW);
const tokenOf = (url: string) => url.split('/cal/')[1]?.replace('.ics', '') ?? '';
const physical = (ics: string) => ics.split('\r\n');
const unfolded = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n');
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

it('C10 emits a valid calendar and escapes TEXT, folding every line at 75 octets', () => {
	const long = 'x'.repeat(200);
	const ics = feed([row({ title: 'Back\\slash; comma, newline\nnext' }), row({ id: 'itm_b', title: long })]);

	expect(physical(ics)[0]).toBe('BEGIN:VCALENDAR');
	expect(physical(ics)).toContain('VERSION:2.0');
	expect(physical(ics).some((l) => l.startsWith('PRODID:'))).toBe(true);
	expect(physical(ics).at(-2)).toBe('END:VCALENDAR'); // the string ends with CRLF
	const lines = unfolded(ics);
	expect(lines).toContain('SUMMARY:Back\\\\slash\\; comma\\, newline\\nnext');
	// every physical line <= 75 octets; a folded line continues with one space and unfolds back
	for (const l of physical(ics).filter(Boolean)) expect(bytes(l)).toBeLessThanOrEqual(75);
	const folded = physical(ics).filter((l) => /^ x+$/.test(l));
	expect(folded.length).toBeGreaterThan(0);
	expect(lines).toContain(`SUMMARY:${long}`);

	// multi-byte text never splits a codepoint and still folds at 75 octets
	const wide = 'é'.repeat(100);
	const utf = feed([row({ id: 'itm_c', title: wide })]);
	for (const l of physical(utf).filter(Boolean)) expect(bytes(l)).toBeLessThanOrEqual(75);
	expect(unfolded(utf)).toContain(`SUMMARY:${wide}`);
});

it('C7 all-day DTSTART;VALUE=DATE and an exclusive DTEND on a multi-day item', () => {
	const ics = feed([
		row({ id: 'itm_one', date: '2026-11-13' }),
		row({ id: 'itm_span', date: '2026-11-13', endDate: '2026-11-15' }),
	]);

	expect(unfolded(ics)).toContain('DTSTART;VALUE=DATE:20261113');
	// the single-day one has no DTEND; the 13..15 one ends on the 16th (ICS DTEND is exclusive)
	expect(unfolded(ics).filter((l) => l.startsWith('DTEND;VALUE=DATE:'))).toEqual([
		'DTEND;VALUE=DATE:20261116',
	]);
});

it('C9 timed values are UTC instants with no TZID/VTIMEZONE; 60 minutes unless the earliest block is longer', () => {
	const rows = [row({ id: 'itm_t', time: '09:30' })];
	const plain = feed(rows);
	expect(unfolded(plain)).toContain('DTSTART:20261113T013000Z'); // 09:30 KL
	expect(unfolded(plain)).toContain('DTEND:20261113T023000Z');
	expect(plain).not.toMatch(/TZID|VTIMEZONE/);
	expect(unfolded(plain)).toContain('UID:itm_t@lifetracker');

	const longer = feed(rows, { blockMin: () => 90 });
	expect(unfolded(longer)).toContain('DTEND:20261113T030000Z');
	expect(DEFAULT_MIN).toBe(60);
});

it('C9 private items are Busy with no DESCRIPTION; a public one carries its notes', () => {
	const ics = feed([row({ id: 'itm_sec', title: 'Doctor', private: true }), row({ id: 'itm_pub' })], {
		notes: new Map([
			['itm_sec', 'secret notes'],
			['itm_pub', 'Bring; milk, eggs'],
		]),
	});

	expect(unfolded(ics)).toContain('SUMMARY:Busy');
	expect(ics).not.toContain('secret notes');
	expect(unfolded(ics)).toContain('DESCRIPTION:Bring\\; milk\\, eggs');
	expect(ics).not.toContain('Doctor');
});

it('C8 one VEVENT per series, DTSTART = seriesDate, RRULE subset, UNTIL and EXDATE in both encodings', () => {
	const timed: ItemDTO[] = [D, addDays(D, 1)].map((occ) =>
		row({
			id: `itm_g@${occ}`,
			title: 'Gym',
			date: occ,
			time: '18:00',
			seriesId: 'itm_g',
			seriesDate: D,
			rrule: 'FREQ=DAILY;INTERVAL=2;COUNT=5',
			exdates: ['2026-11-15'],
		}),
	);
	const allDay: ItemDTO[] = [D, addDays(D, 2)].map((occ) =>
		row({
			id: `itm_w@${occ}`,
			title: 'Standup',
			date: occ,
			seriesId: 'itm_w',
			seriesDate: D,
			rrule: 'FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=2027-01-01',
			exdates: ['2026-11-16'],
		}),
	);
	const ics = feed([...timed, ...allDay]);
	const lines = unfolded(ics);

	expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
	expect(lines).toContain('UID:itm_g@lifetracker'); // never the expanded id@date
	expect(lines).not.toContain(`UID:itm_g@${D}@lifetracker`);
	expect(lines).toContain('DTSTART:20261113T100000Z'); // series date, not the occurrence
	expect(lines).toContain('RRULE:FREQ=DAILY;INTERVAL=2;COUNT=5');
	expect(lines).toContain('EXDATE:20261115T100000Z');
	expect(lines).toContain('DTSTART;VALUE=DATE:20261113');
	expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270101');
	expect(lines).toContain('EXDATE;VALUE=DATE:20261116');
});

// ---------- the route ----------
const call = (file: string, ip = '203.0.113.7') =>
	GET({ params: { file }, getClientAddress: () => ip } as unknown as Parameters<typeof GET>[0]);

/** store the hash of a fresh token, as the create action does, and return the token */
function giveFeed(userId: string, token = 'feedtokenfeedtokenfeedtokenfeedtoken1234567890'): string {
	usersRepo.setIcsTokenHash(userId, sha256hex(token));
	return token;
}

it('C2 Create mints a 32-byte URL-safe token and stores only its SHA-256; Turn off clears it', async () => {
	const create = actions.create as unknown as (e: unknown) => Promise<{ url: string }>;
	const off = actions.off as unknown as (e: unknown) => Promise<{ ok: string }>;
	const ev = { user: me } as unknown as App.Locals;
	const loaded = (await load({ locals: ev } as never)) as { exists: boolean };

	expect(loaded.exists).toBe(false);
	const r = await create({ locals: ev });
	expect(r.url).toMatch(/^http:\/\/localhost:5173\/cal\/[A-Za-z0-9_-]{43}\.ics$/);
	const token = tokenOf(r.url ?? '');
	expect(usersRepo.icsTokenHash(me.id)).toBe(sha256hex(token));
	expect(usersRepo.icsTokenHash(me.id)).not.toBe(token); // the plain token is never stored
	expect(usersRepo.icsTokenHash(me.id)).toMatch(/^[0-9a-f]{64}$/);
	expect(((await load({ locals: ev } as never)) as { exists: boolean }).exists).toBe(true);

	await off({ locals: ev });
	expect(usersRepo.icsTokenHash(me.id)).toBeNull();
	expect(((await load({ locals: ev } as never)) as { exists: boolean }).exists).toBe(false);
});

it('C4 Rotate replaces the hash: the old URL is 404 and the new one serves', async () => {
	const oldToken = giveFeed(me.id);
	expect((await call(`${oldToken}.ics`)).status).toBe(200);

	const rotate = actions.rotate as unknown as (e: unknown) => Promise<{ url: string }>;
	const { url } = await rotate({ locals: { user: me } as unknown as App.Locals });
	const fresh = tokenOf(url ?? '');
	expect(fresh).not.toBe(oldToken);
	expect((await call(`${oldToken}.ics`)).status).toBe(404);
	expect((await call(`${fresh}.ics`)).status).toBe(200);
});

it('C5 unknown, malformed, rotated and a forced internal failure all give the same bare 404', async () => {
	const token = giveFeed(me.id);
	// rotated: a newer hash replaced this one
	giveFeed(me.id, 'a-newer-token-that-replaced-the-old-one-0123456789');
	// internal failure: the user has no default calendar any more, so agenda() throws
	handle().sqlite.prepare('UPDATE calendars SET is_default = 0 WHERE owner_id = ?').run(me.id);

	const bodies = new Set<string>();
	for (const file of ['unknown.ics', 'plain', '.ics', 'x.ics', `${token}.ics`]) {
		const r = await call(file);
		expect(r.status).toBe(404);
		expect(r.headers.get('content-type')).toBe('application/json');
		bodies.add(await r.text());
	}
	expect([...bodies]).toEqual(['{}']); // no message, no token echo, no calendar body
});

it('C5 a hit is 200 text/calendar with the private 5-minute cache, and never a 500', async () => {
	const token = giveFeed(me.id);
	const r = await call(`${token}.ics`);
	expect(r.status).toBe(200);
	expect(r.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
	expect(r.headers.get('cache-control')).toBe('private, max-age=300');
	expect(await r.text()).toContain('BEGIN:VCALENDAR');

	handle().sqlite.prepare('UPDATE calendars SET is_default = 0 WHERE owner_id = ?').run(me.id);
	expect((await call(`${token}.ics`)).status).toBe(404); // caught, never a 500
});

it('C6 own default-calendar items only in [today-30, today+365): no partner rows, no blocks, hidden types out', async () => {
	const token = giveFeed(me.id);
	const today = todayLocal(TZ);
	const inside = [
		item({ title: 'Edge old', date: addDays(today, -30) }),
		item({ title: 'Edge new', date: addDays(today, 365) }),
	];
	const outside = [
		item({ title: 'Too old', date: addDays(today, -31) }),
		item({ title: 'Too far', date: addDays(today, 366) }),
	];
	item({ title: 'Gym', type: 'Hobby', date: today });
	block({ label: 'Planner-only block', startAt: '2026-11-13T10:00:00Z', endAt: '2026-11-13T11:00:00Z' });
	const other = mk('neina');
	itemsRepo.create(
		other,
		itemsRepo.itemCreateSchema.parse({ title: 'Partner dinner', type: 'Dating', date: today }),
	);
	// overlap is on and their calendar is shared with me, but the feed stays own-only (O-1 item 4)
	keys.redeem(me.id, keys.create(other, { types: ['Dating'], hiddenAs: 'none', expiry: '7d' }).code);
	usersRepo.setPrefs(me.id, { hiddenTypes: ['Hobby'], overlapOn: true });

	const body = await (await call(`${token}.ics`)).text();
	for (const i of inside) expect(body).toContain(i.title);
	for (const i of outside) expect(body).not.toContain(i.title);
	expect(body).not.toContain('Partner dinner');
	expect(body).not.toContain('Planner-only block');
	expect(body).not.toContain('Gym'); // hidden_types applied inside agenda
});

it('C8 agenda rows carry their stored exdates (toDTO)', () => {
	const gym = item({ title: 'Gym', date: D, rrule: 'FREQ=DAILY;COUNT=4' });
	itemsRepo.skip(me.id, `${gym.id}@${addDays(D, 1)}`);
	const a = agenda(me, D, addDays(D, 3));
	expect(a.items).toHaveLength(2); // D and D+2; D+1 was skipped
	expect(a.items[0]?.exdates).toEqual([addDays(D, 1)]); // every row of the series carries the stored exdates
});

it('C9 DESCRIPTION reads notes once for every exported series; the earliest block sets the timed length', async () => {
	const token = giveFeed(me.id);
	const today = todayLocal(TZ);
	const a = item({ title: 'Alpha', date: today, time: '09:00', notes: 'alpha notes' });
	const b = item({ title: 'Beta', date: today, time: '11:00', notes: 'beta notes' });
	block({ itemId: a.id, startAt: '2026-11-13T01:00:00Z', endAt: '2026-11-13T02:30:00Z' });
	block({ itemId: a.id, startAt: '2026-11-13T05:00:00Z', endAt: '2026-11-13T05:15:00Z' });
	const spy = vi.spyOn(itemsRepo, 'notesFor');

	const body = await (await call(`${token}.ics`)).text();
	expect(spy).toHaveBeenCalledTimes(1); // one batched call (D-V4-37)
	expect(spy.mock.calls[0]?.[0].sort()).toEqual([a.id, b.id].sort());
	expect(body).toContain('DESCRIPTION:alpha notes');
	// 09:00 KL + the earliest block's 90 min
	const at = body.indexOf(`UID:${a.id}@lifetracker`);
	expect(body.slice(at, at + 300)).toContain('DTSTART:');
	expect(body.slice(at, at + 300)).toMatch(/DTSTART:\d{8}T010000Z/);
	expect(body.slice(at, at + 300)).toMatch(/DTEND:\d{8}T023000Z/);
});

it('C11 every request counts per client IP: over 120 in the window is a 429 with no feed body', async () => {
	const token = giveFeed(me.id);
	const ip = '198.51.100.20';
	for (let i = 0; i < 120; i++) expect((await call(`nope${i}.ics`, ip)).status).toBe(404);
	const over = await call(`${token}.ics`, ip);
	expect(over.status).toBe(429);
	expect(await over.text()).toBe('{}');
	expect((await call(`${token}.ics`, '198.51.100.21')).status).toBe(200); // another IP keeps its budget
});

it('C6 agenda keeps its 62-day default and takes maxDays for the feed range', () => {
	expect(() => agenda(me, D, addDays(D, 63))).toThrow('range 1..62 days');
	expect(agenda(me, D, addDays(D, 62))).toEqual({ items: [], blocks: [] });
	expect(agenda(me, D, addDays(D, 396), { maxDays: 400 })).toEqual({ items: [], blocks: [] });
	expect(() => agenda(me, D, addDays(D, 401), { maxDays: 400 })).toThrow('range 1..400 days');
});

it('C6 the feed range starts 30 days back and ends today +365 (inclusive)', async () => {
	const today = todayLocal(TZ);
	expect(isDate(today)).toBe(true);
	const token = giveFeed(me.id);
	const old = item({ title: 'Old edge', date: addDays(today, -30) });
	const future = item({ title: 'Future edge', date: addDays(today, 365) });
	const body = await (await call(`${token}.ics`)).text();
	expect(body).toContain(old.title);
	expect(body).toContain(future.title);
});
