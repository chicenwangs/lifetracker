// Blind test for card 15 (migration 0012), written from its Done-when lines only.
// Every DB here is in-memory. The real drizzle folder is only read: once to rebuild a v3.1.2-shaped DB at
// 0011, then migrateDb() applies 0012 on top of it. No real data, no builder test was opened.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { migrateDb, openDb, setHandle, type Handle } from '../../src/lib/server/db';
import { initEnv } from '../../src/lib/server/env';
import { pending as dormantPending } from '../../src/lib/server/dormant';
import { attachments, pages, reminders, REMINDER_SOURCES } from '../../src/lib/server/schema';
import { sourceInfo, type Source } from '../../src/lib/server/reminders';

const REAL = resolve(process.cwd(), 'drizzle');
const Z = '2026-11-01T00:00:00Z';
const migrationSql = (tag: string) => readFileSync(join(REAL, `${tag}.sql`), 'utf8');
const metaFile = (name: string) => readFileSync(join(REAL, 'meta', name), 'utf8');

interface Col {
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
}
interface Fk {
	table: string;
	from: string;
	to: string;
	on_update: string;
	on_delete: string;
}
interface JournalEntry {
	idx: number;
	when: number;
	tag: string;
}
interface Journal {
	version: string;
	dialect: string;
	entries: JournalEntry[];
}
interface SnapshotColumn {
	name: string;
	type: string;
	notNull: boolean;
	default?: unknown;
}
interface Snapshot {
	dialect: string;
	id: string;
	prevId: string;
	tables: Record<
		string,
		{
			columns: Record<string, SnapshotColumn>;
			foreignKeys?: Record<
				string,
				{ tableTo: string; columnsFrom: string[]; columnsTo: string[]; onDelete?: string }
			>;
			checkConstraints?: Record<string, { value: string }>;
		}
	>;
}
interface DbSnapshot {
	[table: string]: { count: number; ids: string | null };
}

const handles: Handle[] = [];
const tempDirs: string[] = [];

beforeAll(() => {
	initEnv({
		NODE_ENV: 'test',
		DATABASE_PATH: ':memory:',
		ORIGIN: 'http://localhost:5173',
		APP_SECRET: 'blind-test-secret-'.padEnd(40, 'x'),
		SETUP_TOKEN: 'setup-token-123-long-enough',
	});
});

afterEach(() => {
	for (const h of handles.splice(0)) h.sqlite.close();
	for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fresh(): Handle {
	const h = openDb(':memory:');
	setHandle(h);
	handles.push(h);
	return h;
}

function journal(): Journal {
	return JSON.parse(metaFile('_journal.json')) as Journal;
}

/** A copy of the real migrations folder, cut at `untilIdx`; optional per-file tamper. */
function migrationsUpTo(untilIdx: number, tamper?: (tag: string, sql: string) => string): string {
	const dir = mkdtempSync(join(tmpdir(), 'lt-0012-'));
	tempDirs.push(dir);
	mkdirSync(join(dir, 'meta'));
	const j = journal();
	const entries = j.entries.filter((e) => e.idx <= untilIdx);
	writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...j, entries }));
	for (const e of entries) {
		const sql = migrationSql(e.tag);
		writeFileSync(join(dir, `${e.tag}.sql`), tamper?.(e.tag, sql) ?? sql);
	}
	return dir;
}

/** A DB migrated to 0011 (v3.1.2 shape), optionally seeded with the representative rows below. */
function at0011(seed?: (h: Handle) => void): Handle {
	const h = fresh();
	migrateDb(h, migrationsUpTo(11));
	if (seed) {
		seed(h);
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
	}
	return h;
}

/** The same DB upgraded to 0012 by the real migrations folder. */
function upgraded(seed?: (h: Handle) => void): Handle {
	const h = at0011(seed);
	migrateDb(h);
	return h;
}

