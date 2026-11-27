// Blind tests for card 11 (.ics calendar file import), written from its Done-when lines only.
// No builder test was opened. In-memory DB only: the real data folder is never touched.
import { beforeEach, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { freshDb } from './helpers';
import type { Handle } from '../../src/lib/server/db';
import { ApiFail } from '../../src/lib/server/http';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as itemTypesRepo from '../../src/lib/server/repo/itemtypes';
import * as itemsRepo from '../../src/lib/server/repo/items';
import { undo } from '../../src/lib/server/undo';
import { MAX_BYTES, MAX_EVENTS, importIcs, parseIcs, previewFor } from '../../src/lib/server/ics-import';
import { actions, load } from '../../src/routes/settings/import/+page.server';

const TZ = 'Asia/Kuala_Lumpur';
const wrap = (...lines: string[]) =>
	['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//blind 11//EN', ...lines, 'END:VCALENDAR'].join('\r\n'); // prettier-ignore
const ev = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const parse = (raw: string, tz = TZ) => parseIcs(raw, tz);
const start = (date: string, time: string) => `DTSTART:${date.replace(/-/g, '')}T${time.replace(':', '')}00`; // prettier-ignore

let h: Handle;
let me: App.SafeUser;
let partner: App.SafeUser;
let myCal: string;

const mk = (u: string, role: 'admin' | 'member') => {
	const r = usersRepo.createWithCalendar({ username: u, displayName: u, passwordHash: 'x', role });
	return usersRepo.safe(r);
};

const rowOf = (uid: string) =>
	h.sqlite.prepare('SELECT * FROM items WHERE ics_uid = ? AND deleted_at IS NULL').get(uid) as
		Record<string, unknown> | undefined;
const count = (sql: string, ...args: unknown[]) => (h.sqlite.prepare(sql).get(...args) as { n: number }).n;
const undoCount = () => count('SELECT count(*) AS n FROM undo_actions');

function status(fn: () => unknown): ApiFail {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(ApiFail);
		return e as ApiFail;
	}
	throw new Error('expected ApiFail');
}

beforeEach(() => {
	h = freshDb();
	me = mk('jeremy', 'admin');
	partner = mk('partner', 'member');
	myCal = itemsRepo.myCalendarIds(me.id)[0]!;
});

// ---- C1 ---------------------------------------------------------------------------------------------------
it('C1 size limit: 1 000 000 bytes is the cap, the preview action refuses a 1 000 001-byte file part with the inline message and writes nothing', async () => {
	expect(MAX_BYTES).toBe(1_000_000);
	const preview = actions.preview as unknown as (e: unknown) => Promise<unknown>;
	const event = (e: unknown) => preview({ locals: { user: me }, request: e });
	const req = (size: number) => {
		const fd = new FormData();
		fd.set('file', new File([new Uint8Array(size)], 'blind.ics', { type: 'text/calendar' }));
		return new Request('http://localhost:5173/settings/import?/preview', {
			method: 'POST',
			body: fd,
		});
	};

	// exactly the cap: accepted, parsed as an empty calendar
	expect(await event(req(1_000_000))).toMatchObject({ ics: { events: 0, skipped: [] } });
	// one byte over: the same inline error the client shows, never a toast
	const over = (await event(req(1_000_001))) as { status: number; data: { icsError: string } };
	expect(over.status).toBe(400);
	expect(over.data.icsError).toBe('The file is over 1 MB.');
	// nothing was written
	expect(count('SELECT count(*) AS n FROM items')).toBe(0);
	expect(undoCount()).toBe(0);
});

