// v3.3 PR 11: calendar file import — parser fixtures (uni timetable, Google, Outlook/TZID, folded lines,
// unsupported rules) and the import itself (upsert by UID, one undo, owner scoping).
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as types from '../../src/lib/server/repo/itemtypes';
import { undo } from '../../src/lib/server/undo';
import {
	ICS_MAX_BYTES,
	ICS_MAX_EVENTS,
	importIcs,
	parseIcs,
	previewIcs,
} from '../../src/lib/server/ics-import';

const TZ = 'Asia/Kuala_Lumpur';
const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
const vevent = (lines: string) => `BEGIN:VEVENT\r\n${lines}END:VEVENT\r\n`;

let me: string;
let user: App.SafeUser;
beforeEach(() => {
	freshDb();
	const row = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	});
	me = row.id;
	user = usersRepo.safe(row);
});

describe('ics parser', () => {
	it('uni timetable: all-day + TZID times land on the user’s local day', () => {
		const text = wrap(
			vevent(
				'UID:uni-1@example\r\nSUMMARY:Algorithms lecture\r\nDTSTART;TZID=Europe/London:20261201T090000\r\nDTEND;TZID=Europe/London:20261201T110000\r\n',
			) + vevent('UID:uni-2@example\r\nSUMMARY:Reading day\r\nDTSTART;VALUE=DATE:20261203\r\n'),
		);
		const { events, skipped } = parseIcs(text, TZ);
		expect(skipped).toEqual([]);
		expect(events).toHaveLength(2);
		// London is UTC in December: 09:00Z -> 17:00 KL
		expect(events[0]).toMatchObject({ title: 'Algorithms lecture', date: '2026-12-01', time: '17:00' });
		expect(events[1]).toMatchObject({ title: 'Reading day', date: '2026-12-03', time: null });
	});

	it('Google export: UTC times, weekly RRULE with WKST, EXDATE; folded SUMMARY joins', () => {
		const text = wrap(
			vevent(
				'UID:g1@google.com\r\nSUMMARY:Morning stand-up with the whole\r\n  team\r\nDTSTART:20261201T013000Z\r\nDTEND:20261201T020000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;WKST=SU\r\nEXDATE:20261225T013000Z\r\n',
			),
		);
		const { events, skipped } = parseIcs(text, TZ);
		expect(skipped).toEqual([]);
		expect(events[0]).toMatchObject({
			title: 'Morning stand-up with the whole team',
			date: '2026-12-01',
			time: '09:30',
			rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
			exdates: ['2026-12-25'],
		});
	});

	it('Outlook export: TZID Europe/Berlin, escaped commas, all-day DTEND is exclusive', () => {
		const text = wrap(
			vevent(
				'UID:o1@outlook\r\nSUMMARY:Team sync\\, Q4 planning\r\nDTSTART;TZID=Europe/Berlin:20261201T090000\r\nDTEND;TZID=Europe/Berlin:20261201T100000\r\n',
			) +
				vevent(
					'UID:o2@outlook\r\nSUMMARY:Trip\r\nDTSTART;VALUE=DATE:20261210\r\nDTEND;VALUE=DATE:20261213\r\n',
				),
		);
		const { events, skipped } = parseIcs(text, TZ);
		expect(skipped).toEqual([]);
		expect(events[0]).toMatchObject({ title: 'Team sync, Q4 planning', time: '16:00' });
		expect(events[1]).toMatchObject({ date: '2026-12-10', time: null, endDate: '2026-12-12' });
	});

	it('skips and lists what it cannot map (never guesses)', () => {
		const text = wrap(
			vevent(
				'UID:bad-setpos\r\nSUMMARY:Last weekday\r\nDTSTART:20261201T090000Z\r\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1\r\n',
			) +
				vevent(
					'UID:bad-tz\r\nSUMMARY:Windows zone\r\nDTSTART;TZID=W. Europe Standard Time:20261201T090000\r\n',
				) +
				vevent('UID:cancel\r\nSUMMARY:Cancelled thing\r\nDTSTART:20261201T090000Z\r\nSTATUS:CANCELLED\r\n') +
				vevent(
					'UID:modified\r\nSUMMARY:Moved occurrence\r\nRECURRENCE-ID:20261208T090000Z\r\nDTSTART:20261209T090000Z\r\n',
				) +
				vevent('SUMMARY:No uid\r\nDTSTART:20261201T090000Z\r\n') +
				vevent('UID:bad-date\r\nSUMMARY:Bad date\r\nDTSTART:20261301T090000Z\r\n'),
		);
		const { events, skipped } = parseIcs(text, TZ);
		expect(events).toEqual([]);
		const reasons = skipped.map((s) => s.reason).join(' | ');
		expect(reasons).toContain('position in the set (BYSETPOS)');
		expect(reasons).toContain('unknown timezone (W. Europe Standard Time)');
		expect(reasons).toContain('cancelled');
		expect(reasons).toContain('modified occurrence');
		expect(reasons).toContain('no UID');
		expect(reasons).toContain('invalid date');
	});

	it('limits: > 2000 events are skipped and listed', () => {
		const many = Array.from({ length: ICS_MAX_EVENTS + 1 }, (_, i) =>
			vevent(`UID:e${i}\r\nSUMMARY:Event ${i}\r\nDTSTART:20261201T090000Z\r\n`),
		).join('');
		const { events, skipped } = parseIcs(wrap(many), TZ);
		expect(events).toHaveLength(ICS_MAX_EVENTS);
		expect(skipped[0]?.reason).toContain(`more than ${ICS_MAX_EVENTS} events`);
	});

	it('refuses a file over 1 MB with a plain message', () => {
		expect(() => parseIcs('X'.repeat(ICS_MAX_BYTES + 1), TZ)).toThrow(/1 MB/);
	});
});

