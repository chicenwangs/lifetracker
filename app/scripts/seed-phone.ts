// Phone-realistic dev data for the Mobile overhaul sprint (#106). Dev only, fresh DB only.
// Run: npm run db:seed:phone  -> data/phone-dev.db + data/TEST-LOGIN.txt (both gitignored).
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hash } from '@node-rs/argon2';
import { txImmediate } from '../src/lib/server/db';
import * as reminders from '../src/lib/server/reminders';
import * as blocksRepo from '../src/lib/server/repo/blocks';
import * as itemsRepo from '../src/lib/server/repo/items';
import * as keep from '../src/lib/server/repo/keep';
import * as meta from '../src/lib/server/repo/meta';
import * as pagesRepo from '../src/lib/server/repo/pages';
import * as usersRepo from '../src/lib/server/repo/users';
import { addDays, DEFAULT_TZ, localToUtc, todayLocal } from '../src/lib/time';

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

export async function seedPhone(username: string, dbPath: string): Promise<void> {
	if (usersRepo.count() > 0) throw new Error(`${dbPath} already has users. Delete the file to reseed.`);
	const password = randomBytes(12).toString('base64url');
	// same params as auth.ts (it can't load under tsx: Vite ?raw import), like scripts/reset-password.mjs
	const passwordHash = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
	const me = txImmediate(() => {
		const u = usersRepo.createWithCalendar({
			username,
			displayName: 'Phone Test',
			passwordHash,
			role: 'admin',
		});
		meta.set('setup_done', '1');
		meta.set('signup_open', '0');
		return u.id;
	});
	usersRepo.setPrefs(me, { tourState: 'skipped' }); // tour would cover every screenshot (phone tour = #84)

	const today = todayLocal(DEFAULT_TZ);
	const item = (title: string, day: number | null, o: Partial<itemsRepo.ItemCreate> = {}) =>
		itemsRepo.create(
			me,
			itemsRepo.itemCreateSchema.parse({ title, date: day === null ? null : addDays(today, day), ...o }),
		);
	const block = (label: string, day: number, from: string, to: string, type: string | null = null) =>
		blocksRepo.create(me, {
			label,
			type,
			itemId: null,
			startAt: localToUtc(addDays(today, day), from, DEFAULT_TZ),
			endAt: localToUtc(addDays(today, day), to, DEFAULT_TZ),
		});

	// today = the busy day: timed, all-day, done, doing, steps, blocks
	item('Stand-up', 0, { time: '09:00', type: 'Work', status: 'done' });
	item('Reply to landlord', 0, { status: 'done' });
	item('Sprint review slides', 0, { time: '11:00', type: 'Work', status: 'doing' });
	item('Lunch with Sam', 0, { time: '12:30', type: 'Event' });
	const quiz = item('DS quiz revision', 0, { time: '15:00', type: 'Exam', notes: 'Chapters 4-6.' });
	for (const s of ['Read chapter 4', 'Past paper 2025', 'Flash cards'])
		item(s, null, { parentId: quiz.id, status: s === 'Read chapter 4' ? 'done' : 'todo' });
	item('Gym', 0, { time: '18:30', type: 'Hobby' });
	item('Buy groceries', 0);
	item('Call mum', 0);
	item('Pay electricity bill', 0, { type: 'Exam' });
	item('Movie night', 0, { time: '21:00', type: 'Dating' });
	block('Deep work', 0, '09:30', '11:00', 'Work');
	block('Lunch', 0, '12:30', '13:30', 'Event');
	block('Revision', 0, '15:00', '17:00', 'Exam');
	block('Gym', 0, '18:30', '19:30', 'Hobby');

	// next 7 days: one timed + one all-day each, a multi-day trip, a deadline
	const timed = ['Dentist', 'Team sync', 'Badminton', 'Dinner with Alex', 'Code review', 'Haircut', 'Brunch'];
	const allDay = ['Laundry', 'Renew passport', 'Water plants', 'Clean desk', 'Backup laptop', 'Meal prep', 'Plan next week']; // prettier-ignore
	let remindOn = '';
	for (let d = 1; d <= 7; d++) {
		const t = item(timed[d - 1] as string, d, {
			time: d % 2 ? '14:00' : '10:30',
			type: d % 2 ? 'Event' : 'Work',
		});
		if (d === 1) remindOn = t.id;
		item(allDay[d - 1] as string, d, d === 2 ? { status: 'done' } : {});
		block(timed[d - 1] as string, d, d % 2 ? '14:00' : '10:30', d % 2 ? '15:00' : '11:30');
	}
	item('Penang trip', 3, { endDate: addDays(today, 5), type: 'Event' });
	item('FYP report due', 6, { type: 'Exam' });
	item('Someday: learn to bake bread', null);
	reminders.add(me, 'planner_item', remindOn, { offset: '2h' }); // tomorrow 14:00 - 2 h: always in the future

	// Keep: text, checklist, nested checklist, colours, pinned, binder
	const trips = keep.createBinder(me, 'Trips');
	const C = keep.NOTE_COLORS;
	const li = (id: string, text: string, checked = false, parentId: string | null = null) => ({ id, text, checked, parentId }); // prettier-ignore
	keep.create(me, { type: 'text', title: 'Wifi', body: 'Router is under the TV. Guest network: ask me.', pinned: true, color: C[5] }); // prettier-ignore
	keep.create(me, {
		type: 'checklist',
		title: 'Groceries',
		color: C[4],
		items: [
			li('a', 'Eggs', true),
			li('b', 'Rice'),
			li('c', 'Soy sauce'),
			li('d', 'Bananas', true),
			li('e', 'Coffee'),
		],
	});
	keep.create(me, {
		type: 'checklist',
		title: 'Penang packing',
		color: C[2],
		binders: [trips.id],
		items: [
			li('a', 'Clothes'),
			li('b', '3 shirts', true, 'a'),
			li('c', 'Rain jacket', false, 'a'),
			li('d', 'Tech'),
			li('e', 'Charger', false, 'd'),
			li('f', 'Power bank', true, 'd'),
			li('g', 'USB-C cable', false, 'f'),
			li('h', 'Passport'),
		],
	});
	keep.create(me, { type: 'text', title: 'Penang food list', body: 'Char kuey teow\nAssam laksa\nCendol at Penang Road', binders: [trips.id], color: C[0] }); // prettier-ignore
	keep.create(me, { type: 'text', title: 'Book quotes', body: 'A long note to test scrolling on a phone.\n\n' + 'The best code is the code never written. '.repeat(20) }); // prettier-ignore
	keep.create(me, { type: 'text', title: '', body: 'Gift idea for Sam: the blue mug', color: C[3] });
	keep.create(me, { type: 'text', title: 'Old note', body: 'Archived on purpose.', archived: true });

	// Pages: 3, one nested
	const page = (title: string, parentId: string | null, lines: string[]) => {
		const p = pagesRepo.create(me, { title, parentId });
		pagesRepo.update(me, p.id, { doc: { type: 'doc', content: lines.map(para) } });
		return p;
	};
	const projects = page('Projects', null, ['Everything in flight.', 'Phone sprint lives one level down.']);
	page('Phone sprint notes', projects.id, ['Foundation first: sheet, Back, tabs.', 'Test on a real Pixel.']);
	page('Reading list', null, ['Refactoring UI', 'Designing Data-Intensive Applications', 'The Pragmatic Programmer']); // prettier-ignore

	const file = join(dirname(dbPath), 'TEST-LOGIN.txt');
	writeFileSync(file, `Throwaway dev login for ${dbPath} (never use on a real server)\nusername: ${username}\npassword: ${password}\n`); // prettier-ignore
	console.log(`Phone seed done: ${dbPath}\nLogin written to ${file}`);
}
