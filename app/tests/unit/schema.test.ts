import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { healthy, migrateDb, openDb } from '../../src/lib/server/db';

let sqlite: Database.Database;
const Z = '2026-11-06T00:00:00Z';

function seedBase() {
	sqlite.exec(`
		INSERT INTO users (id, username, display_name) VALUES ('usr_a', 'jeremy', 'Jeremy');
		INSERT INTO calendars (id, owner_id, name, is_default) VALUES ('cal_a', 'usr_a', 'Main', 1);
	`);
}
const item = (over: Record<string, unknown> = {}) => {
	const row = {
		id: 'itm_1',
		calendar_id: 'cal_a',
		title: 'DS Quiz',
		type: 'Exam',
		date: '2026-11-06',
		time: null,
		end_date: null,
		created_at: Z,
		updated_at: Z,
		...over,
	};
	const cols = Object.keys(row);
	sqlite
		.prepare(`INSERT INTO items (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
		.run(...Object.values(row));
};
const block = (start: string, end: string) =>
	sqlite
		.prepare(
			`INSERT INTO blocks (id, calendar_id, label, start_at, end_at, created_at, updated_at) VALUES (?, 'cal_a', 'x', ?, ?, ?, ?)`,
		)
		.run(`blk_${Math.random()}`, start, end, Z, Z);

beforeEach(() => {
	const h = openDb(':memory:');
	migrateDb(h);
	sqlite = h.sqlite;
	expect(healthy(h)).toBe(true);
	seedBase();
});

describe('migrations', () => {
	it('pragmas on', () => {
		expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(5000);
	});

	it('all tables exist incl. fts5', () => {
		const names = sqlite
			.prepare(`SELECT name FROM sqlite_master WHERE type IN ('table') AND name NOT LIKE 'search_fts_%'`)
			.all()
			.map((r) => (r as { name: string }).name);
		for (const t of [
			'app_meta',
			'users',
			'sessions',
			'rate_limits',
			'invites',
			'calendars',
			'courses',
			'items',
			'blocks',
			'share_keys',
			'grants',
			'goals',
			'workout_split',
			'workout_logs',
			'places',
			'lists',
			'list_items',
			'people',
			'person_facts',
			'ideas',
			'step_templates',
			'search_fts',
		])
			expect(names).toContain(t);
	});

	it('items_cal_range index uses COALESCE expr', () => {
		const sql = (
			sqlite.prepare(`SELECT sql FROM sqlite_master WHERE name='items_cal_range'`).get() as { sql: string }
		).sql;
		expect(sql).toContain('COALESCE(`end_date`, `date`)');
	});
});

describe('constraints', () => {
	it('username unique case-insensitive', () => {
		expect(() =>
			sqlite.exec(`INSERT INTO users (id, username, display_name) VALUES ('usr_b','JEREMY','x')`),
		).toThrow(/UNIQUE/);
	});

	it('one default calendar per owner', () => {
		expect(() =>
			sqlite.exec(`INSERT INTO calendars (id, owner_id, name, is_default) VALUES ('cal_b','usr_a','Two',1)`),
		).toThrow(/UNIQUE/);
		sqlite.exec(`INSERT INTO calendars (id, owner_id, name, is_default) VALUES ('cal_c','usr_a','Extra',0)`);
	});

	it('item checks: type, time, end_date, title', () => {
		item();
		expect(() => item({ id: 'i2', type: 'School' })).toThrow(/CHECK/);
		expect(() => item({ id: 'i3', time: '2pm' })).toThrow(/CHECK/);
		expect(() => item({ id: 'i4', end_date: '2026-11-05' })).toThrow(/CHECK/);
		expect(() => item({ id: 'i5', date: null, end_date: '2026-11-05' })).toThrow(/CHECK/);
		expect(() => item({ id: 'i6', title: '' })).toThrow(/CHECK/);
		item({ id: 'i7', type: null, date: null }); // None + Unscheduled ok
		item({ id: 'i8', time: '14:00', end_date: '2026-11-08' });
	});

	it('blocks: UTC Z only, end > start, midnight cross ok', () => {
		block('2026-11-06T15:00:00Z', '2026-11-06T22:00:00Z'); // 23:00-06:00 KL
		expect(() => block('2026-11-06T15:00:00', '2026-11-06T22:00:00Z')).toThrow(/CHECK/);
		expect(() => block('2026-11-06T15:00:00Z', '2026-11-06T15:00:00Z')).toThrow(/CHECK/);
	});

	it('json columns must be valid json', () => {
		expect(() =>
			sqlite.exec(
				`INSERT INTO places (id, owner_id, name, city, areas) VALUES ('p1','usr_a','x','Kuching','not json')`,
			),
		).toThrow(/CHECK/);
		sqlite.exec(`INSERT INTO places (id, owner_id, name, city) VALUES ('p2','usr_a','x','Kuching')`);
	});

	it('goal period format', () => {
		sqlite.exec(`INSERT INTO goals (id, owner_id, period, text) VALUES ('g1','usr_a','2026-Q4','x')`);
		expect(() =>
			sqlite.exec(`INSERT INTO goals (id, owner_id, period, text) VALUES ('g2','usr_a','2026-Q5','x')`),
		).toThrow(/CHECK/);
	});

	it('user delete cascades calendar + items, audit FK set null', () => {
		sqlite.exec(`INSERT INTO users (id, username, display_name) VALUES ('usr_b','neina','Neina')`);
		item({ created_by: 'usr_b' });
		sqlite.exec(`DELETE FROM users WHERE id='usr_b'`);
		expect(
			(sqlite.prepare(`SELECT created_by FROM items WHERE id='itm_1'`).get() as { created_by: string | null })
				.created_by,
		).toBeNull();
		sqlite.exec(`DELETE FROM users WHERE id='usr_a'`);
		expect(sqlite.prepare(`SELECT count(*) c FROM items`).get()).toEqual({ c: 0 });
	});

	it('fts5 works', () => {
		sqlite.exec(
			`INSERT INTO search_fts (kind, ref_id, owner_id, text) VALUES ('item','itm_1','usr_a','Café quiz')`,
		);
		const r = sqlite
			.prepare(`SELECT ref_id FROM search_fts WHERE search_fts MATCH 'cafe' AND owner_id='usr_a'`)
			.all();
		expect(r).toEqual([{ ref_id: 'itm_1' }]);
	});
});