describe('ics import', () => {
	const file = wrap(
		vevent('UID:a1\r\nSUMMARY:Alpha\r\nDTSTART:20261201T010000Z\r\n') +
			vevent('UID:a2\r\nSUMMARY:Beta\r\nDTSTART:20261202T020000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\n'),
	);

	it('preview counts, then import inserts with UIDs; a re-import updates instead of copying', () => {
		const p = previewIcs(user, file);
		expect(p).toMatchObject({ events: 2, repeating: 1, updates: 0 });
		const first = importIcs(user, file, null);
		expect(first).toMatchObject({ imported: 2, updated: 0 });
		const rows = (['a1', 'a2'] as const).map((uid) => items.byIcsUids(me, [uid]).get(uid));
		expect(rows.map((r) => r?.title)).toEqual(['Alpha', 'Beta']);
		expect(rows[1]?.rrule).toBe('FREQ=DAILY;COUNT=3');
		// re-import with a renamed event and an updated time
		const changed = file.replace('SUMMARY:Alpha', 'SUMMARY:Alpha (moved)').replace('T010000Z', 'T030000Z');
		expect(previewIcs(user, changed).updates).toBe(2);
		const again = importIcs(user, changed, null);
		expect(again).toMatchObject({ imported: 0, updated: 2 });
		expect(items.byIcsUids(me, ['a1', 'a2']).size).toBe(2);
		const a1 = items.byIcsUids(me, ['a1']).get('a1');
		expect(a1?.title).toBe('Alpha (moved)');
		expect(a1?.time).toBe('11:00'); // 03:00Z -> 11:00 KL
	});

	it('one undo entry removes every inserted row', () => {
		const r = importIcs(user, file, null);
		expect(items.byIcsUids(me, ['a1', 'a2']).size).toBe(2);
		undo(me, r.undo.id);
		expect(items.byIcsUids(me, ['a1', 'a2']).size).toBe(0);
	});

	it('puts the events in the chosen type', () => {
		const t = types.create(me, types.createSchema.parse({ name: 'Timetable', bg: '#3D5A80' }));
		importIcs(user, file, t.key);
		const a2 = items.byIcsUids(me, ['a2']).get('a2');
		expect(a2?.type).toBe(t.key);
		expect(() => importIcs(user, file, 'ity_someoneelse')).toThrow(/unknown type/);
	});

	it('owner scoping: the same UIDs import into each user’s own calendar', () => {
		const other = usersRepo.createWithCalendar({
			username: 'partner',
			displayName: 'P',
			passwordHash: 'x',
			role: 'member',
		});
		importIcs(user, file, null);
		importIcs(usersRepo.safe(other), file, null);
		expect(items.byIcsUids(me, ['a1', 'a2']).size).toBe(2);
		expect(items.byIcsUids(other.id, ['a1', 'a2']).size).toBe(2);
	});
});