function all<T>(h: Handle, sql: string, ...args: (string | number | null)[]): T[] {
	return h.sqlite.prepare(sql).all(...args) as T[];
}
function one<T>(h: Handle, sql: string, ...args: (string | number | null)[]): T {
	return h.sqlite.prepare(sql).get(...args) as T;
}
function count(h: Handle, table: string): number {
	return one<{ n: number }>(h, `SELECT count(*) AS n FROM "${table}"`).n;
}
function cols(h: Handle, table: string): Col[] {
	return h.sqlite.pragma(`table_info("${table}")`) as Col[];
}
function fks(h: Handle, table: string): Fk[] {
	return h.sqlite.pragma(`foreign_key_list("${table}")`) as Fk[];
}
function objectSql(h: Handle, name: string): string {
	const r = one<{ sql: string | null }>(h, 'SELECT sql FROM sqlite_master WHERE name = ?', name);
	return r.sql ?? '';
}
function tableNames(h: Handle): string[] {
	return all<{ name: string }>(h, `SELECT name FROM sqlite_master WHERE type = 'table'`).map((r) => r.name);
}
/** every sqlite_master object (tables, indexes) by name, sql included */
function schemaObjects(h: Handle): Record<string, string> {
	const rows = all<{ name: string; sql: string }>(
		h,
		`SELECT name, sql FROM sqlite_master
		 WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`,
	);
	return Object.fromEntries(rows.map((r) => [r.name, r.sql]));
}
/** migration-check.mjs step 2's snapshot: row count + a hash of every id, per table */
function dbSnapshot(h: Handle): DbSnapshot {
	const wanted = all<{ name: string }>(
		h,
		`SELECT name FROM sqlite_master WHERE type = 'table'
		 AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' AND name NOT LIKE '__drizzle%'`,
	);
	const out: DbSnapshot = {};
	for (const { name } of wanted) {
		const hasId = cols(h, name).some((c) => c.name === 'id');
		const ids = hasId
			? createHash('sha256')
					.update(
						all<{ id: unknown }>(h, `SELECT id FROM "${name}" ORDER BY id`)
							.map((r) => String(r.id))
							.join('\n'),
					)
					.digest('hex')
					.slice(0, 16)
			: null;
		out[name] = { count: count(h, name), ids };
	}
	return out;
}

