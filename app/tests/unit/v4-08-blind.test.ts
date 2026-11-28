// Blind tests for card 08 (migration 0011), written from its Done-when lines only. No builder test was opened.
// In-memory / temp DBs only: the real data folder and app/.env DB are never touched.
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { migrateDb, openDb, setHandle, type Handle } from '../../src/lib/server/db';
import { pending } from '../../src/lib/server/dormant';
import { itemTypes, items, users } from '../../src/lib/server/schema';

const DRIZZLE = resolve(process.cwd(), 'drizzle');
const SQL_0011 = join(DRIZZLE, '0011_v33_columns.sql');
const META = join(DRIZZLE, 'meta');
const Z = '2026-11-20T08:00:00Z';

type JournalEntry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };
type Journal = { version: string; dialect: string; entries: JournalEntry[] };
type ColInfo = {
	cid: number;
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
};
type SnapCol = { name: string; type: string; notNull: boolean; default?: unknown };
type SnapIndex = { name: string; columns: string[]; isUnique: boolean; where?: string };
type Snapshot = {
	id: string;
	prevId: string;
	tables: Record<string, { columns: Record<string, SnapCol>; indexes: Record<string, SnapIndex> }>;
};

// ---- helpers ---------------------------------------------------------------------------------------------
const readJournal = (): Journal => JSON.parse(readFileSync(join(META, '_journal.json'), 'utf8')) as Journal;
const readSnapshot = (tag: string): Snapshot =>
	JSON.parse(readFileSync(join(META, `${tag}_snapshot.json`), 'utf8')) as Snapshot;
const tableInfo = (s: Database.Database, t: string): ColInfo[] =>
	s.prepare(`PRAGMA table_info('${t}')`).all() as ColInfo[];
const hasColumn = (s: Database.Database, t: string, c: string): boolean =>
	tableInfo(s, t).some((x) => x.name === c);
const tableNames = (s: Database.Database): string[] =>
	(
		s
			.prepare(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
			)
			.all() as { name: string }[]
	).map((r) => r.name);
const objectNames = (s: Database.Database): string[] =>
	(
		s.prepare(`SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name`).all() as {
			name: string;
		}[]
	).map((r) => r.name);
const count = (s: Database.Database, t: string): number =>
	(s.prepare(`SELECT count(*) AS c FROM "${t}"`).get() as { c: number }).c;
const rowsViolating = (s: Database.Database, fromWhere: string): number =>
	(s.prepare(`SELECT count(*) AS c FROM ${fromWhere}`).get() as { c: number }).c;
const appliedMigrations = (s: Database.Database): number[] =>
	(
		s.prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at').all() as {
			created_at: number;
		}[]
	).map((r) => r.created_at);

const health = (s: Database.Database) => ({
	integrity: s.pragma('integrity_check', { simple: true }),
	fk: s.pragma('foreign_key_check'),
});

/** every table the DB has (minus drizzle's bookkeeping): row count + the ids, like migration-check */
function snapshot(s: Database.Database): Record<string, { count: number; ids: string[] }> {
	const out: Record<string, { count: number; ids: string[] }> = {};
	for (const t of tableNames(s).filter((n) => n !== '__drizzle_migrations')) {
		const ids = hasColumn(s, t, 'id')
			? (s.prepare(`SELECT id FROM "${t}" ORDER BY id`).all() as { id: string }[]).map((r) => String(r.id))
			: [];
		out[t] = { count: count(s, t), ids };
	}
	return out;
}

function migrateInMemory(folder = DRIZZLE): Handle {
	const h = openDb(':memory:');
	migrateDb(h, folder);
	return h;
}

function seedBase(s: Database.Database): void {
	s.exec(`
		INSERT INTO users (id, username, display_name) VALUES ('usr_a', 'jeremy', 'Jeremy');
		INSERT INTO calendars (id, owner_id, name, is_default) VALUES ('cal_a', 'usr_a', 'Main', 1), ('cal_b', 'usr_a', 'Work', 0);
	`);
}

