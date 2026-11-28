// Card 08 (D-V4-09, D-V4-26): migration 0011 — the four v3.3 columns, the partial ics_uid index and the
// hand-written snapshot/journal. ADD COLUMN only, so every existing row keeps its old behaviour.
// The v3.1.2 seed here is built from migrations 0000-0010 (what v3.1.2 shipped) plus v3.1.2-shaped rows;
// the gate's migration-check runs the same upgrade on a real v3.1.2 seed.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { migrateDb, openDb, type Handle } from '../../src/lib/server/db';
import { itemTypes, items, users } from '../../src/lib/server/schema';

const SRC = resolve('drizzle');
const SQL = readFileSync(join(SRC, '0011_v33_columns.sql'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'lt-mig0011-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const Z = '2026-11-01T00:00:00Z';
type Col = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number };
const cols = (h: Handle, t: string) => h.sqlite.pragma(`table_info("${t}")`) as Col[];
const tables = (h: Handle) =>
	(
		h.sqlite
			.prepare(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'content_search%' AND name NOT LIKE '__drizzle%'`,
			)
			.all() as { name: string }[]
	).map((r) => r.name);
/** every table's row count + ids: what migration-check compares */
function snap(h: Handle): Record<string, { count: number; ids: string[] }> {
	const out: Record<string, { count: number; ids: string[] }> = {};
	for (const t of tables(h)) {
		const count = (h.sqlite.prepare(`SELECT count(*) AS c FROM "${t}"`).get() as { c: number }).c;
		const hasId = cols(h, t).some((c) => c.name === 'id');
		const ids = hasId
			? (h.sqlite.prepare(`SELECT id FROM "${t}" ORDER BY id`).all() as { id: string }[]).map((r) => r.id)
			: [];
		out[t] = { count, ids };
	}
	return out;
}
function migrated(): Handle {
	const h = openDb(':memory:');
	migrateDb(h);
	return h;
}
/** exactly one column of that name, so "no duplicate column" is checked too */
function col(h: Handle, t: string, name: string): Col {
	const found = cols(h, t).filter((c) => c.name === name);
	expect(found, `${t}.${name}`).toHaveLength(1);
	return found[0]!;
}
const addItem = (
	h: Handle,
	id: string,
	calendar: string,
	icsUid: string | null,
	deletedAt: string | null = null,
) =>
	h.sqlite
		.prepare(
			`INSERT INTO items (id, calendar_id, title, ics_uid, deleted_at, created_at, updated_at) VALUES (?, ?, 'x', ?, ?, ?, ?)`,
		)
		.run(id, calendar, icsUid, deletedAt, Z, Z);

// ---------- C1 / C2: the SQL file ----------
it('C1 migration 0011 is exactly four ADD COLUMN statements and nothing destructive', () => {
	// drizzle runs one statement per `--> statement-breakpoint`
	const statements = SQL.split('--> statement-breakpoint')
		.map((s) =>
			s
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l && !l.startsWith('--'))
				.join(' '),
		)
		.filter(Boolean);
	const alters = statements.filter((s) => /^ALTER TABLE /i.test(s));
	expect(alters).toHaveLength(4);
	// the index is the only other statement
	expect(statements.filter((s) => !/^ALTER TABLE /i.test(s))).toEqual([
		expect.stringMatching(/^CREATE UNIQUE INDEX /i),
	]);
	expect(SQL).not.toMatch(/\b(DROP|RENAME)\b/i);
	expect(SQL).not.toMatch(/CREATE TABLE/i);
	expect(SQL).not.toMatch(/INSERT\s+INTO[\s\S]*\bSELECT\b/i);

	const one = SQL.replace(/\s+/g, ' ');
	expect(one).toContain('ALTER TABLE `items` ADD `repeat_from_completion` INTEGER NOT NULL DEFAULT 0;');
	expect(one).toContain('ALTER TABLE `items` ADD `ics_uid` TEXT;');
	expect(one).toContain('ALTER TABLE `item_types` ADD `on_calendar` INTEGER NOT NULL DEFAULT 1;');
	expect(one).toContain(
		"ALTER TABLE `users` ADD `digest_time` TEXT DEFAULT NULL CHECK (digest_time IS NULL OR digest_time GLOB '[0-2][0-9]:[0-5][0-9]');",
	);
});

it('C1 the digest_time CHECK takes NULL or a loose HH:MM and rejects 7:30', () => {
	const h = migrated();
	try {
		h.sqlite.exec(`INSERT INTO users (id, username, display_name) VALUES ('u1', 'a', 'A')`);
		const set = (v: string | null) =>
			h.sqlite.prepare(`UPDATE users SET digest_time = ? WHERE id = 'u1'`).run(v);
		set(null);
		set('07:30');
		set('29:59'); // loose on purpose (D-V4-09): zTime guards writes
		expect(() => set('7:30')).toThrow(/CHECK/);
		expect(() => set('07:3')).toThrow(/CHECK/);
	} finally {
		h.sqlite.close();
	}
});

it('C2 the ics_uid index is unique, partial, and trashed rows do not block a re-import', () => {
	const h = migrated();
	try {
		h.sqlite.exec(`
			INSERT INTO users (id, username, display_name) VALUES ('u1', 'a', 'A');
			INSERT INTO calendars (id, owner_id, name, is_default) VALUES ('c1', 'u1', 'Mine', 1), ('c2', 'u1', 'Other', 0);
		`);
		const idx = (
			h.sqlite.pragma('index_list("items")') as { name: string; unique: number; partial: number }[]
		).find((i) => i.name === 'items_ics_uid');
		expect(idx).toMatchObject({ unique: 1, partial: 1 });
		const info = h.sqlite.pragma('index_info("items_ics_uid")') as { name: string }[];
		expect(info.map((c) => c.name)).toEqual(['calendar_id', 'ics_uid']);
		const ddl = (
			h.sqlite.prepare(`SELECT sql FROM sqlite_master WHERE name = 'items_ics_uid'`).get() as { sql: string }
		).sql.replace(/`/g, '');
		expect(ddl.replace(/\s+/g, ' ')).toContain(
			'ON items (calendar_id, ics_uid) WHERE ics_uid IS NOT NULL AND deleted_at IS NULL',
		);
		// nothing else was created by the second statement
		expect(
			h.sqlite.prepare(`SELECT count(*) AS c FROM sqlite_master WHERE name = 'items_ics_uid'`).get(),
		).toEqual({ c: 1 });

		addItem(h, 'i1', 'c1', 'event-1@example.com');
		expect(() => addItem(h, 'i2', 'c1', 'event-1@example.com')).toThrow(/UNIQUE/);
		addItem(h, 'i3', 'c2', 'event-1@example.com'); // same UID in another calendar is fine
		addItem(h, 'i4', 'c1', null); // unimported rows are not indexed
		addItem(h, 'i5', 'c1', null);
		// a trashed row does not block a fresh import of the same UID...
		addItem(h, 'i6', 'c1', 'event-2@example.com', Z);
		addItem(h, 'i7', 'c1', 'event-2@example.com');
		// ...and a trashed duplicate of a live UID is allowed
		addItem(h, 'i8', 'c1', 'event-1@example.com', Z);
	} finally {
		h.sqlite.close();
	}
});

