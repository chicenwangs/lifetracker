// Card 11 (D-V4-12, D-V4-29, D-V4-37): the ICS file import parser, preview and apply.
// Fixtures: a uni timetable, a Google export, an Outlook export with an IANA TZID and one with a Windows
// TZID, folded lines, escaping, all-day, multi-day, EXDATE, a UTC UNTIL, duplicate/no UID, title limits,
// a file over 1 000 000 bytes, BYSETPOS/HOURLY/BYWEEKNO, re-import, trashed rows and one undo entry.
import { beforeEach, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { handle } from '../../src/lib/server/db';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as itemsRepo from '../../src/lib/server/repo/items';
import * as itemTypesRepo from '../../src/lib/server/repo/itemtypes';
import { parseIcs, previewFor, importIcs, MAX_BYTES, MAX_EVENTS } from '../../src/lib/server/ics-import';
import { undo } from '../../src/lib/server/undo';
import { actions, load } from '../../src/routes/settings/import/+page.server';

const TZ = 'Asia/Kuala_Lumpur';

let user: App.SafeUser;
const mkUser = (username = 'jeremy') =>
	usersRepo.safe(
		usersRepo.createWithCalendar({ username, displayName: username, passwordHash: 'x', role: 'admin' }),
	);

const ics = (body: string[]) =>
	['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR'].join('\r\n') + '\r\n';
const event = (lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const rows = () =>
	handle().sqlite.prepare('SELECT * FROM items ORDER BY title').all() as Record<string, unknown>[];

beforeEach(() => {
	freshDb();
	user = mkUser();
});

it('C3 parses a university timetable and ignores VTIMEZONE/VALARM/unknown properties', () => {
	const file = ics([
		'BEGIN:VTIMEZONE',
		'TZID:Asia/Kuala_Lumpur',
		'BEGIN:STANDARD',
		'DTSTART:19700101T000000',
		'END:STANDARD',
		'END:VTIMEZONE',
		...event([
			'UID:uni-1@example.edu',
			'SUMMARY:Data Structures',
			'DTSTART;TZID=Asia/Kuala_Lumpur:20260112T090000',
			'DTEND;TZID=Asia/Kuala_Lumpur:20260112T110000',
			'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260330',
			'LOCATION:Room 1',
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			'TRIGGER:-PT15M',
			'END:VALARM',
		]),
		...event(['UID:uni-2@example.edu', 'SUMMARY:Lab rota', 'DTSTART:20260113T140000']),
	]);
	const p = parseIcs(file, TZ);
	expect(p.total).toBe(2);
	expect(p.events).toHaveLength(2);
	expect(p.repeating).toBe(1);
	expect(p.skipped).toEqual([]);
	expect(p.events[0]).toMatchObject({
		uid: 'uni-1@example.edu',
		title: 'Data Structures',
		date: '2026-01-12',
		time: '09:00',
		rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=2026-03-30',
		exdates: [],
	});
	expect(p.events[1]).toMatchObject({ title: 'Lab rota', date: '2026-01-13', time: '14:00', rrule: null });
});

it('C3/C4/C6 parses a Google export: UTC values, UTC UNTIL, EXDATE lists on several lines', () => {
	const file = ics([
		...event([
			'UID:google-1@google.com',
			'SUMMARY:Standup',
			'DTSTART:20260105T010000Z', // 09:00 in Kuala Lumpur
			'DTEND:20260105T013000Z',
			'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20260131T235900Z', // 2026-02-01 local
			'EXDATE:20260112T010000Z,20260113T010000Z',
			'EXDATE:20260119T010000Z',
			'EXDATE:not-a-date',
		]),
		...event([
			'UID:google-2@google.com',
			'SUMMARY:New Year lunch',
			'DTSTART;VALUE=DATE:20260101',
			'DTEND;VALUE=DATE:20260103',
		]),
	]);
	const p = parseIcs(file, TZ);
	expect(p.skipped).toEqual([]);
	const standup = p.events.find((e) => e.uid === 'google-1@google.com');
	expect(standup).toMatchObject({
		date: '2026-01-05',
		time: '09:00',
		rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=2026-02-01',
		exdates: ['2026-01-12', '2026-01-13', '2026-01-19'],
	});
	// all-day DTEND is exclusive: a 2-day lunch ends on the 2nd
	expect(p.events.find((e) => e.uid === 'google-2@google.com')).toMatchObject({
		date: '2026-01-01',
		time: null,
		endDate: '2026-01-02',
	});
	expect(p.repeating).toBe(1);
});

it('C4 converts UTC UNTIL to the user’s local date before parseRRule', () => {
	const file = ics([
		...event([
			'UID:until-1',
			'SUMMARY:Evening',
			'DTSTART:20261201T120000Z',
			'RRULE:FREQ=DAILY;UNTIL=20261231T200000Z', // 2027-01-01 04:00 in Kuala Lumpur
		]),
	]);
	const p = parseIcs(file, TZ);
	expect(p.events[0]?.rrule).toBe('FREQ=DAILY;UNTIL=2027-01-01');
});

it('C4 converts an Outlook IANA TZID to the user’s zone', () => {
	const file = ics([
		...event([
			'UID:outlook-1',
			'SUMMARY:London call',
			'DTSTART;TZID=Europe/London:20260601T090000',
			'DTEND;TZID=Europe/London:20260601T100000',
		]),
	]);
	const p = parseIcs(file, TZ);
	expect(p.events[0]).toMatchObject({ date: '2026-06-01', time: '16:00' }); // BST = UTC+1, KL = UTC+8
});

it('C4 skips an Outlook Windows TZID with its reason, never guessing a zone', () => {
	const file = ics([
		...event([
			'UID:outlook-win',
			'SUMMARY:Redmond sync',
			'DTSTART;TZID=Pacific Standard Time:20260601T090000',
		]),
		...event([
			'UID:outlook-win2',
			'SUMMARY:Berlin sync',
			'DTSTART;TZID=W. Europe Standard Time:20260601T090000',
		]),
	]);
	const p = parseIcs(file, TZ);
	expect(p.events).toHaveLength(0);
	expect(p.skipped).toEqual([
		{ title: 'Redmond sync', reason: 'unknown time zone — not supported' },
		{ title: 'Berlin sync', reason: 'unknown time zone — not supported' },
	]);
});

it('C3 unfolds CRLF + space/tab continuation lines and decodes TEXT escapes', () => {
	const file = ics([
		...event([
			'UID:fold-1',
			'SUMMARY:Long title that is folded',
			' across a space line',
			'\tand a tab line',
			'DESCRIPTION:ignored',
			'DTSTART:20260101T090000',
		]),
		...event([
			'UID:esc-1',
			'SUMMARY:Lunch\\, then\\; stuff\\nSecond line\\\\done',
			'DTSTART:20260101T100000',
		]),
	]);
	const p = parseIcs(file, TZ);
	expect(p.events[0]?.title).toBe('Long title that is foldedacross a space lineand a tab line');
	expect(p.events[1]?.title).toBe('Lunch, then; stuff\nSecond line\\done');
});

it('C4 maps all-day and multi-day DTEND values', () => {
	const file = ics([
		...event(['UID:allday-1', 'SUMMARY:One day', 'DTSTART;VALUE=DATE:20260210', 'DTEND;VALUE=DATE:20260211']),
		...event([
			'UID:allday-3',
			'SUMMARY:Three days',
			'DTSTART;VALUE=DATE:20260210',
			'DTEND;VALUE=DATE:20260213',
		]),
		...event(['UID:timed-later', 'SUMMARY:Overnight', 'DTSTART:20260210T220000', 'DTEND:20260211T010000']),
		...event(['UID:timed-same', 'SUMMARY:Same day', 'DTSTART:20260210T090000', 'DTEND:20260210T100000']),
	]);
	const p = parseIcs(file, TZ);
	expect(p.events.find((e) => e.uid === 'allday-1')?.endDate).toBeNull();
	expect(p.events.find((e) => e.uid === 'allday-3')?.endDate).toBe('2026-02-12');
	expect(p.events.find((e) => e.uid === 'timed-later')?.endDate).toBe('2026-02-11');
	expect(p.events.find((e) => e.uid === 'timed-same')?.endDate).toBeNull();
});

it('C3 first UID wins, a later duplicate and a VEVENT without a UID are skipped with reasons', () => {
	const file = ics([
		...event(['UID:dup-1', 'SUMMARY:First', 'DTSTART:20260301T090000']),
		...event(['UID:dup-1', 'SUMMARY:Second', 'DTSTART:20260302T090000']),
		...event(['SUMMARY:Clash', 'DTSTART:20260303T090000']),
	]);
	const p = parseIcs(file, TZ);
	expect(p.events.map((e) => e.title)).toEqual(['First']);
	expect(p.skipped).toEqual([
		{ title: 'Second', reason: 'duplicate UID' },
		{ title: 'Clash', reason: 'no ID' },
	]);
});

it('C3 empty and long titles: Untitled, 300 kept, over 300 cut and counted', () => {
	const long = 'x'.repeat(301);
	const file = ics([
		...event(['UID:t-empty', 'SUMMARY:', 'DTSTART:20260301']),
		...event(['UID:t-long', `SUMMARY:${long}`, 'DTSTART:20260301']),
	]);
	const p = parseIcs(file, TZ);
	expect(p.events[0]?.title).toBe('Untitled');
	expect(p.events[1]?.title).toHaveLength(300);
	expect(p.shortened).toBe(1);
});

it('C5 skips BYSETPOS, HOURLY and BYWEEKNO rules with plain-words reasons', () => {
	const file = ics([
		...event([
			'UID:r-setpos',
			'SUMMARY:Lab rota',
			'DTSTART:20260101T090000',
			'RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1',
		]),
		...event(['UID:r-hourly', 'SUMMARY:Hourly', 'DTSTART:20260101T090000', 'RRULE:FREQ=HOURLY']),
		...event([
			'UID:r-weekno',
			'SUMMARY:Week number',
			'DTSTART:20260101T090000',
			'RRULE:FREQ=YEARLY;BYWEEKNO=20',
		]),
	]);
	const p = parseIcs(file, TZ);
	expect(p.events).toHaveLength(0);
	expect(p.skipped.map((s) => s.reason)).toEqual([
		'repeats by set position, not supported',
		'repeats hourly, not supported',
		'repeats by week number, not supported',
	]);
});

it('C5 also refuses out-of-range INTERVAL and COUNT instead of importing a partial rule', () => {
	const file = ics([
		...event(['UID:r-int', 'SUMMARY:A', 'DTSTART:20260101T090000', 'RRULE:FREQ=DAILY;INTERVAL=100']),
		...event(['UID:r-count', 'SUMMARY:B', 'DTSTART:20260101T090000', 'RRULE:FREQ=DAILY;COUNT=1000']),
		...event(['UID:r-wkst', 'SUMMARY:C', 'DTSTART:20260101T090000', 'RRULE:FREQ=WEEKLY;WKST=SU']),
	]);
	const p = parseIcs(file, TZ);
	expect(p.skipped.map((s) => s.reason)).toEqual([
		'repeat interval out of range',
		'repeat count out of range',
		'uses a week start, not supported',
	]);
});

it('C1 the preview action refuses a file over 1 000 000 bytes with the inline message', async () => {
	const big = new File([new Uint8Array(MAX_BYTES + 1)], 'big.ics', { type: 'text/calendar' });
	const fd = new FormData();
	fd.set('file', big);
	const request = new Request('http://localhost/settings/import?/preview', { method: 'POST', body: fd });
	const call = actions.preview as unknown as (e: unknown) => Promise<unknown>;
	const r = (await call({ locals: { user }, request })) as { status: number; data: { icsError: string } };
	expect(r.status).toBe(400);
	expect(r.data.icsError).toBe('The file is over 1 MB.');
});

it('C8 refuses more than 2 000 VEVENTs with the count, before writing anything', async () => {
	const many: string[] = [];
	for (let i = 0; i < MAX_EVENTS + 1; i++)
		many.push(...event([`UID:many-${i}`, `SUMMARY:Event ${i}`, 'DTSTART:20260101T090000']));
	const fd = new FormData();
	fd.set('file', new File([ics(many)], 'many.ics', { type: 'text/calendar' }));
	const request = new Request('http://localhost/settings/import?/import', { method: 'POST', body: fd });
	const call = actions.import as unknown as (e: unknown) => Promise<unknown>;
	const r = (await call({ locals: { user }, request })) as { status: number; data: { icsError: string } };
	expect(r.status).toBe(400);
	expect(r.data.icsError).toContain(String(MAX_EVENTS + 1));
	expect(rows()).toHaveLength(0);
});

it('C2/C7 import writes ordinary rows in my default calendar, chosen type, no source or reminder', () => {
	const type = itemTypesRepo.list(user.id).find((t) => t.key === 'Work');
	expect(type).toBeTruthy();
	const file = ics([
		...event([
			'UID:apply-1',
			'SUMMARY:Applied',
			'DTSTART:20260401T090000',
			'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3',
			'EXDATE:20260408T090000',
		]),
	]);
	const p = parseIcs(file, TZ);
	const out = importIcs(user, p, type!.key);
	expect(out).toMatchObject({ events: 1, imported: 1, updated: 0 });
	const all = rows();
	expect(all).toHaveLength(1);
	expect(all[0]).toMatchObject({
		title: 'Applied',
		type: type!.key,
		status: 'todo',
		date: '2026-04-01',
		time: '09:00',
		rrule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=3',
		exdates: JSON.stringify(['2026-04-08']),
		ics_uid: 'apply-1',
		source: null,
		private: 0,
		repeat_from_completion: 0,
	});
});

it('C9 re-import updates title/time/rule/exdates by UID, keeps the date, never inserts a second row', () => {
	const first = ics([
		...event([
			'UID:re-1',
			'SUMMARY:Old',
			'DTSTART:20260401T090000',
			'RRULE:FREQ=DAILY;COUNT=5',
			'EXDATE:20260402T090000',
		]),
	]);
	importIcs(user, parseIcs(first, TZ), null);

	const second = ics([
		...event([
			'UID:re-1',
			'SUMMARY:New',
			'DTSTART:20260501T100000', // a different date must NOT move the row
			'RRULE:FREQ=DAILY;COUNT=7',
			'EXDATE:20260502T100000',
		]),
		...event(['UID:re-2', 'SUMMARY:Added', 'DTSTART:20260503T110000']),
	]);
	const p2 = parseIcs(second, TZ);
	expect(previewFor(user.id, p2)).toMatchObject({ events: 2, willUpdate: 1 });
	const out = importIcs(user, p2, null);
	expect(out).toMatchObject({ events: 2, imported: 1, updated: 1 });
	const all = rows();
	expect(all).toHaveLength(2);
	const re1 = all.find((r) => r.ics_uid === 're-1')!;
	expect(re1).toMatchObject({
		title: 'New',
		time: '10:00',
		date: '2026-04-01', // unchanged
		rrule: 'FREQ=DAILY;COUNT=7',
		exdates: JSON.stringify(['2026-05-02']),
	});
});

it('C9 a UID absent from the new file is left untouched, and a trashed row never matches', () => {
	const first = ics([
		...event(['UID:keep-1', 'SUMMARY:Keep me', 'DTSTART:20260401T090000']),
		...event(['UID:trash-1', 'SUMMARY:Trashed', 'DTSTART:20260402T090000']),
	]);
	importIcs(user, parseIcs(first, TZ), null);
	const trashed = rows().find((r) => r.ics_uid === 'trash-1')!;
	itemsRepo.softDelete(user.id, String(trashed.id));

	const second = ics([
		...event(['UID:trash-1', 'SUMMARY:Trashed again', 'DTSTART:20260402T090000']),
		...event(['UID:new-1', 'SUMMARY:New one', 'DTSTART:20260403T090000']),
	]);
	const out = importIcs(user, parseIcs(second, TZ), null);
	expect(out).toMatchObject({ imported: 2, updated: 0 });
	const ids = rows().map((r) => r.ics_uid);
	expect(ids).toContain('keep-1'); // untouched
	expect(ids.filter((u) => u === 'trash-1')).toHaveLength(2); // the trashed row stays, a live one is added
});

it('C10 the whole import is one undo entry: inserts removed, updated rows restored', () => {
	const first = ics([...event(['UID:u-1', 'SUMMARY:Before', 'DTSTART:20260401T090000'])]);
	importIcs(user, parseIcs(first, TZ), null);
	undo(user.id); // leave a clean journal state

	importIcs(user, parseIcs(first, TZ), null); // the same UID -> an update
	const second = ics([
		...event(['UID:u-1', 'SUMMARY:After', 'DTSTART:20260401T100000']),
		...event(['UID:u-2', 'SUMMARY:Fresh', 'DTSTART:20260402T090000']),
	]);
	importIcs(user, parseIcs(second, TZ), null);
	expect(rows()).toHaveLength(2);

	expect(undo(user.id).label).toBe('Import 2 events');
	const after = rows();
	expect(after).toHaveLength(1);
	expect(after[0]).toMatchObject({ ics_uid: 'u-1', title: 'Before', time: '09:00' });
});

it('C2 the Import page default type is the first with Month calendar off, else None', async () => {
	const types = itemTypesRepo.list(user.id);
	const third = types[2]!;
	itemTypesRepo.patch(user.id, third.id, { onCalendar: false });
	const page = (await load({ locals: { user } } as never)) as { defaultType: string };
	expect(page.defaultType).toBe(third.key);
	itemTypesRepo.patch(user.id, third.id, { onCalendar: true });
	expect(((await load({ locals: { user } } as never)) as { defaultType: string }).defaultType).toBe('');
});

it('C1/C7 the import action re-checks the size, and a small file writes one row', async () => {
	const big = new FormData();
	big.set('file', new File([new Uint8Array(MAX_BYTES + 1)], 'big.ics', { type: 'text/calendar' }));
	const bigReq = new Request('http://localhost/settings/import?/import', { method: 'POST', body: big });
	const callImport = actions.import as unknown as (e: unknown) => Promise<unknown>;
	const refused = (await callImport({ locals: { user }, request: bigReq })) as {
		status: number;
		data: { icsError: string };
	};
	expect(refused.status).toBe(400);
	expect(refused.data.icsError).toBe('The file is over 1 MB.');
	expect(rows()).toHaveLength(0);

	const ok = ics([...event(['UID:size-1', 'SUMMARY:Fine', 'DTSTART:20260101'])]);
	const fd = new FormData();
	fd.set('file', new File([ok], 'fine.ics', { type: 'text/calendar' }));
	fd.set('type', '');
	const request = new Request('http://localhost/settings/import?/import', { method: 'POST', body: fd });
	const r = (await callImport({ locals: { user }, request })) as { icsDone: { imported: number } };
	expect(r.icsDone.imported).toBe(1);
});