/** A v3.1.2-shaped DB: every migration up to 0010, then ordinary app rows. */
function seedV312(s: Database.Database): void {
	s.exec(`
		INSERT INTO users (id, username, display_name) VALUES ('usr_owner', 'owner', 'Owner'), ('usr_partner', 'partner', 'Partner');
		INSERT INTO calendars (id, owner_id, name, is_default) VALUES ('cal_main', 'usr_owner', 'Main', 1), ('cal_partner', 'usr_partner', 'Partner', 1);
		INSERT INTO item_types (id, owner_id, key, name, bg, ink, slug, position, builtin, is_default, created_at, updated_at) VALUES
			('typ_work', 'usr_owner', 'Work', 'Work', '#000', '#fff', 'work', 0, 1, 1, '${Z}', '${Z}'),
			('typ_exam', 'usr_owner', 'Exam', 'Exam', '#111', '#fff', 'exam', 1, 1, 0, '${Z}', '${Z}'),
			('typ_custom', 'usr_partner', 'custom', 'Custom', '#222', '#fff', 'custom', 0, 0, 0, '${Z}', '${Z}');
		INSERT INTO items (id, calendar_id, title, type, status, date, time, source, created_at, updated_at) VALUES
			('itm_a', 'cal_main', 'Essay', 'Work', 'todo', '2026-11-20', '09:00', NULL, '${Z}', '${Z}'),
			('itm_b', 'cal_main', 'Quiz', 'Exam', 'done', '2026-11-21', NULL, 'notion', '${Z}', '${Z}'),
			('itm_c', 'cal_partner', 'Groceries', NULL, 'todo', '2026-11-22', NULL, NULL, '${Z}', '${Z}');
		INSERT INTO blocks (id, calendar_id, label, start_at, end_at, created_at, updated_at) VALUES
			('blk_a', 'cal_main', 'Study', '2026-11-20T01:00:00Z', '2026-11-20T02:00:00Z', '${Z}', '${Z}');
		INSERT INTO grants (id, calendar_id, grantee_id, permission, visible_types, hidden_as, created_at) VALUES
			('grt_a', 'cal_main', 'usr_partner', 'view', '[]', 'busy', '${Z}');
		INSERT INTO goals (id, owner_id, period, text) VALUES ('goal_a', 'usr_owner', '2026-Q4', 'Ship v4');
		INSERT INTO ideas (id, owner_id, channel, text, created_at) VALUES ('idea_a', 'usr_owner', 'yt', 'Blind tests', '${Z}');
		INSERT INTO places (id, owner_id, name, city) VALUES ('plc_a', 'usr_owner', 'Kopitiam', 'Kuching');
		INSERT INTO lists (id, owner_id, name) VALUES ('lst_a', 'usr_owner', 'Packing');
		INSERT INTO list_items (id, list_id, text, created_at) VALUES ('li_a', 'lst_a', 'Passport', '${Z}');
		INSERT INTO people (id, owner_id, name) VALUES ('ppl_a', 'usr_owner', 'Aunt');
		INSERT INTO person_facts (id, person_id, category, text) VALUES ('pf_a', 'ppl_a', 'likes', 'Tea');
		INSERT INTO step_templates (id, owner_id, name, steps) VALUES ('stp_a', 'usr_owner', 'Trip', '[]');
		INSERT INTO workout_split (id, owner_id, weekday, exercise, sort) VALUES ('wsp_a', 'usr_owner', 1, 'Push', 0);
		INSERT INTO workout_logs (id, owner_id, date, exercise, created_at) VALUES ('wlg_a', 'usr_owner', '2026-11-20', 'Push', '${Z}');
		INSERT INTO courses (id, owner_id, code, name) VALUES ('crs_a', 'usr_owner', 'CS101', 'Intro');
		INSERT INTO pages (id, owner_id, title, position, created_at, updated_at) VALUES ('pg_a', 'usr_owner', 'Notes', 0, '${Z}', '${Z}');
		INSERT INTO keep_notes (id, owner_id, note_type, title, body, position, created_at, updated_at) VALUES
			('kna', 'usr_owner', 'text', 'Note', '', 0, '${Z}', '${Z}');
		INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, status, created_at, updated_at) VALUES
			('rem_a', 'usr_owner', 'planner_item', 'itm_a', 'relative', 'scheduled', '${Z}', '${Z}');
	`);
}

