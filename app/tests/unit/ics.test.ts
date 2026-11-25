import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, fold, vtimezone, type IcsItem } from '../../src/lib/server/ics';

const now = Date.UTC(2026, 10, 25, 4, 0, 0);
const item = (o: Partial<IcsItem>): IcsItem => ({
	id: 'itm_1',
	title: 'Dentist',
	date: '2026-11-26',
	time: null,
	endDate: null,
	private: false,
	rrule: null,
	exdates: [],
	...o,
});
const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('ics text', () => {
	it('escapes backslash, semicolon, comma, newline', () => {
		expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
	});

	it('folds at 75 octets without splitting a multi-byte char', () => {
		const line = 'SUMMARY:' + 'é'.repeat(60);
		const parts = fold(line).split('\r\n');
		expect(parts.length).toBeGreaterThan(1);
		for (const p of parts) expect(Buffer.byteLength(p)).toBeLessThanOrEqual(75);
		expect(unfold(fold(line))).toBe(line);
		expect(fold('short')).toBe('short');
	});

	it('all-day item is VALUE=DATE with exclusive end; multi-day spans', () => {
		const t = buildIcs({ tz: 'Asia/Kuala_Lumpur', now, items: [item({ endDate: '2026-11-28' })] });
		expect(t).toContain('DTSTART;VALUE=DATE:20261126\r\n');
		expect(t).toContain('DTEND;VALUE=DATE:20261129\r\n');
		expect(t).toContain('UID:itm_1@lifetracker');
		expect(t).not.toContain('BEGIN:VTIMEZONE'); // no timed items
		expect(t.endsWith('END:VCALENDAR\r\n')).toBe(true);
	});

	it('timed item carries TZID, 60 min default or block length, and a VTIMEZONE', () => {
		const t = buildIcs({ tz: 'Asia/Kuala_Lumpur', now, items: [item({ time: '23:30' }), item({ id: 'itm_2', time: '09:00', minutes: 90 })] }); // prettier-ignore
		expect(t).toContain('DTSTART;TZID=Asia/Kuala_Lumpur:20261126T233000');
		expect(t).toContain('DTEND;TZID=Asia/Kuala_Lumpur:20261127T003000'); // crosses midnight
		expect(t).toContain('DTEND;TZID=Asia/Kuala_Lumpur:20261126T103000');
		expect(t).toContain('BEGIN:VTIMEZONE\r\nTZID:Asia/Kuala_Lumpur\r\nBEGIN:STANDARD');
		expect(t).toContain('TZOFFSETTO:+0800');
	});

	it('private item exports as Busy with no title', () => {
		const t = buildIcs({ tz: 'UTC', now, items: [item({ title: 'Secret, thing', private: true })] });
		expect(t).toContain('SUMMARY:Busy');
		expect(t).not.toContain('Secret');
	});

	it('repeat → RRULE + EXDATE; UNTIL typed to DTSTART', () => {
		const allDay = buildIcs({ tz: 'UTC', now, items: [item({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=2027-01-31', exdates: ['2026-12-02'] })] }); // prettier-ignore
		expect(allDay).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270131\r\n');
		expect(allDay).toContain('EXDATE;VALUE=DATE:20261202');
		const timed = buildIcs({ tz: 'Asia/Kuala_Lumpur', now, items: [item({ time: '08:00', rrule: 'FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;UNTIL=2027-06-30', exdates: ['2026-12-25'] })] }); // prettier-ignore
		expect(timed).toContain('RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;UNTIL=20270630T155900Z');
		expect(timed).toContain('EXDATE;TZID=Asia/Kuala_Lumpur:20261225T080000');
		const count = buildIcs({ tz: 'UTC', now, items: [item({ rrule: 'FREQ=DAILY;COUNT=5' })] });
		expect(count).toContain('RRULE:FREQ=DAILY;COUNT=5');
	});

	it('DST zones get yearly rules (n-th / last weekday) so every year of the feed is covered', () => {
		const ny = vtimezone('America/New_York', 2026).join('|');
		expect(ny).toContain('BEGIN:DAYLIGHT|DTSTART:19700308T020000|RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU|TZOFFSETFROM:-0500|TZOFFSETTO:-0400'); // prettier-ignore
		expect(ny).toContain('BEGIN:STANDARD|DTSTART:19701101T020000|RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU|TZOFFSETFROM:-0400|TZOFFSETTO:-0500'); // prettier-ignore
		expect(vtimezone('Europe/London', 2026).join('|')).toContain('DTSTART:19700329T010000|RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU'); // prettier-ignore
		const syd = vtimezone('Australia/Sydney', 2026).join('|'); // southern hemisphere: DST over New Year
		expect(syd).toContain('BEGIN:STANDARD|DTSTART:19700405T030000|RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU|TZOFFSETFROM:+1100|TZOFFSETTO:+1000'); // prettier-ignore
		expect(syd).toContain('BEGIN:DAYLIGHT|DTSTART:19701004T020000|RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU'); // prettier-ignore
	});

	it('timed multi-day item ends on its end date; lone CR is escaped', () => {
		const t = buildIcs({ tz: 'UTC', now, items: [item({ time: '20:00', endDate: '2026-11-28', title: 'a\rb' })] }); // prettier-ignore
		expect(t).toContain('DTSTART;TZID=UTC:20261126T200000');
		expect(t).toContain('DTEND;TZID=UTC:20261128T210000');
		expect(t).toContain('SUMMARY:a\\nb');
	});
});

describe('ics feed (db)', async () => {
	const { freshDb } = await import('./helpers');
	const usersRepo = await import('../../src/lib/server/repo/users');
	const items = await import('../../src/lib/server/repo/items');
	const blocks = await import('../../src/lib/server/repo/blocks');
	const { icsFeed } = await import('../../src/lib/server/icsfeed');
	const NOW = Date.parse('2026-11-13T02:00:00Z'); // 10:00 KL

	it('token: stored hashed, rotate kills the old one, off = none, disabled user = none', () => {
		freshDb({ JOBS_ENABLED: 'false' });
		const u = usersRepo.createWithCalendar({
			username: 'a',
			displayName: 'A',
			passwordHash: 'x',
			role: 'admin',
		});
		const t1 = usersRepo.newIcsToken(u.id);
		expect(t1).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(usersRepo.byId(u.id)?.icsTokenHash).not.toContain(t1);
		expect(usersRepo.byIcsToken(t1)?.id).toBe(u.id);
		const t2 = usersRepo.newIcsToken(u.id);
		expect(usersRepo.byIcsToken(t1)).toBeUndefined();
		expect(usersRepo.byIcsToken(t2)?.id).toBe(u.id);
		usersRepo.disable(u.id);
		expect(usersRepo.byIcsToken(t2)).toBeUndefined();
		usersRepo.clearIcsToken(u.id);
		expect(usersRepo.byId(u.id)?.icsTokenHash).toBeNull();
	});

	it('own items only, series once with RRULE, window −30…+365, hidden types out, block length used', () => {
		freshDb({ JOBS_ENABLED: 'false' });
		const me = usersRepo.safe(usersRepo.createWithCalendar({ username: 'me', displayName: 'Me', passwordHash: 'x', role: 'admin' })); // prettier-ignore
		const other = usersRepo.createWithCalendar({ username: 'o', displayName: 'O', passwordHash: 'x', role: 'member' }); // prettier-ignore
		const mk = (uid: string, o: Record<string, unknown>) =>
			items.create(uid, items.itemCreateSchema.parse(o));
		mk(me.id, { title: 'Gym', date: '2026-11-02', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
		const lab = mk(me.id, { title: 'Lab', date: '2026-11-14', time: '09:00' });
		blocks.create(me.id, blocks.blockCreateSchema.parse({ label: 'Lab', itemId: lab.id, startAt: '2026-11-14T01:00:00Z', endAt: '2026-11-14T03:30:00Z' })); // prettier-ignore
		mk(me.id, { title: 'Old', date: '2026-09-01' }); // before the window
		mk(me.id, { title: 'Ended', date: '2026-01-05', rrule: 'FREQ=DAILY;UNTIL=2026-02-01' });
		mk(me.id, { title: 'Far', date: '2028-01-01' }); // after the window
		mk(me.id, { title: 'Hobby thing', date: '2026-11-20', type: 'Hobby' });
		mk(other.id, { title: 'Partner item', date: '2026-11-15' });
		const t = icsFeed({ ...me, hiddenTypes: ['Hobby'] }, NOW);
		expect(t.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(t).toContain('SUMMARY:Gym');
		expect(t).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
		expect(t).toContain('DTEND;TZID=Asia/Kuala_Lumpur:20261114T113000'); // 150 min block
		for (const s of ['Old', 'Ended', 'Far', 'Hobby', 'Partner']) expect(t).not.toContain(s);
	});
});

describe('GET /cal/<token>.ics', async () => {
	const { freshDb } = await import('./helpers');
	const usersRepo = await import('../../src/lib/server/repo/users');
	const { GET } = await import('../../src/routes/cal/[file]/+server');
	const call = async (file: string, ip = '10.0.0.1') => {
		try {
			const r = await GET({ params: { file }, getClientAddress: () => ip } as never);
			return r.status;
		} catch (e) {
			return (e as { status: number }).status;
		}
	};

	it('200 for a live token; 404 for bad, unknown, disabled; 429 after 120 fetches per IP', async () => {
		freshDb({ JOBS_ENABLED: 'false' });
		const u = usersRepo.createWithCalendar({
			username: 'a',
			displayName: 'A',
			passwordHash: 'x',
			role: 'admin',
		});
		const tok = usersRepo.newIcsToken(u.id);
		expect(await call(`${tok}.ics`)).toBe(200);
		expect(await call('nope.ics')).toBe(404);
		expect(await call(`${'A'.repeat(43)}.ics`)).toBe(404);
		expect(await call(tok)).toBe(404); // no .ics
		usersRepo.disable(u.id);
		expect(await call(`${tok}.ics`)).toBe(404);
		for (let i = 0; i < 119; i++) await call('x.ics', '10.0.0.2');
		expect(await call('x.ics', '10.0.0.2')).toBe(404); // 120th still served
		expect(await call('x.ics', '10.0.0.2')).toBe(429);
		expect(await call('x.ics', '10.0.0.3')).toBe(404); // other IP unaffected
	});
});