// ---- C2 ---------------------------------------------------------------------------------------------------
it('C2 preview counts: N importable with M repeating, K skipped separately (duplicate UID + no ID), shortened titles reported, and the default type is the first off-Month type', async () => {
	const uid = (n: string) => `blind11-c2-${n}`;
	const long = 'L'.repeat(320);
	const raw = wrap(
		ev(`UID:${uid('a')}`, 'SUMMARY:Blind C2 A', start('2026-03-02', '09:00')),
		ev(`UID:${uid('b')}`, 'SUMMARY:Blind C2 B', start('2026-03-02', '09:00'), 'RRULE:FREQ=WEEKLY;BYDAY=MO'),
		ev(`UID:${uid('c')}`, `SUMMARY:${long}`, start('2026-03-02', '09:00')),
		ev(`UID:${uid('a')}`, 'SUMMARY:Blind C2 dup', start('2026-03-03', '09:00')),
		ev('SUMMARY:Blind C2 no uID', start('2026-03-04', '09:00')),
	);
	const parsed = parse(raw);
	const p = previewFor(me.id, parsed);
	expect({ events: p.events, repeating: p.repeating, shortened: p.shortened }).toEqual({
		events: 3,
		repeating: 1,
		shortened: 1,
	});
	expect(p.skipped.map((s) => s.reason)).toEqual(['duplicate UID', 'no ID']);
	expect(p.skipped.map((s) => s.title)).toEqual(['Blind C2 dup', 'Blind C2 no uID']);
	expect(p.willUpdate).toBe(0);

	// after importing, the same UIDs are "already imported" (the Import button counts N, not N + K)
	importIcs(me, parsed, null);
	expect(previewFor(me.id, parsed).willUpdate).toBe(3);
	expect(count('SELECT count(*) AS n FROM items WHERE ics_uid LIKE ?', 'blind11-c2-%')).toBe(3);

	// the load's default: every type on -> None; then the first off-Month type in position order
	const loadAs = (u: App.SafeUser) =>
		load({ locals: { user: u } } as never) as unknown as {
			defaultType: string;
			types: { key: string; name: string; onCalendar: boolean }[];
		};
	expect(loadAs(me).defaultType).toBe('');
	for (const t of itemTypesRepo.list(me.id)) expect(typeof t.onCalendar, t.key).toBe('boolean');
	const work = itemTypesRepo.list(me.id)[0]!;
	const hobby = itemTypesRepo.list(me.id)[3]!;
	itemTypesRepo.patch(me.id, hobby.id, { onCalendar: false });
	itemTypesRepo.patch(me.id, work.id, { onCalendar: false });
	expect(loadAs(me).defaultType).toBe('Work'); // position 0 beats Hobby at position 3
	itemTypesRepo.patch(me.id, work.id, { onCalendar: true });
	expect(loadAs(me).defaultType).toBe('Hobby');
	expect(loadAs(me).types.map((t) => t.key)).toEqual(['Work', 'Exam', 'Event', 'Hobby', 'Dating']);
});

// ---- C3 ---------------------------------------------------------------------------------------------------
it('C3 parser walks VEVENTs only, unfolds CRLF + space/tab, decodes \\\\ \\, \\; \\n, ignores VTIMEZONE/VALARM/VTODO/VJOURNAL/unknown props, first UID wins, no UID skipped, Untitled and 300-char titles', () => {
	const long = 'x'.repeat(320);
	const raw = wrap(
		'BEGIN:VTIMEZONE',
		'TZID:Europe/London',
		'BEGIN:STANDARD',
		'DTSTART:19701025T020000',
		'END:STANDARD',
		'END:VTIMEZONE',
		'BEGIN:VTODO',
		'UID:todo-1',
		'SUMMARY:Not an event',
		start('2026-03-01', '09:00'),
		'END:VTODO',
		'BEGIN:VJOURNAL',
		'UID:journal-1',
		'SUMMARY:Journal',
		'END:VJOURNAL',
		ev(
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			'SUMMARY:Alarm text',
			'TRIGGER:-PT15M',
			'END:VALARM',
			'UID:blind-u3',
			'X-BLIND:ignore me',
			'SUMMARY:Blind fol',
			' ded\\, A\\; B\\nC',
			'DTSTART:2026030',
			'\t2T090000',
		),
		ev('UID:blind-u4', 'SUMMARY:', start('2026-03-03', '09:00')),
		ev(start('2026-03-04', '09:00')),
		ev('UID:blind-u5', 'SUMMARY:Blind dup first', start('2026-03-05', '09:00')),
		ev('UID:blind-u5', 'SUMMARY:Blind dup second', start('2026-03-06', '09:00')),
		ev('UID:blind-u6', `SUMMARY:${long}`, start('2026-03-07', '09:00')),
	);
	const p = parse(raw);
	expect(p.total).toBe(6); // six VEVENTs; VTODO/VJOURNAL are not events
	expect(p.events.map((e) => e.title)).toEqual([
		'Blind folded, A; B\nC',
		'Untitled',
		'Blind dup first',
		'x'.repeat(300),
	]);
	expect(p.events[0]).toMatchObject({ uid: 'blind-u3', date: '2026-03-02', time: '09:00' });
	expect(p.skipped).toEqual([
		{ title: 'Untitled', reason: 'no ID' },
		{ title: 'Blind dup second', reason: 'duplicate UID' },
	]);
	expect(p.shortened).toBe(1);

	// the first UID wins even when it is skipped for another reason: the later one is still a duplicate
	const firstSkipped = parse(
		wrap(
			ev('UID:blind-u7', 'SUMMARY:Bad zone', 'DTSTART;TZID=Nowhere/Special:20260302T090000'),
			ev('UID:blind-u7', 'SUMMARY:Later copy', start('2026-03-02', '09:00')),
		),
	);
	expect(firstSkipped.events).toHaveLength(0);
	expect(firstSkipped.skipped.map((s) => s.reason)).toEqual([
		'unknown time zone — not supported',
		'duplicate UID',
	]);
});