/** Statements of a migration file, comment lines stripped, backticks normalised away. */
function statements(tag: string): string[] {
	return migrationSql(tag)
		.split('--> statement-breakpoint')
		.map((s) =>
			s
				.replace(/^\s*--[^\n]*/gm, '')
				.trim()
				.replace(/;+$/, '')
				.replace(/`/g, ''),
		)
		.filter(Boolean);
}

/** The v3.1.2-shaped seed: one or more rows in every table the old release writes. */
function seedV312(h: Handle): void {
	h.sqlite.exec(`
		INSERT INTO users (id, username, display_name, created_at) VALUES
			('usr_a', 'jeremy', 'Jeremy', '${Z}'),
			('usr_b', 'neina', 'Neina', '${Z}');
		INSERT INTO calendars (id, owner_id, name, is_default, created_at) VALUES
			('cal_a', 'usr_a', 'Main', 1, '${Z}'),
			('cal_b', 'usr_b', 'Mine', 1, '${Z}');
		INSERT INTO items (id, calendar_id, title, type, status, date, time, end_date, rrule, exdates, created_at, updated_at, deleted_at, source) VALUES
			('itm_1', 'cal_a', 'DS Quiz', 'Exam', 'todo', '2026-11-06', NULL, NULL, NULL, NULL, '${Z}', '${Z}', NULL, NULL),
			('itm_2', 'cal_a', 'Standup', 'Work', 'doing', '2026-11-07', '14:00', '2026-11-08', 'FREQ=WEEKLY', '["2026-11-14"]', '${Z}', '${Z}', NULL, NULL),
			('itm_3', 'cal_b', 'Old thing', NULL, 'done', NULL, NULL, NULL, NULL, NULL, '${Z}', '${Z}', '${Z}', 'notion');
		INSERT INTO blocks (id, calendar_id, item_id, label, start_at, end_at, status, created_at, updated_at) VALUES
			('blk_1', 'cal_a', 'itm_1', 'Quiz block', '2026-11-06T06:00:00Z', '2026-11-06T07:00:00Z', 'todo', '${Z}', '${Z}'),
			('blk_2', 'cal_b', NULL, 'Gym', '2026-11-07T10:00:00Z', '2026-11-07T11:00:00Z', 'done', '${Z}', '${Z}');
		INSERT INTO pages (id, owner_id, parent_page_id, title, icon, position, archived_at, last_opened_at, deleted_at, created_at, updated_at, created_by, updated_by, revision) VALUES
			('pg_1', 'usr_a', NULL, 'Home', NULL, 1, NULL, '${Z}', NULL, '${Z}', '${Z}', 'usr_a', 'usr_a', 2),
			('pg_2', 'usr_a', 'pg_1', 'Child', '📄', 2, NULL, NULL, NULL, '${Z}', '${Z}', NULL, NULL, 1),
			('pg_3', 'usr_b', NULL, 'Old page', NULL, 3, '${Z}', NULL, '${Z}', '${Z}', '${Z}', NULL, NULL, 4);
		INSERT INTO page_blocks (id, page_id, parent_block_id, block_type, position, content_json, schema_version, created_at, updated_at, updated_by) VALUES
			('pb_1', 'pg_1', NULL, 'paragraph', 1, '{"type":"paragraph","content":[]}', 1, '${Z}', '${Z}', NULL),
			('pb_2', 'pg_1', 'pb_1', 'text', 2, '{"text":"hi"}', 1, '${Z}', '${Z}', 'usr_a');
		INSERT INTO page_links (id, source_page_id, target_page_id, source_block_id, created_at) VALUES
			('pl_1', 'pg_1', 'pg_2', 'pb_2', '${Z}');
		INSERT INTO page_shortcuts (user_id, page_id, slot, created_at) VALUES
			('usr_a', 'pg_1', 0, '${Z}');
		INSERT INTO attachments (id, owner_id, storage_key, original_name, mime_type, byte_size, status, created_at) VALUES
			('att_1', 'usr_a', 'att/one.png', 'one.png', 'image/png', 10, 'ready', '${Z}'),
			('att_2', 'usr_b', 'att/two.pdf', 'two.pdf', 'application/pdf', 20, 'ready', '${Z}');
		INSERT INTO keep_notes (id, owner_id, note_type, title, body, position, archived_at, created_at, updated_at) VALUES
			('note_1', 'usr_a', 'checklist', 'Groceries', '', 1, NULL, '${Z}', '${Z}'),
			('note_2', 'usr_a', 'text', 'Scroll', 'body', 2, '${Z}', '${Z}', '${Z}');
		INSERT INTO push_subscriptions (id, user_id, endpoint_hash, endpoint, p256dh, auth, created_at) VALUES
			('sub_1', 'usr_a', 'hash1', 'https://push.example/1', 'p256', 'auth', '${Z}');
		INSERT INTO undo_actions (id, user_id, label, rows, created_at, expires_at) VALUES
			('und_1', 'usr_a', 'add item', '[]', '${Z}', '${Z}');
		INSERT INTO app_meta (key, value) VALUES ('seed', 'v3.1.2');
		INSERT INTO lists (id, owner_id, name, sort) VALUES ('lst_1', 'usr_a', 'Shopping', 0);
		INSERT INTO list_items (id, list_id, text, created_at) VALUES ('li_1', 'lst_1', 'milk', '${Z}');
		INSERT INTO people (id, owner_id, name) VALUES ('per_1', 'usr_a', 'Auntie');
		INSERT INTO ideas (id, owner_id, channel, stage, text, created_at) VALUES ('idea_1', 'usr_a', 'youtube', 'idea', 'a video', '${Z}');
		INSERT INTO goals (id, owner_id, period, text) VALUES ('goal_1', 'usr_a', '2026-Q4', 'Ship v4');
		INSERT INTO places (id, owner_id, name, city) VALUES ('place_1', 'usr_a', 'Kopitiam', 'Kuching');
		INSERT INTO workout_split (id, owner_id, weekday, exercise, sort) VALUES ('ws_1', 'usr_a', 1, 'Squat', 0);
		INSERT INTO workout_logs (id, owner_id, date, exercise, created_at) VALUES ('wl_1', 'usr_a', '2026-11-01', 'Squat', '${Z}');
		INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, rel_value, rel_unit, at_time, due_at, status, attempts, last_error, claimed_at, sent_at, seen_at, created_at, updated_at) VALUES
			('rem_a', 'usr_a', 'planner_item', 'itm_1', 'relative', 2, 'hour', NULL, '2026-11-06T04:00:00Z', 'scheduled', 0, NULL, NULL, NULL, NULL, '${Z}', '${Z}'),
			('rem_b', 'usr_a', 'planner_block', 'blk_1', 'absolute', NULL, NULL, '2026-11-06T06:00:00Z', '2026-11-06T06:00:00Z', 'sent', 1, NULL, '${Z}', '${Z}', '${Z}', '${Z}', '${Z}'),
			('rem_c', 'usr_a', 'keep_note', 'note_1', 'relative', 1, 'day', NULL, NULL, 'failed', 3, 'smtp down', NULL, NULL, NULL, '${Z}', '${Z}'),
			('rem_d', 'usr_a', 'database_record', 'rec_1', 'absolute', NULL, NULL, '${Z}', '${Z}', 'processing', 1, NULL, '${Z}', NULL, NULL, '${Z}', '${Z}'),
			('rem_e', 'usr_b', 'planner_item', 'itm_3', 'relative', 15, 'minute', NULL, '2026-11-08T00:00:00Z', 'cancelled', 0, NULL, NULL, NULL, NULL, '${Z}', '${Z}'),
			('rem_f', 'usr_b', 'planner_block', 'blk_2', 'relative', 1, 'week', NULL, NULL, 'missed', 0, NULL, NULL, NULL, NULL, '${Z}', '${Z}'),
			('rem_g', 'usr_b', 'keep_note', 'note_2', 'absolute', NULL, NULL, '${Z}', NULL, 'cancelled', 0, NULL, NULL, NULL, NULL, '${Z}', '${Z}');
	`);
}

describe('C1 pages columns', () => {
	it('C1 the 0012 SQL adds exactly the two pages columns and nothing destructive to pages', () => {
		const h = at0011(seedV312);
		const beforeCols = cols(h, 'pages');
		const beforeFks = fks(h, 'pages');
		const beforeRows = all<Record<string, unknown>>(h, 'SELECT * FROM pages ORDER BY id');
		const indexSql = () =>
			Object.fromEntries(['pages_tree', 'pages_archived', 'pages_opened'].map((n) => [n, objectSql(h, n)]));
		const beforeIndexes = indexSql();

		migrateDb(h); // real folder: only 0012 is pending

		const afterCols = cols(h, 'pages');
		const added = afterCols.map((c) => c.name).filter((n) => !beforeCols.some((c) => c.name === n));
		expect(added).toEqual(['is_template', 'cover_attachment_id']);
		expect(afterCols).toHaveLength(beforeCols.length + 2);

		const template = afterCols.find((c) => c.name === 'is_template')!;
		expect(template.type.toUpperCase()).toBe('INTEGER');
		expect(template).toMatchObject({ notnull: 1, dflt_value: '0' });
		const cover = afterCols.find((c) => c.name === 'cover_attachment_id')!;
		expect(cover.type.toUpperCase()).toBe('TEXT');
		expect(cover).toMatchObject({ notnull: 0, dflt_value: null });

		// the REFERENCES clause on the new cover column, added on top of the four old pages FKs
		const coverFk = fks(h, 'pages').find((f) => f.from === 'cover_attachment_id')!;
		expect(coverFk).toMatchObject({ table: 'attachments', to: 'id', on_delete: 'SET NULL' });
		expect(fks(h, 'pages').filter((f) => f.from !== 'cover_attachment_id')).toEqual(beforeFks);

		// no copy: every old page keeps every old value, in the same order
		const afterRows = all<Record<string, unknown>>(h, 'SELECT * FROM pages ORDER BY id');
		const stripped = afterRows.map((r) => {
			const copy = { ...r };
			delete copy.is_template;
			delete copy.cover_attachment_id;
			return copy;
		});
		expect(stripped).toEqual(beforeRows);

		// its indexes and the title CHECK are untouched (same SQL, still enforced)
		expect(indexSql()).toEqual(beforeIndexes);
		expect(objectSql(h, 'pages')).toContain('pages_title_len');
		const addPage = (id: string, title: string) =>
			h.sqlite
				.prepare(
					`INSERT INTO pages (id, owner_id, title, position, created_at, updated_at) VALUES (?, 'usr_a', ?, 9, ?, ?)`,
				)
				.run(id, title, Z, Z);
		expect(() => addPage('pg_long', 'x'.repeat(301))).toThrow(/pages_title_len/);
		expect(() => addPage('pg_300', 'y'.repeat(300))).not.toThrow();

		// the file itself: only two statements mention pages, both ADD COLUMN, no DROP/RENAME/COPY
		const sql = statements('0012_v4_pages');
		const onPages = sql.filter((s) => /\bpages\b/.test(s));
		expect(onPages).toEqual([
			'ALTER TABLE pages ADD is_template INTEGER NOT NULL DEFAULT 0',
			'ALTER TABLE pages ADD cover_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL',
		]);
		expect(onPages.filter((s) => /(DROP|RENAME|INSERT|CREATE TABLE)/i.test(s))).toEqual([]);
	});
});

describe('C2 reminders rebuild', () => {
	it('C2 the same file rebuilds reminders with its 17 columns, owner FK, three CHECKs and both indexes', () => {
		const h = at0011();
		const before = {
			cols: cols(h, 'reminders'),
			fks: fks(h, 'reminders'),
			sql: objectSql(h, 'reminders'),
			indexes: Object.fromEntries(['reminders_due', 'reminders_source'].map((n) => [n, objectSql(h, n)])),
		};

		migrateDb(h);

		const after = {
			cols: cols(h, 'reminders'),
			fks: fks(h, 'reminders'),
			sql: objectSql(h, 'reminders'),
			indexes: Object.fromEntries(['reminders_due', 'reminders_source'].map((n) => [n, objectSql(h, n)])),
		};

		// same 17 columns, same order, same NOT NULL flags and defaults
		expect(after.cols).toHaveLength(17);
		expect(after.cols).toEqual(before.cols);
		expect(after.cols.map((c) => c.name)).toEqual([
			'id',
			'owner_id',
			'source_type',
			'source_id',
			'rule_kind',
			'rel_value',
			'rel_unit',
			'at_time',
			'due_at',
			'status',
			'attempts',
			'last_error',
			'claimed_at',
			'sent_at',
			'seen_at',
			'created_at',
			'updated_at',
		]);
		expect(after.cols.find((c) => c.name === 'attempts')).toMatchObject({ notnull: 1, dflt_value: '0' });

		// same single owner FK, users(id) ON DELETE CASCADE
		expect(after.fks).toEqual(before.fks);
		expect(after.fks).toEqual([
			expect.objectContaining({ table: 'users', from: 'owner_id', to: 'id', on_delete: 'CASCADE' }),
		]);

		// the source_type CHECK is the only widened one; the rule and status CHECKs are the same strings
		const sourceList = /CHECK\(source_type IN \(([^)]*)\)\)/.exec(after.sql)?.[1];
		expect(sourceList).toBe("'planner_item','planner_block','keep_note','database_record','page_todo'");
		expect(after.sql).toContain('CONSTRAINT "reminders_source_type"');
		expect(after.sql).toContain("CHECK(rule_kind IN ('relative','absolute'))");
		expect(after.sql).toContain(
			"CHECK(status IN ('scheduled','processing','sent','failed','cancelled','missed'))",
		);
		expect(before.sql).toContain("CHECK(rule_kind IN ('relative','absolute'))");
		expect(before.sql).toContain(
			"CHECK(status IN ('scheduled','processing','sent','failed','cancelled','missed'))",
		);

		// both indexes exist with the same names and SQL as before
		expect(after.indexes).toEqual(before.indexes);
		expect(Object.keys(after.indexes)).toEqual(['reminders_due', 'reminders_source']);

		// the file: CREATE reminders_new (17 columns) -> INSERT SELECT * -> DROP -> RENAME -> both indexes
		const sql = statements('0012_v4_pages');
		const create = sql.findIndex((s) => s.startsWith('CREATE TABLE reminders_new'));
		const insert = sql.indexOf('INSERT INTO reminders_new SELECT * FROM reminders');
		const drop = sql.indexOf('DROP TABLE reminders');
		const rename = sql.indexOf('ALTER TABLE reminders_new RENAME TO reminders');
		const due = sql.indexOf('CREATE INDEX reminders_due ON reminders (status,due_at)');
		const source = sql.indexOf('CREATE INDEX reminders_source ON reminders (source_type,source_id)');
		expect([create, insert, drop, rename, due, source].every((i) => i >= 0)).toBe(true);
		expect(create).toBeLessThan(insert);
		expect(insert).toBeLessThan(drop);
		expect(drop).toBeLessThan(rename);
		expect(rename).toBeLessThan(due);
		expect(rename).toBeLessThan(source);
		expect(
			migrationSql('0012_v4_pages')
				.split('--> statement-breakpoint')
				.map((s) => s.trim())
				.find((s) => s.startsWith('CREATE TABLE `reminders_new`'))!
				.split('\n')
				.filter((l) => /^\s*`[a-z_]+`/.test(l)),
		).toHaveLength(17);
		expect(tableNames(h)).not.toContain('reminders_new');
	});
});

describe('C2 one transaction', () => {
	it('C2 a failing 0012 rolls the whole file back: no half pages columns, old reminders CHECK', () => {
		const h = fresh();
		migrateDb(h, migrationsUpTo(11));
		const tampered = migrationsUpTo(12, (tag, sql) =>
			tag === '0012_v4_pages' ? `${sql}\n--> statement-breakpoint\nSELECT * FROM missing_after_0012;` : sql,
		);
		expect(() => migrateDb(h, tampered)).toThrow(/missing_after_0012/);
		expect(cols(h, 'pages').map((c) => c.name)).not.toContain('is_template');
		expect(objectSql(h, 'reminders')).not.toContain('page_todo');
		// the rollback leaves nothing pending: the real folder still applies 0012 cleanly
		migrateDb(h);
		expect(cols(h, 'pages').map((c) => c.name)).toContain('is_template');
		expect(objectSql(h, 'reminders')).toContain('page_todo');
	});
});

describe('C3 reminders data', () => {
	it('C3 every pre-existing reminder keeps id, status, times, attempts, owner and the two indexes', () => {
		const h = at0011(seedV312);
		const query = `SELECT id, status, due_at, at_time, attempts, sent_at, claimed_at, owner_id FROM reminders ORDER BY id`;
		const before = all<Record<string, unknown>>(h, query);
		expect(before).toHaveLength(7);
		const beforeIndexes = Object.fromEntries(
			['reminders_due', 'reminders_source'].map((n) => [n, objectSql(h, n)]),
		);

		migrateDb(h);

		expect(all<Record<string, unknown>>(h, query)).toEqual(before);
		expect(count(h, 'reminders')).toBe(before.length);
		expect(
			Object.fromEntries(['reminders_due', 'reminders_source'].map((n) => [n, objectSql(h, n)])),
		).toEqual(beforeIndexes);
	});
});

describe('C4 schema, snapshot and journal', () => {
	it('C4 schema.ts, 0012_snapshot.json and _journal.json agree on the new state (idx 12)', () => {
		const pageCfg = getTableConfig(pages);
		const template = pageCfg.columns.find((c) => c.name === 'is_template')!;
		expect(template).toMatchObject({ notNull: true, hasDefault: true, default: false, dataType: 'boolean' });
		const cover = pageCfg.columns.find((c) => c.name === 'cover_attachment_id')!;
		expect(cover).toMatchObject({ notNull: false, dataType: 'string' });
		const coverFk = pageCfg.foreignKeys.find(
			(f) => f.getName() === 'pages_cover_attachment_id_attachments_id_fk',
		)!;
		const ref = coverFk.reference();
		expect(ref.columns.map((c) => c.name)).toEqual(['cover_attachment_id']);
		expect(ref.foreignTable).toBe(attachments);
		expect(ref.foreignColumns.map((c) => c.name)).toEqual(['id']);
		expect(coverFk.onDelete).toBe('set null');

		const reminderCfg = getTableConfig(reminders);
		expect(reminderCfg.columns).toHaveLength(17);
		expect(reminderCfg.columns.find((c) => c.name === 'source_type')!.enumValues).toEqual([
			'planner_item',
			'planner_block',
			'keep_note',
			'database_record',
			'page_todo',
		]);
		expect(REMINDER_SOURCES).toEqual([
			'planner_item',
			'planner_block',
			'keep_note',
			'database_record',
			'page_todo',
		]);

		const snap = JSON.parse(metaFile('0012_snapshot.json')) as Snapshot;
		expect(snap.dialect).toBe('sqlite');
		expect(snap.tables.pages?.columns.is_template).toMatchObject({
			type: 'integer',
			notNull: true,
			default: false,
		});
		expect(snap.tables.pages?.columns.cover_attachment_id).toMatchObject({ type: 'text', notNull: false });
		const snapFk = Object.values(snap.tables.pages?.foreignKeys ?? {}).find((f) =>
			f.columnsFrom.includes('cover_attachment_id'),
		)!;
		expect(snapFk).toMatchObject({ tableTo: 'attachments', columnsTo: ['id'], onDelete: 'set null' });
		expect(Object.keys(snap.tables.pages!.columns).sort()).toEqual(pageCfg.columns.map((c) => c.name).sort());
		expect(Object.keys(snap.tables.reminders!.columns)).toEqual(reminderCfg.columns.map((c) => c.name));
		expect(snap.tables.reminders?.checkConstraints?.reminders_source_type?.value).toContain("'page_todo'");

		const prev = JSON.parse(metaFile('0011_snapshot.json')) as { id: string };
		expect(snap.prevId).toBe(prev.id);

		const j = journal();
		const last = j.entries[j.entries.length - 1]!;
		expect(j.entries.filter((e) => e.idx === 12)).toHaveLength(1);
		expect(last.idx).toBe(12);
		expect(last.tag).toBe('0012_v4_pages');
		expect(last.when).toBeGreaterThan(j.entries[j.entries.length - 2]!.when);
		expect(existsSync(join(REAL, '0012_v4_pages.sql'))).toBe(true);
	});
});

describe('C5 Source union', () => {
	it('C5 Source gains page_todo as a type-only change and sourceInfo still resolves nothing for it', () => {
		// a type-only change is not visible to vitest, so check the union text at runtime...
		const text = readFileSync(resolve('src/lib/server/reminders.ts'), 'utf8');
		expect(text).toMatch(/export type Source =[^;]*'page_todo'/);
		// ...and this line is checked by `npm run check` (svelte-check), not by the assertion itself
		const typed: Source = 'page_todo';
		expect(typed).toBe('page_todo');

		const h = upgraded(seedV312);
		expect(h.sqlite.prepare(`SELECT 1 FROM pages WHERE id = 'pg_1'`).get()).toBeDefined();
		expect(sourceInfo('usr_a', 'page_todo', 'pg_1')).toBeUndefined();
		expect(sourceInfo('usr_a', 'page_todo', 'does-not-exist')).toBeUndefined();
	});
});

describe('C6 empty DB', () => {
	it('C6 migrateDb runs 0000-0012 clean, and a second run changes nothing', () => {
		const h = fresh();
		migrateDb(h);
		expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);

		const j = journal();
		const applied = one<{ n: number; last: number }>(
			h,
			'SELECT count(*) AS n, max(created_at) AS last FROM __drizzle_migrations',
		);
		expect(applied.n).toBe(j.entries.length);
		expect(Number(applied.last)).toBe(j.entries[j.entries.length - 1]!.when);

		const first = { rows: dbSnapshot(h), objects: Object.keys(schemaObjects(h)).sort() };
		migrateDb(h);
		expect({ rows: dbSnapshot(h), objects: Object.keys(schemaObjects(h)).sort() }).toEqual(first);
		expect(one<{ n: number }>(h, 'SELECT count(*) AS n FROM __drizzle_migrations').n).toBe(applied.n);
	});
});

describe('C7 v3.1.2 seed upgrade', () => {
	it('C7 the upgraded seed keeps every table count and id, reminders included', () => {
		const h = at0011(seedV312);
		const before = dbSnapshot(h);
		expect(before.reminders).toMatchObject({ count: 7 });

		migrateDb(h);

		const after = dbSnapshot(h);
		const changed = Object.keys(before).filter((t) => {
			const now = after[t];
			return !now || now.count !== before[t]!.count || now.ids !== before[t]!.ids;
		});
		expect(changed).toEqual([]);
		expect(after.reminders).toMatchObject({ count: 7, ids: before.reminders!.ids });
		expect(all<{ id: string }>(h, 'SELECT id FROM reminders ORDER BY id').map((r) => r.id)).toEqual([
			'rem_a',
			'rem_b',
			'rem_c',
			'rem_d',
			'rem_e',
			'rem_f',
			'rem_g',
		]);
		expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);

		const once = dbSnapshot(h);
		migrateDb(h);
		expect(dbSnapshot(h)).toEqual(once);
	});
});

describe('C8 live constraints', () => {
	it('C8 page_todo reminders insert, bogus source/rule/status are refused, pages read 0 and NULL', () => {
		const h = upgraded(seedV312);
		const add = (id: string, sourceType: string, rule: string, status: string) =>
			h.sqlite
				.prepare(
					`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, at_time, due_at, status, created_at, updated_at)
					 VALUES (?, 'usr_a', ?, 'src_1', ?, ?, ?, ?, ?, ?)`,
				)
				.run(id, sourceType, rule, Z, Z, status, Z, Z);

		expect(() => add('rem_page', 'page_todo', 'absolute', 'scheduled')).not.toThrow();
		expect(
			one<{ source_type: string }>(h, `SELECT source_type FROM reminders WHERE id = 'rem_page'`).source_type,
		).toBe('page_todo');
		expect(() => add('rem_bogus', 'bogus', 'absolute', 'scheduled')).toThrow(/reminders_source_type/);
		expect(() => add('rem_rule', 'planner_item', 'sometimes', 'scheduled')).toThrow(/reminders_rule/);
		expect(() => add('rem_status', 'planner_item', 'absolute', 'done')).toThrow(/reminders_status/);

		const allPages = all<{ is_template: number; cover_attachment_id: string | null }>(
			h,
			'SELECT is_template, cover_attachment_id FROM pages',
		);
		expect(allPages).toHaveLength(3);
		expect(allPages.every((p) => p.is_template === 0 && p.cover_attachment_id === null)).toBe(true);
	});
});

describe('C9 cover FK', () => {
	it('C9 a real attachment id sticks, a hard delete sets NULL, a soft delete leaves it', () => {
		const h = upgraded(seedV312);
		const setCover = (id: string | null) =>
			h.sqlite.prepare(`UPDATE pages SET cover_attachment_id = ? WHERE id = 'pg_1'`).run(id);
		const cover = () =>
			one<{ cover_attachment_id: string | null }>(
				h,
				`SELECT cover_attachment_id FROM pages WHERE id = 'pg_1'`,
			).cover_attachment_id;

		expect(() => setCover('att_1')).not.toThrow();
		expect(cover()).toBe('att_1');
		expect(() => setCover('not_an_attachment')).toThrow(/FOREIGN KEY/);
		expect(cover()).toBe('att_1');

		// attachments.gc hard-deletes rows (attachments.ts:199-202): the page's cover goes NULL
		h.sqlite.prepare(`DELETE FROM attachments WHERE id = 'att_1'`).run();
		expect(cover()).toBeNull();

		// a soft-deleted attachment keeps the value
		expect(() => setCover('att_2')).not.toThrow();
		h.sqlite.prepare(`UPDATE attachments SET deleted_at = ? WHERE id = 'att_2'`).run(Z);
		expect(cover()).toBe('att_2');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
	});
});

describe('C10 untouched', () => {
	it('C10 items_source, dormant v1 tables + dormant.ts, page child FKs, push and undo stay as they were', () => {
		const h = at0011(seedV312);
		const before = schemaObjects(h);

		migrateDb(h);

		const after = schemaObjects(h);
		const changed = Object.keys(before)
			.filter((n) => after[n] !== before[n])
			.sort();
		expect(changed).toEqual(['pages', 'reminders']);

		// items_source still only accepts 'notion'
		const addItem = (id: string, source: string) =>
			h.sqlite
				.prepare(
					`INSERT INTO items (id, calendar_id, title, source, created_at, updated_at) VALUES (?, 'cal_a', 'x', ?, ?, ?)`,
				)
				.run(id, source, Z, Z);
		expect(() => addItem('itm_bad', 'gcal')).toThrow(/items_source/);
		expect(() => addItem('itm_notion', 'notion')).not.toThrow();

		// the v1 dormant tables are still there, and dormant.ts still reads them after 0012
		const names = tableNames(h);
		for (const t of [
			'lists',
			'list_items',
			'people',
			'person_facts',
			'ideas',
			'places',
			'goals',
			'workout_split',
			'workout_logs',
		])
			expect(names).toContain(t);
		expect(dormantPending('usr_a')).toEqual({
			lists: 1,
			people: 1,
			ideas: 1,
			places: 1,
			goals: 1,
			workouts: 2,
		});
		expect(existsSync(resolve('src/lib/server/dormant.ts'))).toBe(true);

		// page blocks/links/shortcuts still cascade with their page
		const onPage = (table: string, from: string) =>
			fks(h, table).find((f) => f.from === from && f.table === 'pages');
		expect(onPage('page_blocks', 'page_id')?.on_delete).toBe('CASCADE');
		expect(onPage('page_links', 'source_page_id')?.on_delete).toBe('CASCADE');
		expect(onPage('page_links', 'target_page_id')?.on_delete).toBe('CASCADE');
		expect(onPage('page_shortcuts', 'page_id')?.on_delete).toBe('CASCADE');
		expect([count(h, 'page_blocks'), count(h, 'page_links'), count(h, 'page_shortcuts')]).toEqual([2, 1, 1]);
		h.sqlite.prepare(`DELETE FROM pages WHERE id = 'pg_1'`).run();
		expect([count(h, 'page_blocks'), count(h, 'page_links'), count(h, 'page_shortcuts')]).toEqual([0, 0, 0]);

		// push_subscriptions and undo_actions are byte-identical and still hold their rows
		expect(after.push_subscriptions).toBe(before.push_subscriptions);
		expect(after.undo_actions).toBe(before.undo_actions);
		expect(count(h, 'push_subscriptions')).toBe(1);
		expect(count(h, 'undo_actions')).toBe(1);
	});
});