// ---------- C3: schema mirror, snapshot, journal ----------
it('C3 schema.ts, the hand-written snapshot and the journal agree on all four columns', () => {
	const s10 = JSON.parse(readFileSync(join(SRC, 'meta/0010_snapshot.json'), 'utf8')) as {
		id: string;
		prevId: string;
		tables: Record<string, { columns: Record<string, unknown>; indexes: Record<string, unknown> }>;
	};
	const s11 = JSON.parse(readFileSync(join(SRC, 'meta/0011_snapshot.json'), 'utf8')) as typeof s10;
	expect(s11.prevId).toBe(s10.id);
	expect(s11.tables.items!.columns.repeat_from_completion).toMatchObject({
		type: 'integer',
		notNull: true,
		default: false,
	});
	expect(s11.tables.items!.columns.ics_uid).toMatchObject({ type: 'text', notNull: false });
	expect(s11.tables.item_types!.columns.on_calendar).toMatchObject({
		type: 'integer',
		notNull: true,
		default: true,
	});
	expect(s11.tables.users!.columns.digest_time).toMatchObject({ type: 'text', notNull: false });
	expect(s11.tables.items!.indexes.items_ics_uid).toEqual({
		name: 'items_ics_uid',
		columns: ['calendar_id', 'ics_uid'],
		isUnique: true,
		where: 'ics_uid IS NOT NULL AND deleted_at IS NULL',
	});

	const journal = JSON.parse(readFileSync(join(SRC, 'meta/_journal.json'), 'utf8')) as {
		entries: { idx: number; when: number; tag: string }[];
	};
	// 0011 is entry 11; later cards append entries without touching these four columns
	expect(journal.entries.slice(0, 12).map((e) => e.idx)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
	expect(journal.entries[11]).toMatchObject({ idx: 11, tag: '0011_v33_columns' });
	expect(journal.entries[11]!.when).toBeGreaterThan(journal.entries[10]!.when);

	// the drizzle declarations mirror the same defaults (types are checked by svelte-check)
	const c = getTableColumns(items);
	expect(c.repeatFromCompletion).toMatchObject({
		name: 'repeat_from_completion',
		notNull: true,
		default: false,
	});
	expect(c.icsUid).toMatchObject({ name: 'ics_uid', notNull: false });
	expect(getTableColumns(itemTypes).onCalendar).toMatchObject({
		name: 'on_calendar',
		notNull: true,
		default: true,
	});
	expect(getTableColumns(users).digestTime).toMatchObject({ name: 'digest_time', notNull: false });
});

// ---------- C4: empty DB, twice ----------
it('C4 migrateDb runs 0000-0011 on an empty DB and a second run changes nothing', () => {
	const h = migrated();
	try {
		expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
		const applied = () =>
			(h.sqlite.prepare('SELECT count(*) AS c FROM __drizzle_migrations').get() as { c: number }).c;
		const expected = (
			JSON.parse(readFileSync(join(SRC, 'meta/_journal.json'), 'utf8')) as { entries: unknown[] }
		).entries.length;
		expect(applied()).toBe(expected);
		const before = { tables: tables(h), snap: snap(h) };
		const shape = Object.fromEntries(before.tables.map((t) => [t, cols(h, t)]));
		migrateDb(h);
		expect(applied()).toBe(expected);
		expect(tables(h)).toEqual(before.tables);
		expect(Object.fromEntries(tables(h).map((t) => [t, cols(h, t)]))).toEqual(shape);
		expect(snap(h)).toEqual(before.snap);
		expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
	} finally {
		h.sqlite.close();
	}
});

// ---------- C5: v3.1.2 data keeps old behaviour ----------
function v312Folder(): string {
	const f = join(tmp, 'v312');
	mkdirSync(join(f, 'meta'), { recursive: true });
	const journal = JSON.parse(readFileSync(join(SRC, 'meta/_journal.json'), 'utf8')) as {
		entries: { tag: string }[];
	};
	journal.entries = journal.entries.slice(0, 11);
	expect(journal.entries.map((e) => e.tag)).toEqual([
		'0000_init',
		'0001_fts',
		'0002_prefs',
		'0003_v2_foundations',
		'0004_v2_keep',
		'0005_v2_pages',
		'0006_v2_databases',
		'0007_v2_reminders',
		'0008_v2_shares',
		'0009_v2_hints',
		'0010_v2_default_reminder',
	]);
	writeFileSync(join(f, 'meta/_journal.json'), JSON.stringify(journal));
	for (const e of journal.entries) copyFileSync(join(SRC, `${e.tag}.sql`), join(f, `${e.tag}.sql`));
	return f;
}

const V312 = `
INSERT INTO users (id, username, display_name, password_hash, role, timezone, created_at, theme, theme_mode, tour_state, default_reminder) VALUES
 ('usr_j', 'jeremy', 'Jeremy', 'h1', 'admin', 'Asia/Kuala_Lumpur', '2026-01-01T00:00:00Z', 'dark', 'auto', 'done', '1d'),
 ('usr_n', 'neina', 'Neina', 'h2', 'member', 'Europe/London', '2026-01-02T00:00:00Z', 'light', 'light', 'done', NULL);
INSERT INTO calendars (id, owner_id, name, is_default, created_at) VALUES
 ('cal_j', 'usr_j', 'Jeremy', 1, '2026-01-01T00:00:00Z'), ('cal_n', 'usr_n', 'Neina', 1, '2026-01-02T00:00:00Z');
INSERT INTO item_types (id, owner_id, key, name, bg, ink, slug, position, builtin, share_default, counts_down, is_default, created_at, updated_at) VALUES
 ('typ_w', 'usr_j', 'Work', 'Work', '#111111', '#ffffff', 'work', 0, 1, 0, 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('typ_e', 'usr_j', 'Exam', 'Exam', '#222222', '#ffffff', 'exam', 1, 1, 1, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO items (id, calendar_id, title, type, status, date, time, end_date, notes, private, rrule, exdates, created_at, updated_at, deleted_at, deleted_batch, source) VALUES
 ('itm_a', 'cal_j', 'Maths', 'Exam', 'todo', '2026-11-30', '09:00', NULL, 'chapter 4', 0, 'FREQ=WEEKLY;BYDAY=MO', '["2026-12-07"]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL, NULL),
 ('itm_b', 'cal_j', 'Water plants', NULL, 'doing', '2026-11-28', NULL, NULL, NULL, 0, 'FREQ=DAILY;INTERVAL=3', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL, NULL),
 ('itm_c', 'cal_n', 'Old row', 'Work', 'done', '2026-11-01', NULL, NULL, NULL, 0, NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-11-20T00:00:00Z', 'bat_1', NULL);
INSERT INTO blocks (id, calendar_id, item_id, label, type, start_at, end_at, status, created_at, updated_at) VALUES
 ('blk_a', 'cal_j', 'itm_a', 'Revise', 'Exam', '2026-11-30T01:00:00Z', '2026-11-30T02:00:00Z', 'todo', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO goals (id, owner_id, period, text, done, sort) VALUES ('go_1', 'usr_j', '2026-Q4', 'ship v4', 0, 0);
`;
const SEEDED = ['users', 'calendars', 'items', 'item_types', 'blocks', 'goals'];

it('C5 the v3.1.2 seed upgrades to the old behaviour with every old row and id intact', () => {
	const h = openDb(join(tmp, 'v312.db'));
	try {
		migrateDb(h, v312Folder());
		expect(cols(h, 'items').some((c) => c.name === 'ics_uid')).toBe(false); // really pre-0011
		h.sqlite.exec(V312);
		const oldCols = Object.fromEntries(SEEDED.map((t) => [t, cols(h, t).map((c) => c.name)]));
		const dump = (t: string) =>
			h.sqlite.prepare(`SELECT ${oldCols[t]!.map((c) => `"${c}"`).join(', ')} FROM "${t}" ORDER BY 1`).all();
		const beforeRows = Object.fromEntries(SEEDED.map((t) => [t, dump(t)]));
		const before = snap(h);

		migrateDb(h);

		expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
		expect(snap(h)).toEqual(before); // every old table: same rows, same ids
		for (const t of SEEDED) expect(dump(t), `${t}: old columns changed`).toEqual(beforeRows[t]);

		expect(
			h.sqlite.prepare('SELECT id, repeat_from_completion, ics_uid FROM items ORDER BY id').all(),
		).toEqual([
			{ id: 'itm_a', repeat_from_completion: 0, ics_uid: null },
			{ id: 'itm_b', repeat_from_completion: 0, ics_uid: null },
			{ id: 'itm_c', repeat_from_completion: 0, ics_uid: null },
		]);
		expect(h.sqlite.prepare('SELECT DISTINCT on_calendar FROM item_types').all()).toEqual([
			{ on_calendar: 1 },
		]);
		expect(h.sqlite.prepare('SELECT DISTINCT digest_time FROM users').all()).toEqual([{ digest_time: null }]);

		// idempotent on upgraded data too
		migrateDb(h);
		expect(snap(h)).toEqual(before);
	} finally {
		h.sqlite.close();
	}
});

// ---------- C6: untouched on purpose ----------
it('C6 items_source still allows only notion and the dormant tables are still there', () => {
	const h = migrated();
	try {
		h.sqlite.exec(`
			INSERT INTO users (id, username, display_name) VALUES ('u1', 'a', 'A');
			INSERT INTO calendars (id, owner_id, name, is_default) VALUES ('c1', 'u1', 'Mine', 1);
		`);
		addItem(h, 'i1', 'c1', 'event-1@example.com');
		expect(() => h.sqlite.exec(`UPDATE items SET source = 'ics' WHERE id = 'i1'`)).toThrow(/CHECK/);
		h.sqlite.exec(`UPDATE items SET source = 'notion' WHERE id = 'i1'`); // unchanged v1 import value
		for (const t of [
			'courses',
			'goals',
			'workout_split',
			'workout_logs',
			'lists',
			'people',
			'places',
			'ideas',
			'step_templates',
		])
			// prettier-ignore
			expect(tables(h), t).toContain(t);
	} finally {
		h.sqlite.close();
	}
});

// ---------- C7: PRAGMA shapes ----------
it('C7 every new column appears once in PRAGMA table_info with its default', () => {
	const h = migrated();
	try {
		expect(col(h, 'items', 'repeat_from_completion')).toMatchObject({
			type: 'INTEGER',
			notnull: 1,
			dflt_value: '0',
		});
		expect(col(h, 'items', 'ics_uid')).toMatchObject({ type: 'TEXT', notnull: 0, dflt_value: null });
		expect(col(h, 'item_types', 'on_calendar')).toMatchObject({
			type: 'INTEGER',
			notnull: 1,
			dflt_value: '1',
		});
		expect(col(h, 'users', 'digest_time')).toMatchObject({ type: 'TEXT', notnull: 0, dflt_value: 'NULL' });
	} finally {
		h.sqlite.close();
	}
});