// ---- C4 ---------------------------------------------------------------------------------------------------
it('C4 DTSTART becomes the user local date/time (UTC + IANA via TZDate, floating as-is, DATE = all-day), Windows TZIDs skip, and DTEND rules hold', () => {
	const raw = wrap(
		ev('UID:utc', 'SUMMARY:UTC', 'DTSTART:20260228T230000Z'),
		ev('UID:iana', 'SUMMARY:London', 'DTSTART;TZID=Europe/London:20260215T090000'),
		ev('UID:ianaq', 'SUMMARY:London quoted', 'DTSTART;TZID="Europe/London":20260215T100000'),
		ev('UID:float', 'SUMMARY:Floating', start('2026-02-15', '09:00')),
		ev('UID:allday', 'SUMMARY:All day', 'DTSTART;VALUE=DATE:20260215'),
		ev('UID:win', 'SUMMARY:Windows', 'DTSTART;TZID="W. Europe Standard Time":20260215T090000'),
		ev('UID:win2', 'SUMMARY:Pacific', 'DTSTART;TZID=Pacific Standard Time:20260215T090000'),
		ev('UID:allday-end', 'SUMMARY:Multi day', 'DTSTART;VALUE=DATE:20260302', 'DTEND;VALUE=DATE:20260305'),
		ev('UID:allday-one', 'SUMMARY:One day', 'DTSTART;VALUE=DATE:20260302', 'DTEND;VALUE=DATE:20260303'),
		ev('UID:timed-same', 'SUMMARY:Timed', start('2026-03-02', '09:00'), 'DTEND:20260302T100000'),
		ev('UID:timed-cross', 'SUMMARY:Overnight', 'DTSTART:20260301T150000Z', 'DTEND:20260301T170000Z'),
	);
	const p = parse(raw);
	const byUid = new Map(p.events.map((e) => [e.uid, e]));
	expect(p.events).toHaveLength(9);
	expect(p.skipped.map((s) => s.reason)).toEqual([
		'unknown time zone — not supported',
		'unknown time zone — not supported',
	]);
	expect([...p.skipped.map((s) => s.title)]).toEqual(['Windows', 'Pacific']);

	expect(byUid.get('utc')).toMatchObject({ date: '2026-03-01', time: '07:00' }); // 23:00Z -> 07:00 KL
	expect(byUid.get('iana')).toMatchObject({ date: '2026-02-15', time: '17:00' }); // GMT winter
	expect(byUid.get('ianaq')).toMatchObject({ date: '2026-02-15', time: '18:00' });
	expect(byUid.get('float')).toMatchObject({ date: '2026-02-15', time: '09:00' });
	expect(byUid.get('allday')).toMatchObject({ date: '2026-02-15', time: null });

	expect(byUid.get('allday-end')?.endDate).toBe('2026-03-04'); // exclusive DTEND - 1 day
	expect(byUid.get('allday-one')?.endDate).toBeNull();
	expect(byUid.get('timed-same')?.endDate).toBeNull();
	expect(byUid.get('timed-cross')).toMatchObject({
		date: '2026-03-01',
		time: '23:00',
		endDate: '2026-03-02',
	});
});

