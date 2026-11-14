// /api/native (Android widgets + alarms): owner-local day, Today's order rules, hidden types, reminder kinds.
import { beforeEach, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import * as keep from '../../src/lib/server/repo/keep';
import * as rem from '../../src/lib/server/reminders';
import { nativeSync } from '../../src/lib/server/native';

const NOW = Date.parse('2026-11-13T02:00:00Z'); // 10:00 KL, Fri 13 Nov
let user: App.SafeUser;
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	user = usersRepo.safe(usersRepo.createWithCalendar({ username: 'jeremy', displayName: 'J', passwordHash: 'x', role: 'admin' })); // prettier-ignore
});

it('rows = today in the owner timezone, sorted, hidden types dropped; notes; upcoming reminders', () => {
	// 07:00 KL = 23:00 UTC the day before: must land on the KL day, first
	blocks.create(user.id, blocks.blockCreateSchema.parse({ label: 'Gym', startAt: '2026-11-12T23:00:00Z', endAt: '2026-11-13T00:00:00Z' })); // prettier-ignore
	const quiz = items.create(user.id, items.itemCreateSchema.parse({ title: 'Quiz', date: '2026-11-13', time: '14:30', type: 'Exam' })); // prettier-ignore
	items.create(
		user.id,
		items.itemCreateSchema.parse({ title: 'Tomorrow', date: '2026-11-14', time: '09:00' }),
	);
	items.create(user.id, items.itemCreateSchema.parse({ title: 'Secret', date: '2026-11-13', time: '12:00', type: 'Hobby' })); // prettier-ignore
	keep.create(user.id, { type: 'checklist', title: 'Shop', items: [{ text: 'milk', checked: true }, { text: 'eggs' }] } as never); // prettier-ignore
	const r = rem.add(user.id, 'planner_item', quiz.id, { offset: '2h' }, NOW);

	const s = nativeSync({ ...user, hiddenTypes: ['Hobby'] }, NOW);
	expect(s.day).toBe('2026-11-13');
	expect(s.rows.map((x) => [x.time, x.title])).toEqual([
		['07:00', 'Gym'],
		['14:30', 'Quiz'],
	]);
	expect(s.rows[1]?.color).toMatch(/^#/);
	expect(s.notes[0]).toMatchObject({ title: 'Shop', text: '✓ milk\n• eggs' });
	expect(s.reminders).toEqual([
		{ id: r.id, title: 'Quiz', route: `/item/${quiz.id}`, dueAt: '2026-11-13T04:30:00Z' },
	]);

	usersRepo.setPrefs(user.id, { notifyPlanner: false } as never);
	expect(nativeSync(user, NOW).reminders).toEqual([]); // kind turned off = no alarm
});