// A copy of the migration folder with the journal cut at 0010: lets a test build a real v3.1.2 DB.
let before0011 = '';
beforeAll(() => {
	before0011 = mkdtempSync(join(tmpdir(), 'lt-v4-08-blind-'));
	mkdirSync(join(before0011, 'meta'), { recursive: true });
	const journal = readJournal();
	const entries = journal.entries.filter((e) => e.idx <= 10);
	for (const e of entries) copyFileSync(join(DRIZZLE, `${e.tag}.sql`), join(before0011, `${e.tag}.sql`));
	writeFileSync(join(before0011, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
});
afterAll(() => rmSync(before0011, { recursive: true, force: true }));

const preV33 = (): Handle => migrateInMemory(before0011);

// ---- C1 --------------------------------------------------------------------------------------------------
it('C1 the migration is exactly four ADD COLUMN statements, with the stated types/defaults and digest CHECK', () => {
	const raw = readFileSync(SQL_0011, 'utf8');
	// split on the drizzle separator first: stripping `--` comments globally would eat it too
	const stmts = raw
		.split('--> statement-breakpoint')
		.map((x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--[^\n]*$/gm, ''))
		.map((x) => x.replace(/`/g, '').replace(/\s+/g, ' ').trim().replace(/;$/, ''))
		.filter(Boolean);
	const sql = stmts.join(' ');

	expect(stmts).toHaveLength(5);
	const alters = stmts.filter((x) => /^ALTER TABLE /i.test(x));
	expect(alters).toHaveLength(4);
	const has = (re: RegExp) =>
		expect(
			alters.some((x) => re.test(x)),
			`missing ${re}`,
		).toBe(true);
	has(/^ALTER TABLE items ADD repeat_from_completion INTEGER NOT NULL DEFAULT 0$/i);
	has(/^ALTER TABLE items ADD ics_uid TEXT$/i);
	has(/^ALTER TABLE item_types ADD on_calendar INTEGER NOT NULL DEFAULT 1$/i);
	has(
		/^ALTER TABLE users ADD digest_time TEXT DEFAULT NULL CHECK \(digest_time IS NULL OR digest_time GLOB '\[0-2\]\[0-9\]:\[0-5\]\[0-9\]'\)$/i,
	);

	// no rebuild, no copy: only the four ALTERs and the index (asserted in C2) exist
	expect(sql).not.toMatch(/\b(DROP|RENAME|INSERT|UPDATE|DELETE)\b/i);
	expect(sql).not.toMatch(/CREATE\s+TABLE/i);
	expect(stmts.filter((x) => /^CREATE UNIQUE INDEX /i.test(x))).toHaveLength(1);

	// the CHECK is live: NULL and a loose HH:MM pass, a malformed time is refused
	const h = migrateInMemory();
	const s = h.sqlite;
	s.exec(`INSERT INTO users (id, username, display_name) VALUES ('usr_x', 'x', 'X')`);
	for (const bad of ['7:05', '07:5', '0705', '23:60', '99:99']) {
		expect(() => s.exec(`UPDATE users SET digest_time = '${bad}' WHERE id = 'usr_x'`), bad).toThrow(/CHECK/);
	}
	s.exec(`UPDATE users SET digest_time = NULL WHERE id = 'usr_x'`);
	for (const ok of ['00:00', '07:05', '23:59']) {
		s.exec(`UPDATE users SET digest_time = '${ok}' WHERE id = 'usr_x'`);
	}
});

// ---- C2 --------------------------------------------------------------------------------------------------
it('C2 the partial unique index allows one live import per calendar and ignores trashed rows', () => {
	const h = migrateInMemory();
	const s = h.sqlite;
	const sql = (
		s.prepare(`SELECT sql FROM sqlite_master WHERE name = 'items_ics_uid'`).get() as {
			sql: string;
		}
	).sql;
	expect(sql.replace(/`/g, '').replace(/\s+/g, ' ')).toBe(
		'CREATE UNIQUE INDEX items_ics_uid ON items (calendar_id, ics_uid) WHERE ics_uid IS NOT NULL AND deleted_at IS NULL',
	);
	const list = s.prepare(`PRAGMA index_list('items')`).all() as {
		name: string;
		unique: number;
		partial: number;
	}[];
	expect(list.find((i) => i.name === 'items_ics_uid')).toMatchObject({ unique: 1, partial: 1 });
	const cols = s.prepare(`PRAGMA index_info('items_ics_uid')`).all() as { name: string }[];
	expect(cols.map((c) => c.name)).toEqual(['calendar_id', 'ics_uid']);

	seedBase(s);
	const add = (id: string, uid: string | null, cal = 'cal_a', deleted: string | null = null) =>
		s
			.prepare(
				'INSERT INTO items (id, calendar_id, title, ics_uid, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
			)
			.run(id, cal, id, uid, deleted, Z, Z);
	add('itm_1', 'UID-1');
	expect(() => add('itm_2', 'UID-1')).toThrow(/UNIQUE/);
	add('itm_3', 'UID-1', 'cal_b'); // same UID on another calendar is a different import
	add('itm_4', null); // NULL never collides
	add('itm_5', null);
	s.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').run(Z, 'itm_1');
	add('itm_6', 'UID-1'); // D-V4-09: a trashed row must not block a re-import
	expect(() => add('itm_7', 'UID-1')).toThrow(/UNIQUE/); // ...but the live re-import still does

	// nothing else changes: going 0000-0010 -> 0011 adds this index and no other object, and users keeps NOCASE
	const old = preV33();
	seedBase(old.sqlite);
	const before = objectNames(old.sqlite);
	migrateDb(old);
	const after = objectNames(old.sqlite);
	expect(after.filter((n) => !before.includes(n))).toEqual(['items_ics_uid']);
	expect(before.filter((n) => !after.includes(n))).toEqual([]);
	expect(() =>
		old.sqlite.exec(`INSERT INTO users (id, username, display_name) VALUES ('usr_b', 'JEREMY', 'x')`),
	).toThrow(/UNIQUE/);
});

// ---- C3 --------------------------------------------------------------------------------------------------
it('C3 schema.ts, the 0011 snapshot and the journal all carry the four columns', () => {
	const col = (table: ReturnType<typeof getTableConfig>, name: string) =>
		table.columns.find((c) => c.name === name)!;
	const repeat = col(getTableConfig(items), 'repeat_from_completion');
	expect(repeat.dataType).toBe('boolean'); // integer boolean mode
	expect(repeat.notNull).toBe(true);
	expect(repeat.hasDefault).toBe(true);
	expect(repeat.default).toBe(false);
	const uid = col(getTableConfig(items), 'ics_uid');
	expect(uid.dataType).toBe('string');
	expect(uid.notNull).toBe(false);
	expect(uid.hasDefault).toBe(false);
	const onCal = col(getTableConfig(itemTypes), 'on_calendar');
	expect(onCal.dataType).toBe('boolean');
	expect(onCal.notNull).toBe(true);
	expect(onCal.default).toBe(true);
	const digest = col(getTableConfig(users), 'digest_time');
	expect(digest.dataType).toBe('string');
	expect(digest.notNull).toBe(false);
	expect(digest.hasDefault).toBe(false);
	const idx = getTableConfig(items).indexes.find((i) => i.config.name === 'items_ics_uid');
	expect(idx).toBeTruthy();
	expect(idx!.config.unique).toBe(true);
	expect(idx!.config.columns.map((c) => String((c as unknown as { name: string }).name))).toEqual([
		'calendar_id',
		'ics_uid',
	]);
	expect(idx!.config.where).toBeTruthy();

	const snap = readSnapshot('0011');
	const before = readSnapshot('0010');
	expect(snap.prevId).toBe(before.id);
	expect(snap.tables.items!.columns.repeat_from_completion!).toMatchObject({
		type: 'integer',
		notNull: true,
		default: false,
	});
	expect(snap.tables.items!.columns.ics_uid!).toMatchObject({ type: 'text', notNull: false });
	expect(snap.tables.items!.columns.ics_uid!.default).toBeUndefined();
	expect(snap.tables.item_types!.columns.on_calendar!).toMatchObject({
		type: 'integer',
		notNull: true,
		default: true,
	});
	expect(snap.tables.users!.columns.digest_time!).toMatchObject({ type: 'text', notNull: false });
	expect(snap.tables.users!.columns.digest_time!.default).toBeUndefined();
	expect(snap.tables.items!.indexes.items_ics_uid).toEqual({
		name: 'items_ics_uid',
		columns: ['calendar_id', 'ics_uid'],
		isUnique: true,
		where: 'ics_uid IS NOT NULL AND deleted_at IS NULL',
	});

	const journal = readJournal();
	// 0011 is entry 11; later cards append entries and keep this prefix
	expect(journal.entries.slice(0, 12).map((e) => e.idx)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
	expect(journal.entries[11]).toMatchObject({ idx: 11, tag: '0011_v33_columns' });
	expect(journal.entries[11]!.breakpoints).toBe(true);
	for (const e of journal.entries) expect(existsSync(join(DRIZZLE, `${e.tag}.sql`))).toBe(true);
});

// ---- C4 --------------------------------------------------------------------------------------------------
it('C4 migrateDb applies 0000-0011 on an empty, a v3.1.2-shaped and a new DB, stays sound, and a second run is a no-op', () => {
	// 1. empty
	const empty = migrateInMemory();
	const count = readJournal().entries.length;
	expect(health(empty.sqlite)).toEqual({ integrity: 'ok', fk: [] });
	expect(appliedMigrations(empty.sqlite)).toHaveLength(count);
	expect(appliedMigrations(empty.sqlite).at(-1)).toBe(readJournal().entries.at(-1)!.when);
	const first = snapshot(empty.sqlite);
	migrateDb(empty);
	expect(health(empty.sqlite)).toEqual({ integrity: 'ok', fk: [] });
	expect(snapshot(empty.sqlite)).toEqual(first);
	expect(appliedMigrations(empty.sqlite)).toHaveLength(count);

	// 2. upgrade from the v3.1.2 shape: 0000-0010 + rows, then every later migration
	const old = preV33();
	seedV312(old.sqlite);
	expect(hasColumn(old.sqlite, 'items', 'repeat_from_completion')).toBe(false);
	expect(hasColumn(old.sqlite, 'users', 'digest_time')).toBe(false);
	migrateDb(old);
	expect(health(old.sqlite)).toEqual({ integrity: 'ok', fk: [] });
	expect(appliedMigrations(old.sqlite)).toHaveLength(count);
	const upgraded = snapshot(old.sqlite);
	migrateDb(old);
	expect(health(old.sqlite)).toEqual({ integrity: 'ok', fk: [] });
	expect(snapshot(old.sqlite)).toEqual(upgraded);

	// 3. new seed: app rows written on the new schema, then migrate again
	const fresh = migrateInMemory();
	seedBase(fresh.sqlite);
	fresh.sqlite
		.prepare(
			'INSERT INTO items (id, calendar_id, title, ics_uid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
		)
		.run('itm_new', 'cal_a', 'New', 'UID-NEW', Z, Z);
	const seeded = snapshot(fresh.sqlite);
	migrateDb(fresh);
	expect(health(fresh.sqlite)).toEqual({ integrity: 'ok', fk: [] });
	expect(snapshot(fresh.sqlite)).toEqual(seeded);
	expect(appliedMigrations(fresh.sqlite)).toHaveLength(count);
});

// ---- C5 --------------------------------------------------------------------------------------------------
it('C5 old rows keep the old behaviour and every old table keeps its rows and ids', () => {
	const h = preV33();
	seedV312(h.sqlite);
	const before = snapshot(h.sqlite);
	expect(before.users!.count).toBe(2);
	expect(before.items!.count).toBe(3);
	expect(before.item_types!.count).toBe(3);
	expect(before.keep_notes!.count).toBe(1);
	expect(before.reminders!.count).toBe(1);

	migrateDb(h);
	expect(count(h.sqlite, 'items')).toBe(3);
	expect(hasColumn(h.sqlite, 'items', 'repeat_from_completion')).toBe(true);
	expect(rowsViolating(h.sqlite, 'items WHERE repeat_from_completion <> 0 OR ics_uid IS NOT NULL')).toBe(0);
	expect(rowsViolating(h.sqlite, 'item_types WHERE on_calendar <> 1')).toBe(0);
	expect(rowsViolating(h.sqlite, 'users WHERE digest_time IS NOT NULL')).toBe(0);
	expect(snapshot(h.sqlite)).toEqual(before); // counts + ids unchanged in every old table
	expect(h.sqlite.prepare(`SELECT source FROM items WHERE id = 'itm_b'`).get()).toEqual({ source: 'notion' });
});

// ---- C6 --------------------------------------------------------------------------------------------------
it('C6 the items_source CHECK is untouched, dormant tables survive and dormant.ts still reads them', () => {
	const h = migrateInMemory();
	const s = h.sqlite;
	const sql = (
		s.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'`).get() as {
			sql: string;
		}
	).sql.replace(/\s+/g, ' ');
	expect(sql).toMatch(/CONSTRAINT "items_source" CHECK ?\(source IS NULL OR source = 'notion'\)/i);

	seedBase(s);
	const add = (id: string, source: string | null) =>
		s
			.prepare(
				'INSERT INTO items (id, calendar_id, title, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
			)
			.run(id, 'cal_a', id, source, Z, Z);
	add('itm_null', null);
	add('itm_notion', 'notion');
	for (const bad of ['ics', 'import']) {
		expect(() => add(`itm_${bad}`, bad), bad).toThrow(/CHECK/);
	}

	for (const t of [
		'courses',
		'goals',
		'workout_split',
		'workout_logs',
		'lists',
		'list_items',
		'people',
		'person_facts',
		'places',
		'ideas',
		'step_templates',
	])
		expect(tableNames(s), t).toContain(t);

	// dormant.ts was not edited: its v1-table reads still work on the new schema
	setHandle(h);
	expect(pending('usr_a')).toEqual({ lists: 0, people: 0, ideas: 0, places: 0, goals: 0, workouts: 0 });
	s.exec(`INSERT INTO lists (id, owner_id, name) VALUES ('lst_1', 'usr_a', 'Packing')`);
	expect(pending('usr_a')?.lists).toBe(1);
});

// ---- C7 --------------------------------------------------------------------------------------------------
it('C7 each new column appears once in PRAGMA table_info with its declared default', () => {
	const h = migrateInMemory();
	const s = h.sqlite;
	const one = (t: string, name: string): ColInfo => {
		const hits = tableInfo(s, t).filter((c) => c.name === name);
		expect(hits, `${t}.${name}`).toHaveLength(1);
		return hits[0]!;
	};
	expect(one('items', 'repeat_from_completion')).toMatchObject({
		type: 'INTEGER',
		notnull: 1,
		dflt_value: '0',
		pk: 0,
	});
	expect(one('items', 'ics_uid')).toMatchObject({ type: 'TEXT', notnull: 0, pk: 0 });
	expect(one('items', 'ics_uid').dflt_value).toBeNull();
	expect(one('item_types', 'on_calendar')).toMatchObject({
		type: 'INTEGER',
		notnull: 1,
		dflt_value: '1',
		pk: 0,
	});
	const digest = one('users', 'digest_time');
	expect(digest).toMatchObject({ type: 'TEXT', notnull: 0, pk: 0 });
	expect(['NULL', null]).toContain(digest.dflt_value);
	expect(tableInfo(s, 'users').filter((c) => c.name === 'digest_time')).toHaveLength(1);

	// insert without the four columns: an old-style write still gets old behaviour
	seedBase(s);
	s.exec(
		`INSERT INTO items (id, calendar_id, title, created_at, updated_at) VALUES ('itm_d', 'cal_a', 'D', '${Z}', '${Z}')`,
	);
	expect(
		s.prepare(`SELECT repeat_from_completion AS r, ics_uid AS u FROM items WHERE id = 'itm_d'`).get(),
	).toEqual({ r: 0, u: null });
	s.exec(
		`INSERT INTO item_types (id, owner_id, key, name, bg, ink, slug, position, created_at, updated_at) VALUES ('typ_d', 'usr_a', 'k', 'K', '#000', '#fff', 'k', 9, '${Z}', '${Z}')`,
	);
	expect(s.prepare(`SELECT on_calendar AS c FROM item_types WHERE id = 'typ_d'`).get()).toEqual({ c: 1 });
	expect(s.prepare(`SELECT digest_time AS d FROM users WHERE id = 'usr_a'`).get()).toEqual({ d: null });
});
