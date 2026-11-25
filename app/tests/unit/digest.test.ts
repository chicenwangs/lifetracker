// v3.3 PR 12: daily digest — counts + first time, one per local day, tz/midnight, native payload.
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import * as meta from '../../src/lib/server/repo/meta';
import { digestText, digestsDue, nativeDigest, nextDigestAt } from '../../src/lib/server/digest';
import { nativeSync } from '../../src/lib/server/native';
import { addDays, todayLocal } from '../../src/lib/time';

const KL = 'Asia/Kuala_Lumpur';
const AT_0900 = Date.parse('2026-11-25T01:00:00Z'); // 09:00 in KL
let me: string;
let safe: App.SafeUser;
const reload = () => {
	safe = usersRepo.safe(usersRepo.byId(me)!);
	return safe;
};
const day = (n = 0) => addDays(todayLocal(KL, AT_0900), n);
const addItem = (date: string, time: string | null, title = 'Item') =>
	items.create(me, items.itemCreateSchema.parse({ title, date, time }));

beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	me = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	}).id;
	usersRepo.setPrefs(me, { digestTime: '07:30' });
	reload();
});

describe('digestText', () => {
	it('counts own items and blocks, first timed, no titles', () => {
		addItem(day(), '09:00', 'Secret dentist');
		addItem(day(), null, 'All day thing');
		blocks.create(
			me,
			blocks.blockCreateSchema.parse({
				label: 'Deep work',
				startAt: '2026-11-25T02:00:00Z', // 10:00 KL
				endAt: '2026-11-25T03:00:00Z',
			}),
		);
		const t = digestText(reload(), day());
		expect(t).toBe('2 items · 1 block · first 09:00');
		expect(t).not.toContain('dentist');
	});
	it('drops done items, hidden types, other days and partner items', () => {
		const done = addItem(day(), '08:00', 'Done');
		items.patch(me, done.id, { status: 'done' });
		addItem(day(-1), '07:00', 'Slipped');
		usersRepo.setPrefs(me, { hiddenTypes: ['Work'] });
		const hidden = addItem(day(), '12:00', 'Hidden work');
		items.patch(me, hidden.id, { type: 'Work' });
		addItem(day(), '11:00', 'Visible');
		const partner = usersRepo.createWithCalendar({
			username: 'partner',
			displayName: 'P',
			passwordHash: 'x',
			role: 'member',
		});
		items.create(partner.id, items.itemCreateSchema.parse({ title: 'Theirs', date: day(), time: '09:00' }));
		expect(digestText(reload(), day())).toBe('1 item · first 11:00');
		expect(digestText(reload(), day())).not.toContain('Theirs');
	});
	it('nothing on → null', () => {
		expect(digestText(reload(), day())).toBe(null);
	});
});

describe('digestsDue', () => {
	it('before the local time: nothing; at/after: one; second call: none', () => {
		addItem(day(), '09:00');
		const before = Date.parse('2026-11-24T22:00:00Z'); // 06:00 KL
		expect(digestsDue(before)).toHaveLength(0);
		const first = digestsDue(AT_0900);
		expect(first).toHaveLength(1);
		expect(first[0]!.userId).toBe(me);
		expect(first[0]!.text).toContain('1 item');
		expect(meta.get(`digest:${me}:2026-11-25`)).toBe('1');
		expect(digestsDue(AT_0900)).toHaveLength(0);
	});
	it('planner reminders off → no send and no send mark', () => {
		addItem(day(), '09:00');
		usersRepo.setPrefs(me, { notifyPlanner: false });
		expect(digestsDue(AT_0900)).toHaveLength(0);
		expect(meta.get(`digest:${me}:2026-11-25`)).toBeUndefined();
	});
	it('nothing on: no send, but the day is marked so it does not re-check', () => {
		expect(digestsDue(AT_0900)).toHaveLength(0);
		expect(meta.get(`digest:${me}:2026-11-25`)).toBe('0');
	});
});

describe('native digest', () => {
	it('native payload carries { at, text }', () => {
		usersRepo.setPrefs(me, { digestTime: '23:59' });
		addItem(day(), '09:00');
		reload();
		const j = nativeSync(safe, AT_0900) as { digest?: { at: string; text: string } | null };
		expect(j.digest?.at).toBe('2026-11-25T15:59:00Z');
		expect(j.digest?.text).toContain('1 item');
	});
	it('next alarm today when the time is still ahead, text for today', () => {
		usersRepo.setPrefs(me, { digestTime: '23:59' });
		addItem(day(), '09:00');
		reload();
		const d = nativeDigest(safe, AT_0900);
		expect(d?.at).toBe('2026-11-25T15:59:00Z'); // 23:59 KL
		expect(d?.text).toContain('1 item');
	});
	it('after the time: tomorrow 07:30, text for tomorrow (null when tomorrow is empty)', () => {
		addItem(day(), '09:00');
		reload();
		expect(nativeDigest(safe, AT_0900)).toBe(null); // tomorrow has nothing
		addItem(day(1), '10:00', 'Tomorrow');
		reload();
		expect(nextDigestAt(safe, AT_0900)).toEqual({ at: '2026-11-25T23:30:00Z', date: day(1) });
		expect(nativeDigest(safe, AT_0900)?.text).toContain('1 item');
	});
	it('off or planner reminders off → null', () => {
		usersRepo.setPrefs(me, { digestTime: null });
		reload();
		expect(nativeDigest(safe, AT_0900)).toBe(null);
		usersRepo.setPrefs(me, { digestTime: '07:30', notifyPlanner: false });
		addItem(day(), '09:00');
		reload();
		expect(nativeDigest(safe, AT_0900)).toBe(null);
	});
});
