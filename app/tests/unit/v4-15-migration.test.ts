// Card 15 (D-V4-09, D-V4-26): migration 0012 — two `pages` columns and one `reminders` rebuild that also
// accepts `page_todo`. ADD COLUMN only on pages, so its indexes and CHECK survive; the rebuild copies every
// reminder row as-is. The gate's migration-check runs the same upgrade on a real v3.1.2 seed x200.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { migrateDb, openDb, setHandle, type Handle } from '../../src/lib/server/db';
import { pages, REMINDER_SOURCES } from '../../src/lib/server/schema';
import { sourceInfo } from '../../src/lib/server/reminders';

const SRC = resolve('drizzle');
const SQL = readFileSync(join(SRC, '0012_v4_pages.sql'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'lt-mig0012-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const Z = '2026-11-28T00:00:00Z';
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
const ddl = (h: Handle, name: string) =>
	(h.sqlite.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(name) as { sql: string }).sql;

function migrated(): Handle {
	const h = openDb(':memory:');
	migrateDb(h);
	return h;
}
function seedBase(h: Handle) {
	h.sqlite.exec(`
		INSERT INTO users (id, username, display_name) VALUES ('usr_a', 'jeremy', 'Jeremy');
		INSERT INTO calendars (id, owner_id, name, is_default) VALUES ('cal_a', 'usr_a', 'Main', 1);
	`);
}
const addAttachment = (h: Handle, id: string) =>
	h.sqlite
		.prepare(
			`INSERT INTO attachments (id, owner_id, storage_key, original_name, mime_type, byte_size, status, created_at)
			 VALUES (?, 'usr_a', ?, 'cover.png', 'image/png', 12, 'ready', ?)`,
		)
		.run(id, `key-${id}`, Z);
const addPage = (h: Handle, id: string, over: Record<string, unknown> = {}) => {
	const row = { id, owner_id: 'usr_a', title: id, position: 0, created_at: Z, updated_at: Z, ...over };
	const names = Object.keys(row);
	h.sqlite
		.prepare(`INSERT INTO pages (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
		.run(...Object.values(row));
};
const addReminder = (h: Handle, over: Record<string, unknown> = {}) => {
	const row = {
		id: 'rem_x',
		owner_id: 'usr_a',
		source_type: 'planner_item',
		source_id: 'itm_1',
		rule_kind: 'relative',
		rel_value: 2,
		rel_unit: 'hour',
		at_time: null,
		due_at: '2026-11-30T07:00:00Z',
		status: 'scheduled',
		attempts: 0,
		last_error: null,
		claimed_at: null,
		sent_at: null,
		seen_at: null,
		created_at: Z,
		updated_at: Z,
		...over,
	};
	const names = Object.keys(row);
	h.sqlite
		.prepare(`INSERT INTO reminders (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
		.run(...Object.values(row));
};

/** drizzle splits on this marker; drop comment lines so each piece is one statement */
const statements = SQL.split('--> statement-breakpoint')
	.map((s) =>
		s
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith('--'))
			.join(' '),
	)
	.filter(Boolean);

// ---------- C1 / C2: the SQL file ----------
it('C1 the file adds exactly the two pages columns and leaves pages alone otherwise', () => {
	const pageAlters = statements.filter((s) => /^ALTER TABLE `pages` /i.test(s));
	expect(pageAlters).toEqual([
		'ALTER TABLE `pages` ADD `is_template` INTEGER NOT NULL DEFAULT 0;',
		'ALTER TABLE `pages` ADD `cover_attachment_id` TEXT REFERENCES attachments(id) ON DELETE SET NULL;',
	]);
	// no other statement touches pages, and pages is never dropped, renamed or copied
	expect(statements.filter((s) => /pages/i.test(s))).toEqual(pageAlters);
	expect(SQL).not.toMatch(/\bDROP\s+TABLE\s+`pages`|\bRENAME\s+TO\s+`pages`/i);
});

it('C2 the reminders rebuild keeps 17 columns, copies every row, then recreates both indexes', () => {
	expect(statements).toHaveLength(8);
	const create = statements[2]!;
	expect(create).toMatch(/^CREATE TABLE `reminders_new` \(/);
	expect(create.match(/`\w+` (?:text|integer)/g) ?? []).toHaveLength(17);
	expect(create).toContain(
		'FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade',
	);
	expect(create).toContain(
		"CONSTRAINT \"reminders_source_type\" CHECK(source_type IN ('planner_item','planner_block','keep_note','database_record','page_todo'))",
	);
	expect(create).toContain("CONSTRAINT \"reminders_rule\" CHECK(rule_kind IN ('relative','absolute'))");
	expect(create).toContain(
		"CONSTRAINT \"reminders_status\" CHECK(status IN ('scheduled','processing','sent','failed','cancelled','missed'))",
	);
	expect(statements[3]).toBe('INSERT INTO reminders_new SELECT * FROM reminders;');
	expect(statements[4]).toBe('DROP TABLE `reminders`;');
	expect(statements[5]).toBe('ALTER TABLE `reminders_new` RENAME TO `reminders`;');
	expect(statements[6]).toBe('CREATE INDEX `reminders_due` ON `reminders` (`status`,`due_at`);');
	expect(statements[7]).toBe('CREATE INDEX `reminders_source` ON `reminders` (`source_type`,`source_id`);');

	// the drizzle migrator wraps the whole file in one transaction; db.ts turns FKs off around it
	expect(SQL).not.toMatch(/\b(?:PRAGMA|BEGIN|COMMIT)\b/i);
});

// ---------- C3 / C7: rows survive the upgrade ----------
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
 ('usr_j', 'jeremy', 'Jeremy', 'h1', 'admin', 'Asia/Kuala_Lumpur', '2026-01-01T00:00:00Z', 'dark', 'auto', 'done', '1d');
INSERT INTO calendars (id, owner_id, name, is_default, created_at) VALUES
 ('cal_j', 'usr_j', 'Jeremy', 1, '2026-01-01T00:00:00Z');
INSERT INTO pages (id, owner_id, parent_page_id, title, icon, position, created_at, updated_at) VALUES
 ('pg_a', 'usr_j', NULL, 'Maths', 'book', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('pg_b', 'usr_j', 'pg_a', 'Week 1', NULL, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, rel_value, rel_unit, at_time, due_at, status, attempts, last_error, claimed_at, sent_at, seen_at, created_at, updated_at) VALUES
 ('rem_1', 'usr_j', 'planner_item', 'itm_1', 'relative', 2, 'hour', NULL, '2026-11-30T07:00:00Z', 'scheduled', 0, NULL, NULL, NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('rem_2', 'usr_j', 'planner_block', 'blk_1', 'relative', 15, 'minute', NULL, '2026-11-30T08:00:00Z', 'processing', 1, 'timeout', '2026-11-30T08:01:00Z', NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('rem_3', 'usr_j', 'keep_note', 'note_1', 'absolute', NULL, NULL, '2026-11-30T09:00:00Z', '2026-11-30T09:00:00Z', 'sent', 2, NULL, NULL, '2026-11-30T09:00:01Z', '2026-11-30T09:05:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('rem_4', 'usr_j', 'database_record', 'rec_1', 'relative', 1, 'day', NULL, '2026-12-01T00:00:00Z', 'failed', 3, 'push failed', NULL, NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('rem_5', 'usr_j', 'planner_item', 'itm_2', 'relative', 30, 'minute', NULL, '2026-12-01T01:00:00Z', 'cancelled', 0, NULL, NULL, NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('rem_6', 'usr_j', 'planner_item', 'itm_3', 'absolute', NULL, NULL, '2026-12-01T02:00:00Z', '2026-12-01T02:00:00Z', 'missed', 1, NULL, NULL, NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
`;
const REMINDER_COLS = [
	'id',
	'status',
	'due_at',
	'at_time',
	'attempts',
	'sent_at',
	'claimed_at',
	'owner_id',
	'source_type',
	'source_id',
];
const dumpReminders = (h: Handle) =>
	h.sqlite.prepare(`SELECT ${REMINDER_COLS.join(', ')} FROM reminders ORDER BY id`).all();

it('C3 the v3.1.2 upgrade keeps every reminder row, id and index exactly', () => {
	const h = openDb(join(tmp, 'v312.db'));
	try {
		migrateDb(h, v312Folder());
		expect(ddl(h, 'reminders')).not.toContain('page_todo'); // really pre-0012
		h.sqlite.exec(V312);
		// v3.1.2 shipped 0000-0010; 0011 then adds its columns before 0012 runs
		expect(h.sqlite.prepare('SELECT count(*) AS c FROM __drizzle_migrations').get()).toEqual({ c: 11 });
		const before = dumpReminders(h);
		const rowsBefore = h.sqlite.prepare('SELECT count(*) AS c FROM reminders').get();
		const indexSqlBefore = {
			reminders_due: ddl(h, 'reminders_due'),
			reminders_source: ddl(h, 'reminders_source'),
		};
		const pagesBefore = h.sqlite.prepare('SELECT id, title, icon, position FROM pages ORDER BY id').all();

		migrateDb(h);

		expect(h.sqlite.prepare('SELECT count(*) AS c FROM __drizzle_migrations').get()).toEqual({ c: 13 });
		expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
		expect(h.sqlite.prepare('SELECT count(*) AS c FROM reminders').get()).toEqual(rowsBefore);
		expect(dumpReminders(h)).toEqual(before);
		expect(h.sqlite.prepare('SELECT id, title, icon, position FROM pages ORDER BY id').all()).toEqual(
			pagesBefore,
		);
		expect({
			reminders_due: ddl(h, 'reminders_due'),
			reminders_source: ddl(h, 'reminders_source'),
		}).toEqual(indexSqlBefore);

		// a second run changes nothing
		migrateDb(h);
		expect(dumpReminders(h)).toEqual(before);
	} finally {
		h.sqlite.close();
	}
});

it('C7 every old page reads is_template = 0 and cover_attachment_id = NULL after the upgrade', () => {
	const h = openDb(join(tmp, 'v312-pages.db'));
	try {
		migrateDb(h, v312Folder());
		h.sqlite.exec(V312);
		migrateDb(h);
		expect(
			h.sqlite.prepare('SELECT id, is_template, cover_attachment_id FROM pages ORDER BY id').all(),
		).toEqual([
			{ id: 'pg_a', is_template: 0, cover_attachment_id: null },
			{ id: 'pg_b', is_template: 0, cover_attachment_id: null },
		]);
	} finally {
		h.sqlite.close();
	}
});

// ---------- C4 / C5: schema, snapshot, journal ----------
it('C4 schema.ts, snapshot 0012 and the journal agree on both columns and page_todo', () => {
	const s11 = JSON.parse(readFileSync(join(SRC, 'meta/0011_snapshot.json'), 'utf8')) as {
		id: string;
		tables: Record<string, { columns: Record<string, unknown>; checkConstraints: Record<string, unknown> }>;
	};
	const s12 = JSON.parse(readFileSync(join(SRC, 'meta/0012_snapshot.json'), 'utf8')) as typeof s11 & {
		prevId: string;
	};
	expect(s12.prevId).toBe(s11.id);
	expect(s12.tables.pages!.columns.is_template).toMatchObject({
		type: 'integer',
		notNull: true,
		default: false,
	});
	expect(s12.tables.pages!.columns.cover_attachment_id).toMatchObject({ type: 'text', notNull: false });
	const fks = s12.tables.pages as unknown as { foreignKeys: Record<string, unknown> };
	expect(fks.foreignKeys.pages_cover_attachment_id_attachments_id_fk).toEqual({
		name: 'pages_cover_attachment_id_attachments_id_fk',
		tableFrom: 'pages',
		tableTo: 'attachments',
		columnsFrom: ['cover_attachment_id'],
		columnsTo: ['id'],
		onDelete: 'set null',
		onUpdate: 'no action',
	});
	expect(s12.tables.reminders!.checkConstraints.reminders_source_type).toEqual({
		name: 'reminders_source_type',
		value: "source_type IN ('planner_item','planner_block','keep_note','database_record','page_todo')",
	});
	expect(s12.tables.reminders as unknown as { indexes: unknown }).toMatchObject({
		indexes: {
			reminders_due: { name: 'reminders_due', columns: ['status', 'due_at'], isUnique: false },
			reminders_source: { name: 'reminders_source', columns: ['source_type', 'source_id'], isUnique: false },
		},
	});

	const journal = JSON.parse(readFileSync(join(SRC, 'meta/_journal.json'), 'utf8')) as {
		entries: { idx: number; when: number; tag: string }[];
	};
	expect(journal.entries).toHaveLength(13);
	expect(journal.entries[12]).toMatchObject({ idx: 12, tag: '0012_v4_pages' });
	expect(journal.entries[12]!.when).toBeGreaterThan(journal.entries[11]!.when);

	const c = getTableColumns(pages);
	expect(c.isTemplate).toMatchObject({ name: 'is_template', notNull: true, default: false });
	expect(c.coverAttachmentId).toMatchObject({ name: 'cover_attachment_id', notNull: false });
});

it('C5 REMINDER_SOURCES includes page_todo and sourceInfo ignores it', () => {
	expect(REMINDER_SOURCES).toEqual([
		'planner_item',
		'planner_block',
		'keep_note',
		'database_record',
		'page_todo',
	]);
	// a real record with this id resolves as database_record; page_todo must not fall through to it
	const h = migrated();
	try {
		seedBase(h);
		addPage(h, 'pg_1');
		h.sqlite.exec(`
			INSERT INTO page_databases (id, owner_id, page_id, title, created_at, updated_at) VALUES ('pdb_1', 'usr_a', 'pg_1', 'Stuff', '${Z}', '${Z}');
			INSERT INTO database_records (id, database_id, page_id, position, created_at, updated_at) VALUES ('rec_1', 'pdb_1', NULL, 0, '${Z}', '${Z}');
			INSERT INTO database_properties (id, database_id, name, property_type, position, created_at, updated_at) VALUES ('dbp_1', 'pdb_1', 'Name', 'title', 0, '${Z}', '${Z}');
			INSERT INTO database_values (record_id, property_id, value_json, updated_at) VALUES ('rec_1', 'dbp_1', '"Secret row"', '${Z}');
		`);
		setHandle(h);
		expect(sourceInfo('usr_a', 'database_record', 'rec_1')).toMatchObject({
			title: 'Secret row',
			route: '/pages/pg_1',
			kind: 'pages',
		});
		expect(sourceInfo('usr_a', 'page_todo', 'rec_1')).toBeUndefined();
	} finally {
		h.sqlite.close();
	}
});

// ---------- C6: empty DB ----------
it('C6 migrateDb runs 0000-0012 on an empty DB and a second run changes nothing', () => {
	const h = migrated();
	try {
		expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
		const applied = () =>
			(h.sqlite.prepare('SELECT count(*) AS c FROM __drizzle_migrations').get() as { c: number }).c;
		expect(applied()).toBe(13);
		const shape = Object.fromEntries(tables(h).map((t) => [t, cols(h, t)]));
		migrateDb(h);
		expect(applied()).toBe(13);
		expect(Object.fromEntries(tables(h).map((t) => [t, cols(h, t)]))).toEqual(shape);
	} finally {
		h.sqlite.close();
	}
});

// ---------- C8: live constraints ----------
it('C8 page_todo inserts, bogus source types and bad rule/status values are still refused', () => {
	const h = migrated();
	try {
		seedBase(h);
		addReminder(h, { id: 'rem_ok', source_type: 'page_todo', source_id: 'pg_a:blk_1' });
		expect(() => addReminder(h, { id: 'rem_bad', source_type: 'bogus' })).toThrow(/CHECK/);
		expect(() => addReminder(h, { id: 'rem_rule', rule_kind: 'weekly' })).toThrow(/CHECK/);
		expect(() => addReminder(h, { id: 'rem_status', status: 'pending' })).toThrow(/CHECK/);
		expect(h.sqlite.prepare('SELECT source_type FROM reminders').all()).toEqual([
			{ source_type: 'page_todo' },
		]);
	} finally {
		h.sqlite.close();
	}
});

// ---------- C9: the cover FK ----------
it('C9 hard-deleting an attachment nulls the cover, a soft delete leaves it in place', () => {
	const h = migrated();
	try {
		seedBase(h);
		addAttachment(h, 'att_1');
		addAttachment(h, 'att_2');
		addPage(h, 'pg_1', { cover_attachment_id: 'att_1' });
		addPage(h, 'pg_2', { cover_attachment_id: 'att_2' });

		h.sqlite.prepare(`DELETE FROM attachments WHERE id = 'att_1'`).run();
		expect(h.sqlite.prepare(`SELECT cover_attachment_id FROM pages WHERE id = 'pg_1'`).get()).toEqual({
			cover_attachment_id: null,
		});

		h.sqlite.prepare(`UPDATE attachments SET deleted_at = ? WHERE id = 'att_2'`).run(Z);
		expect(h.sqlite.prepare(`SELECT cover_attachment_id FROM pages WHERE id = 'pg_2'`).get()).toEqual({
			cover_attachment_id: 'att_2',
		});
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
	} finally {
		h.sqlite.close();
	}
});

// ---------- C10: untouched on purpose ----------
it('C10 items_source, the dormant tables and the page child FKs are unchanged', () => {
	const h = migrated();
	try {
		seedBase(h);
		h.sqlite
			.prepare(
				`INSERT INTO items (id, calendar_id, title, created_at, updated_at) VALUES ('itm_1', 'cal_a', 'x', ?, ?)`,
			)
			.run(Z, Z);
		expect(() => h.sqlite.exec(`UPDATE items SET source = 'ics' WHERE id = 'itm_1'`)).toThrow(/CHECK/);
		h.sqlite.exec(`UPDATE items SET source = 'notion' WHERE id = 'itm_1'`);
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
			'push_subscriptions',
			'undo_actions',
		])
			expect(tables(h), t).toContain(t);
		for (const t of ['page_blocks', 'page_links', 'page_shortcuts']) {
			const fk = (h.sqlite.pragma(`foreign_key_list("${t}")`) as { table: string; on_delete: string }[]).find(
				(f) => f.table === 'pages',
			);
			expect(fk, `${t} -> pages`).toMatchObject({ table: 'pages', on_delete: 'CASCADE' });
		}
	} finally {
		h.sqlite.close();
	}
});
