// FEATURES §9 NOTIF tests (server side) + runner rules (DESIGN §13, D-13..D-16).
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as keep from '../../src/lib/server/repo/keep';
import * as rem from '../../src/lib/server/reminders';
import { tick } from '../../src/lib/server/jobs';
import { quickAdd } from '../../src/lib/server/quickadd-server';

let me: string;
let user: App.SafeUser;
const NOW = Date.parse('2026-11-13T02:00:00Z'); // 10:00 KL
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	const r = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'J',
		passwordHash: 'x',
		role: 'admin',
	});
	me = r.id;
	user = usersRepo.safe(r);
});
const item = (date: string, time: string | null = '10:00') =>
	items.create(me, items.itemCreateSchema.parse({ title: 'Quiz', date, time }));
const add = (id: string, offset: string) => rem.add(me, 'planner_item', id, { offset }, NOW);

describe('reminders', () => {
	it('NOTIF-001: each offset lands before the item time (20 Nov 10:00 KL)', () => {
		const i = item('2026-11-20');
		const due = (o: string) => add(i.id, o).dueAt;
		expect(due('2h')).toBe('2026-11-20T00:00:00Z'); // 08:00 KL
		expect(due('1d')).toBe('2026-11-19T02:00:00Z');
		expect(due('2d')).toBe('2026-11-18T02:00:00Z');
		expect(due('3d')).toBe('2026-11-17T02:00:00Z');
		expect(() => due('1w')).toThrow(/already passed/); // 1 week before = exactly now
		expect(add(item('2026-11-27').id, '1w').dueAt).toBe('2026-11-20T02:00:00Z');
		expect(add(item('2026-11-27').id, '15min').dueAt).toBe('2026-11-27T01:45:00Z');
	});

	it('bad offset, past time, no date, duplicate: clear errors', () => {
		const i = item('2026-11-20');
		expect(() => add(i.id, '5h')).toThrow(/isn't a reminder time/);
		expect(() => add(item('2026-11-13', '11:00').id, '2h')).toThrow(/already passed/);
		const undated = items.create(me, items.itemCreateSchema.parse({ title: 'x' }));
		expect(() => add(undated.id, '1d')).toThrow(/no date/);
		add(i.id, '1d');
		expect(() => add(i.id, '1d')).toThrow(/already a reminder/);
	});

	it('D-13: all-day item counts from 09:00 on its date', () => {
		expect(add(item('2026-11-20', null).id, '1d').dueAt).toBe('2026-11-19T01:00:00Z'); // 09:00 KL day before
	});

	it('NOTIF-002/003/004: two coexist; reschedule moves both; remove one only', () => {
		const i = item('2026-11-20');
		const a = add(i.id, '1d');
		add(i.id, '2h');
		items.patch(me, i.id, { date: '2026-11-21' });
		rem.recalcOwner(me, NOW);
		expect(rem.list(me, 'planner_item', i.id).map((r) => r.dueAt)).toEqual([
			'2026-11-20T02:00:00Z',
			'2026-11-21T00:00:00Z',
		]);
		rem.remove(me, a.id);
		expect(rem.list(me, 'planner_item', i.id)).toHaveLength(1);
	});

	it('delete -> cancelled; restore -> back on (D-16: Keep trash stops, archive keeps)', () => {
		const i = item('2026-11-20');
		add(i.id, '1d');
		const { batch } = items.softDelete(me, i.id);
		rem.recalcOwner(me, NOW);
		expect(rem.list(me, 'planner_item', i.id)).toEqual([]);
		items.restore(me, batch);
		rem.recalcOwner(me, NOW);
		expect(rem.list(me, 'planner_item', i.id).map((r) => r.status)).toEqual(['scheduled']);
		const n = keep.create(me, { body: 'call bank' });
		rem.add(me, 'keep_note', n.id, { at: '2026-11-14T01:00:00Z' }, NOW);
		keep.update(me, n.id, { archived: true });
		rem.recalcOwner(me, NOW);
		expect(rem.list(me, 'keep_note', n.id).map((r) => r.status)).toEqual(['scheduled']);
		keep.update(me, n.id, { trashed: true });
		rem.recalcOwner(me, NOW);
		expect(rem.list(me, 'keep_note', n.id)).toEqual([]);
	});

	it('runner: sends when due (in-app without push keys), follows a moved item, marks late ones missed, respects kind toggles', async () => {
		const i = item('2026-11-20');
		const r = add(i.id, '2h');
		await tick(Date.parse('2026-11-19T00:00:00Z')); // not due yet
		expect(rem.list(me, 'planner_item', i.id)[0]?.status).toBe('scheduled');
		await tick(Date.parse('2026-11-20T00:00:30Z'));
		expect(rem.list(me, 'planner_item', i.id)[0]?.status).toBe('sent');
		expect(rem.inbox(me).map((x) => x.title)).toEqual(['Quiz']);
		expect(rem.inbox(me)).toEqual([]); // shown once
		// moved later after it was claimed-due: the runner waits for the new time
		const j = item('2026-11-22');
		add(j.id, '2h');
		items.patch(me, j.id, { date: '2026-11-23' }); // no recalc on purpose
		await tick(Date.parse('2026-11-22T00:00:30Z'));
		expect(rem.list(me, 'planner_item', j.id)[0]).toMatchObject({
			status: 'scheduled',
			dueAt: '2026-11-23T00:00:00Z',
		});
		// late by > 1 h = missed, shown once marked late
		await tick(Date.parse('2026-11-23T03:00:00Z'));
		expect(rem.list(me, 'planner_item', j.id)[0]?.status).toBe('missed');
		expect(rem.inbox(me)[0]?.late).toBe(true);
		// planner reminders turned off -> not sent
		usersRepo.setPrefs(me, { notifyPlanner: false });
		const k = item('2026-11-25');
		add(k.id, '2h');
		await tick(Date.parse('2026-11-25T00:00:30Z'));
		expect(rem.list(me, 'planner_item', k.id)).toEqual([]); // cancelled = hidden from the list
		void r;
	});

	it('quick add /remind sets reminders; a passed one is a warning, the item still gets made', () => {
		const out = quickAdd(user, 'exam mon 2pm /calendar /remind 1d 2h', NOW);
		expect(rem.list(me, 'planner_item', out.item?.id ?? '')).toHaveLength(2);
		const late = quickAdd(user, 'coffee today 11am /calendar /remind 2h', NOW);
		expect(late.item).toBeTruthy();
		expect(late.warnings.join()).toMatch(/already passed/);
	});

	it("someone else's item: not found", () => {
		const i = item('2026-11-20');
		const other = usersRepo.createWithCalendar({
			username: 'n',
			displayName: 'n',
			passwordHash: 'x',
			role: 'member',
		}).id;
		expect(() => rem.add(other, 'planner_item', i.id, { offset: '1d' }, NOW)).toThrow(/Not found/);
		expect(rem.list(other, 'planner_item', i.id)).toEqual([]);
	});
});