// ---- C5 ---------------------------------------------------------------------------------------------------
it('C5 RRULE is imported only when parseRRule accepts it; a UTC UNTIL is converted to the user local date; other parts skip the event with a plain-words reason', () => {
	const rule = (n: string, r: string) => ev(`UID:rule-${n}`, `SUMMARY:${n}`, start('2026-03-02', '09:00'), `RRULE:${r}`); // prettier-ignore
	const p = parse(
		wrap(
			rule('ok1', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10'),
			rule('ok2', 'FREQ=DAILY;UNTIL=20260228T160000Z'),
			rule('setpos', 'FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1'),
			rule('hourly', 'FREQ=HOURLY;INTERVAL=2'),
			rule('minutely', 'FREQ=MINUTELY'),
			rule('weekno', 'FREQ=WEEKLY;BYWEEKNO=20'),
			rule('bymonth', 'FREQ=MONTHLY;BYMONTH=3;BYMONTHDAY=1'),
			rule('wkst', 'FREQ=WEEKLY;BYDAY=MO;WKST=SU'),
			rule('interval', 'FREQ=DAILY;INTERVAL=100'),
			rule('count', 'FREQ=DAILY;COUNT=1000'),
			rule('monthday', 'FREQ=MONTHLY;BYMONTHDAY=32'),
			rule('weekday', 'FREQ=DAILY;BYDAY=XX'),
			rule('until', 'FREQ=DAILY;UNTIL=garbage'),
		),
	);
	const byUid = new Map(p.events.map((e) => [e.uid, e]));
	expect(p.repeating).toBe(2);
	expect(byUid.get('rule-ok1')?.rrule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10');
	// UNTIL=2026-02-28 16:00Z is 2026-03-01 00:00 in KL: truncating the instant would land a day early
	expect(byUid.get('rule-ok2')?.rrule).toBe('FREQ=DAILY;UNTIL=2026-03-01');
	expect(p.skipped.map((s) => s.reason)).toEqual([
		'repeats by set position, not supported',
		'repeats hourly, not supported',
		'repeats by the minute, not supported',
		'repeats by week number, not supported',
		'repeats by month, not supported',
		'uses a week start, not supported',
		'repeat interval out of range',
		'repeat count out of range',
		'repeat day out of range',
		'repeat weekdays not understood',
		'repeat end not understood',
	]);

	// west of UTC too: 2026-03-01 02:00Z is still Feb 28 in New York
	const ny = parse(rule('ny', 'FREQ=DAILY;UNTIL=20260301T020000Z'), 'America/New_York');
	expect(ny.events[0]?.rrule).toBe('FREQ=DAILY;UNTIL=2026-02-28');
});

// ---- C6 ---------------------------------------------------------------------------------------------------
it('C6 EXDATE values become local dates from one list or several lines; an unparseable value is ignored and the event still imports', () => {
	const p = parse(
		wrap(
			ev(
				'UID:ex1',
				'SUMMARY:Exdates',
				start('2026-03-02', '09:00'),
				'EXDATE;TZID=Europe/London:20260308T090000,20260315T090000',
				start('2026-03-16', '09:00').replace('DTSTART', 'EXDATE'),
				'EXDATE;VALUE=DATE:20260320',
				'EXDATE:not-a-date,20260321',
				'EXDATE:20260228T230000Z',
			),
			ev('UID:ex2', 'SUMMARY:Bad exdate', start('2026-03-02', '09:00'), 'EXDATE:nonsense,also bad'), // prettier-ignore
		),
	);
	expect(p.events).toHaveLength(2);
	expect(p.events[0]?.exdates).toEqual([
		'2026-03-01',
		'2026-03-08',
		'2026-03-15',
		'2026-03-16',
		'2026-03-20',
		'2026-03-21',
	]);
	expect(p.events[1]?.exdates).toEqual([]);
});

// ---- C7 ---------------------------------------------------------------------------------------------------
it('C7 import writes ordinary todo items in my default calendar: chosen type validated, source NULL, ics_uid, no reminders, no partner write', () => {
	const parsed = parse(
		wrap(
			ev('UID:c7a', 'SUMMARY:Blind C7 timed', start('2026-03-02', '09:00'), 'DTEND:20260302T100000'),
			ev('UID:c7b', 'SUMMARY:Blind C7 all day', 'DTSTART;VALUE=DATE:20260303'),
		),
	);
	const done = importIcs(me, parsed, 'Work');
	expect({ imported: done.imported, updated: done.updated, events: done.events }).toEqual({
		imported: 2,
		updated: 0,
		events: 2,
	});
	const a = rowOf('c7a')!;
	expect(a).toMatchObject({
		calendar_id: myCal,
		type: 'Work',
		title: 'Blind C7 timed',
		date: '2026-03-02',
		time: '09:00',
		end_date: null,
		status: 'todo',
		source: null,
		repeat_from_completion: 0,
		created_by: me.id,
	});
	expect(rowOf('c7b')).toMatchObject({ time: null, end_date: null });
	expect(count('SELECT count(*) AS n FROM reminders WHERE source_id IN (?, ?)', a.id, rowOf('c7b')!.id)).toBe(
		0,
	);

	// an unknown type is refused before any write; None is fine
	const more = parse(wrap(ev('UID:c7c', 'SUMMARY:Blind C7 more', start('2026-03-04', '09:00'))));
	expect(status(() => importIcs(me, more, 'NoSuchType')).code).toBe('bad_type');
	expect(rowOf('c7c')).toBeUndefined();
	expect(importIcs(me, more, null).imported).toBe(1);
	expect(rowOf('c7c')?.type).toBeNull();

	// the partner's calendar never receives a row
	expect(
		count('SELECT count(*) AS n FROM items WHERE calendar_id = ?', itemsRepo.myCalendarIds(partner.id)[0]!),
	).toBe(0);
});

// ---- C8 ---------------------------------------------------------------------------------------------------
it('C8 limits: more than 2 000 VEVENTs refuses the whole file with the count, and a batch past ROW_CAP refuses before writing', () => {
	expect(MAX_EVENTS).toBe(2_000);
	const many = parse(
		wrap(
			...Array.from({ length: 2_001 }, (_, i) =>
				ev(`UID:c8-${i}`, `SUMMARY:Blind C8 ${i}`, start('2026-03-02', '09:00')),
			),
		),
	);
	expect(many.total).toBe(2_001);
	const tooMany = status(() => previewFor(me.id, many));
	expect(tooMany.status).toBe(400);
	expect(tooMany.message).toContain('2001 events');
	expect(tooMany.message).toContain('2000');
	expect(status(() => importIcs(me, many, null)).status).toBe(400);
	expect(count('SELECT count(*) AS n FROM items')).toBe(0);
	expect(undoCount()).toBe(0);

	// ROW_CAP: 50 000 rows already in my calendar, one new UID would pass it
	h.sqlite
		.prepare(
			`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 50000)
			 INSERT INTO items (id, calendar_id, title, created_at, updated_at)
			 SELECT 'itm_cap' || x, ?, 'cap', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z' FROM n`,
		)
		.run(myCal);
	expect(count('SELECT count(*) AS n FROM items')).toBe(50_000);
	const one = parse(wrap(ev('UID:c8-cap', 'SUMMARY:Blind C8 cap', start('2026-03-02', '09:00'))));
	const cap = status(() => importIcs(me, one, null));
	expect(cap.status).toBe(400);
	expect(cap.message).toContain('50000');
	expect(count('SELECT count(*) AS n FROM items')).toBe(50_000); // nothing half-imported
	expect(undoCount()).toBe(0);
});

// ---- C9 ---------------------------------------------------------------------------------------------------
it('C9 re-import matches live ics_uid rows in my calendar: title/time/rrule/exdates update, date never; new UIDs insert; missing UIDs stay; a trashed row does not match', () => {
	const file = (title: string, day: string, time: string, extra: string[] = []) =>
		wrap(ev('UID:c9-keep', `SUMMARY:${title}`, start(day, time), ...extra));
	importIcs(me, parse(file('Blind C9 orig', '2026-03-02', '09:00', ['RRULE:FREQ=WEEKLY;BYDAY=MO'])), null); // prettier-ignore
	const first = rowOf('c9-keep')!;
	expect(first).toMatchObject({ title: 'Blind C9 orig', date: '2026-03-02', time: '09:00' });

	const next = parse(
		wrap(
			ev(
				'UID:c9-keep',
				'SUMMARY:Blind C9 new',
				start('2026-03-09', '10:30'),
				'RRULE:FREQ=DAILY',
				'EXDATE:20260310',
			),
			ev('UID:c9-new', 'SUMMARY:Blind C9 inserted', start('2026-03-11', '09:00')),
		),
	);
	expect(previewFor(me.id, next).willUpdate).toBe(1);
	const done = importIcs(me, next, null);
	expect({ imported: done.imported, updated: done.updated }).toEqual({ imported: 1, updated: 1 });
	const kept = rowOf('c9-keep')!;
	expect(kept.id).toBe(first.id); // never a second row
	expect(kept).toMatchObject({
		title: 'Blind C9 new',
		time: '10:30',
		date: '2026-03-02', // date is never updated
		rrule: 'FREQ=DAILY',
	});
	expect(JSON.parse(String(kept.exdates))).toEqual(['2026-03-10']);
	expect(rowOf('c9-new')).toBeTruthy();
	expect(rowOf('c9-keep')!.title).toBe('Blind C9 new');

	// a UID absent from the new file is left untouched (no silent delete)
	importIcs(
		me,
		parse(wrap(ev('UID:c9-other', 'SUMMARY:Blind C9 other', start('2026-03-12', '09:00')))),
		null,
	);
	expect(rowOf('c9-keep')?.title).toBe('Blind C9 new');
	expect(rowOf('c9-new')).toBeTruthy();

	// a trashed row with that UID is left alone and does not match: re-import inserts a fresh row
	itemsRepo.softDelete(me.id, String(first.id));
	expect(
		h.sqlite.prepare('SELECT deleted_at FROM items WHERE id = ?').get(first.id) as { deleted_at: string },
	).toMatchObject({ deleted_at: expect.any(String) });
	expect(previewFor(me.id, parse(file('Blind C9 back', '2026-03-13', '09:00'))).willUpdate).toBe(0);
	const back = importIcs(me, parse(file('Blind C9 back', '2026-03-13', '09:00')), null);
	expect(back.imported).toBe(1);
	const fresh = rowOf('c9-keep')!;
	expect(fresh.id).not.toBe(first.id);
	expect(fresh.title).toBe('Blind C9 back');
	expect(count('SELECT count(*) AS n FROM items WHERE ics_uid = ? AND deleted_at IS NULL', 'c9-keep')).toBe(
		1,
	);
	expect(
		count('SELECT count(*) AS n FROM items WHERE ics_uid = ? AND deleted_at IS NOT NULL', 'c9-keep'),
	).toBe(1);
});

// ---- C10 --------------------------------------------------------------------------------------------------
it('C10 one undo entry: every inserted row is a created target and every updated row a before-target; one Undo removes the inserts and restores the update', () => {
	importIcs(me, parse(wrap(ev('UID:c10-keep', 'SUMMARY:Blind C10 orig', start('2026-03-02', '09:00')))), null); // prettier-ignore
	const keptId = String(rowOf('c10-keep')!.id);
	expect(undoCount()).toBe(1);

	const p = parse(
		wrap(
			ev('UID:c10-keep', 'SUMMARY:Blind C10 changed', start('2026-03-02', '11:00')),
			ev('UID:c10-new1', 'SUMMARY:Blind C10 new 1', start('2026-03-03', '09:00')),
			ev('UID:c10-new2', 'SUMMARY:Blind C10 new 2', start('2026-03-04', '09:00')),
		),
	);
	const done = importIcs(me, p, null);
	expect({ imported: done.imported, updated: done.updated }).toEqual({ imported: 2, updated: 1 });
	expect(done.undo.label).toBe('Import 3 events');
	expect(undoCount()).toBe(2);

	const journal = h.sqlite
		.prepare('SELECT id, label, rows FROM undo_actions ORDER BY created_at DESC, rowid DESC LIMIT 1')
		.get() as { id: string; label: string; rows: string };
	expect(journal.label).toBe('Import 3 events');
	const rows = JSON.parse(journal.rows) as { id: string; before: Record<string, unknown> | null }[];
	expect(rows).toHaveLength(3);
	expect(rows.filter((r) => r.before === null).map((r) => r.id)).toHaveLength(2);
	const updated = rows.find((r) => r.id === keptId)!;
	expect(updated.before).toMatchObject({ title: 'Blind C10 orig', time: '09:00' });

	// the toast's Undo passes that one journal id: inserted rows go, the updated row comes back
	expect(undo(me.id, done.undo.id).label).toBe('Import 3 events');
	expect(rowOf('c10-new1')).toBeUndefined();
	expect(rowOf('c10-new2')).toBeUndefined();
	expect(rowOf('c10-keep')).toMatchObject({ title: 'Blind C10 orig', time: '09:00' });
	expect(undoCount()).toBe(2); // one action, marked undone - not a second entry
	expect(count('SELECT count(*) AS n FROM undo_actions WHERE undone_at IS NULL')).toBe(1);
});

// ---- C13 --------------------------------------------------------------------------------------------------
it('C13 the page is admin-only (404 for a member) and the import writes only the signed-in user own calendar, never matching a partner row with the same UID', async () => {
	// the route load and the preview action refuse a member with a plain 404 before reading the body
	expect(() => load({ locals: { user: partner } } as never)).toThrow();
	try {
		load({ locals: { user: partner } } as never);
		expect.unreachable('a member must not load the import page');
	} catch (e) {
		expect(isHttpError(e, 404)).toBe(true);
	}
	const preview = actions.preview as unknown as (e: unknown) => Promise<unknown>;
	await expect(
		preview({
			locals: { user: partner },
			request: {
				formData: () => {
					throw new Error('the body must not be read for a member');
				},
			},
		}),
	).rejects.toSatisfy((e) => isHttpError(e, 404));

	// a partner row with the same UID is never matched, read or written: the import lands in my calendar only
	const partnerCal = itemsRepo.myCalendarIds(partner.id)[0]!;
	itemsRepo.insertFromIcs(partnerCal, partner.id, {
		uid: 'c13-shared',
		title: 'Partner row',
		type: null,
		date: '2026-03-02',
		time: '09:00',
		endDate: null,
		rrule: null,
		exdates: [],
	});
	const p = parse(
		wrap(
			ev('UID:c13-shared', 'SUMMARY:Blind C13 mine', start('2026-03-02', '09:00')),
			ev('UID:c13-second', 'SUMMARY:Blind C13 second', start('2026-03-03', '09:00')),
		),
	);
	expect(previewFor(me.id, p).willUpdate).toBe(0);

	// the partner's custom type key is not mine: mustHave refuses it
	const partnerType = itemTypesRepo.create(partner.id, {
		name: 'Partner type',
		bg: '#123456',
		countsDown: false,
		shareDefault: false,
	}).key;
	expect(status(() => importIcs(me, p, partnerType)).code).toBe('bad_type');
	expect(count('SELECT count(*) AS n FROM items')).toBe(1); // just the partner row

	const done = importIcs(me, p, null);
	expect(done.imported).toBe(2);
	expect(rowOf('c13-shared')).toMatchObject({ calendar_id: myCal, title: 'Blind C13 mine' });
	expect(rowOf('c13-second')?.calendar_id).toBe(myCal);
	const their = h.sqlite
		.prepare('SELECT calendar_id, title FROM items WHERE calendar_id = ?')
		.all(partnerCal) as { calendar_id: string; title: string }[];
	expect(their).toEqual([{ calendar_id: partnerCal, title: 'Partner row' }]);
});
