// PR 5: agenda() = shared range query for /api/native + ICS: own calendar, repeats expanded,
// hidden types dropped, private flag kept.
import { beforeEach, expect, it } from 'vitest';
import { freshDb } from './helpers';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import * as blocks from '../../src/lib/server/repo/blocks';
import { agenda } from '../../src/lib/server/agenda';

let user: App.SafeUser;
beforeEach(() => {
	freshDb({ JOBS_ENABLED: 'false' });
	user = usersRepo.safe(
		usersRepo.createWithCalendar({
			username: 'jeremy',
			displayName: 'J',
			passwordHash: 'x',
			role: 'admin',
		}),
	);
});

it('own range: repeats expanded, hidden types dropped, private flag kept', () => {
	const parse = items.itemCreateSchema.parse;
	items.create(user.id, parse({ title: 'Quiz', date: '2026-11-13', time: '14:30', type: 'Exam' }));
	items.create(user.id, parse({ title: 'Secret', date: '2026-11-13', time: '12:00', type: 'Hobby' }));
	items.create(user.id, parse({ title: 'Gym', date: '2026-11-13', time: '18:00', rrule: 'FREQ=DAILY' }));
	items.create(user.id, parse({ title: 'Private note', date: '2026-11-14', private: true, type: 'Exam' }));
	blocks.create(
		user.id,
		blocks.blockCreateSchema.parse({
			label: 'Hobby block',
			type: 'Hobby',
			startAt: '2026-11-13T10:00:00Z',
			endAt: '2026-11-13T11:00:00Z',
		}),
	);
	blocks.create(
		user.id,
		blocks.blockCreateSchema.parse({
			label: 'Study',
			startAt: '2026-11-13T12:00:00Z',
			endAt: '2026-11-13T13:00:00Z',
		}),
	);

	const a = agenda({ ...user, hiddenTypes: ['Hobby'] }, '2026-11-13', '2026-11-20');
	const rows = a.items.map((i) => [i.title, i.date, i.occurrenceDate ?? null]);
	expect(rows[0]).toEqual(['Quiz', '2026-11-13', null]);
	expect(rows[1]).toEqual(['Gym', '2026-11-13', '2026-11-13']);
	expect(rows[2]).toEqual(['Private note', '2026-11-14', null]);
	expect(rows.filter(([t]) => t === 'Gym')).toHaveLength(7); // daily series expanded, to is exclusive
	expect(rows.some(([t]) => t === 'Secret')).toBe(false); // hidden type dropped
	expect(a.items.find((i) => i.title === 'Private note')?.private).toBe(true);
	expect(a.blocks.map((b) => b.label)).toEqual(['Study']); // hidden type block dropped
});
