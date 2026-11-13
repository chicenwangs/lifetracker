import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { importSeed, ORDER } from '../../src/lib/server/seed';
import * as usersRepo from '../../src/lib/server/repo/users';
import * as items from '../../src/lib/server/repo/items';
import { handle } from '../../src/lib/server/db';

const Z = '2026-01-01T00:00:00Z';
const O = 'usr_jeremy';
const C = 'cal_jeremy_main';

function fixture(over: Partial<Record<string, unknown[]>> = {}) {
	const d = mkdtempSync(join(tmpdir(), 'seed-'));
	const data: Record<string, unknown[]> = {
		items: [
			{
				id: 'itm_000000000001',
				calendar_id: C,
				title: 'DS Quiz',
				type: 'Exam',
				status: 'todo',
				date: '2026-11-13',
				time: null,
				end_date: null,
				course_id: 'crs_aaaaaaaaaaaa',
				parent_id: null,
				notes: 'ch 3',
				private: false,
				created_at: Z,
				updated_at: Z,
				started_at: null,
				completed_at: null,
				source: 'notion',
			},
			{
				id: 'itm_000000000002',
				calendar_id: C,
				title: 'Her Birthday',
				type: 'Dating',
				status: 'todo',
				date: null,
				time: null,
				end_date: null,
				course_id: null,
				parent_id: null,
				notes: null,
				private: false,
				created_at: Z,
				updated_at: Z,
				started_at: null,
				completed_at: null,
				source: 'notion',
			},
		],
		blocks: [
			{
				id: 'blk_000000000001',
				calendar_id: C,
				item_id: null,
				label: 'Gym',
				type: null,
				start_at: '2026-11-06T00:00:00Z',
				end_at: '2026-11-06T01:00:00Z',
				status: 'todo',
				created_at: Z,
				updated_at: Z,
			},
		],
		workout_split: [
			{
				id: 'wsp_000000000001',
				owner_id: O,
				weekday: 1,
				exercise: 'Bench',
				sort: 0,
				current_kg: 40,
				current_effort: 'moderate',
				legacy_weeks: { week1: { kg: 35, effort: null } },
			},
		],
		places: [
			{
				id: 'plc_000000000001',
				owner_id: O,
				name: 'Cafe Bujang',
				city: 'Kuching',
				areas: [],
				cuisines: ['Local'],
				open_when: ['Night'],
				closed_on: ['Mon'],
				halal: true,
				visited: false,
				approved: true,
				rating: null,
				notes: null,
				last_visited: null,
			},
		],
		lists: [{ id: 'lst_000000000001', owner_id: O, name: 'Watchlist', sort: 1 }],
		list_items: [
			{
				id: 'lit_000000000001',
				list_id: 'lst_000000000001',
				text: 'Dune 3',
				done: false,
				note: null,
				link: null,
				created_at: Z,
				sort: 0,
			},
		],
		people: [{ id: 'per_000000000001', owner_id: O, name: 'Neina', aliases: ['Nena'] }],
		person_facts: [
			{
				id: 'fct_000000000001',
				person_id: 'per_000000000001',
				category: 'likes',
				text: 'Matcha',
				detail: null,
				sort: 0,
			},
		],
		ideas: [
			{
				id: 'ida_000000000001',
				owner_id: O,
				channel: 'chicenwangs',
				stage: 'idea',
				text: 'vlog',
				created_at: Z,
				sort: 0,
			},
		],
		...over,
	};
	for (const t of ORDER) writeFileSync(join(d, `${t}.json`), JSON.stringify(data[t]));
	const counts = Object.fromEntries(ORDER.map((t) => [t, (data[t] ?? []).length]));
	writeFileSync(join(d, '_report.json'), JSON.stringify({ counts, warnings: ['4 stale doing'] }));
	return d;
}

let ownerId: string;
beforeEach(() => {
	freshDb();
	ownerId = usersRepo.createWithCalendar({
		username: 'jeremy',
		displayName: 'Jeremy',
		passwordHash: 'x',
		role: 'admin',
	}).id;
});

describe('importSeed', () => {
	it('imports all + remaps owner/calendar', () => {
		const r = importSeed(fixture(), 'jeremy');
		expect(r.inserted.items).toBe(2);
		expect(r.counts.places).toBe(1);
		expect(r.counts.courses).toBeUndefined();
		const s = handle().sqlite;
		expect(
			s
				.prepare(`SELECT count(*) c FROM items i JOIN calendars c ON c.id=i.calendar_id WHERE c.owner_id=?`)
				.get(ownerId),
		).toEqual({ c: 2 });
		expect(s.prepare(`SELECT owner_id FROM places`).get()).toEqual({ owner_id: ownerId });
		expect(s.prepare(`SELECT halal, open_when FROM places`).get()).toEqual({
			halal: 1,
			open_when: '["Night"]',
		});
		// v2: the index holds Keep + Pages only (old planner/places index dropped, DESIGN §9); import adds neither
		expect(s.prepare(`SELECT count(*) c FROM content_search WHERE owner_id=?`).get(ownerId)).toEqual({
			c: 0,
		});
		expect(r.warnings).toEqual(['4 stale doing']);
	});

	it('second run changes nothing; app edits kept', () => {
		const d = fixture();
		importSeed(d, 'jeremy');
		items.patch(ownerId, 'itm_000000000001', { title: 'DS Quiz (edited)' });
		const r2 = importSeed(d, 'jeremy');
		expect(r2.inserted.items).toBe(0);
		expect(items.getOwn(ownerId, 'itm_000000000001')?.title).toBe('DS Quiz (edited)');
		expect(handle().sqlite.prepare(`SELECT count(*) c FROM items`).get()).toEqual({ c: 2 });
	});

	it('bad row -> fails loud with file + index, nothing written', () => {
		const d = fixture({ items: [{ id: 'itm_000000000009', title: '' }] });
		expect(() => importSeed(d, 'jeremy')).toThrow(/items\.json\[0\]/);
		expect(handle().sqlite.prepare(`SELECT count(*) c FROM places`).get()).toEqual({ c: 0 });
	});

	it('unknown owner -> error', () => {
		expect(() => importSeed(fixture(), 'nobody')).toThrow(/owner user not found/);
	});
});
