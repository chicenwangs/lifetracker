// P9 migration rehearsal (PHASES P9, DESIGN §21 "Migration"). Builds a real v1.1.0 database from the v1 migrations
// (0000-0002, unchanged since main), fills it with v1-shaped data, then runs every v2 migration on it like the server
// does on boot. Checks: integrity + FKs, every v1 row + column byte-identical, v2 defaults right, new features work on
// old data, and a backup taken after the upgrade restores to the same thing.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { migrateDb, openDb, setHandle } from '../../src/lib/server/db';
import { initEnv } from '../../src/lib/server/env';
import * as pages from '../../src/lib/server/repo/pages';
import * as keep from '../../src/lib/server/repo/keep';
import { importDormant } from '../../src/lib/server/dormant';
import { TEST_SECRET } from './helpers';

const SRC = resolve('drizzle');
const dir = mkdtempSync(join(tmpdir(), 'lt-rehearsal-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** a migrations folder holding only what v1.1.0 shipped */
function v1Folder(): string {
	const f = join(dir, 'v1');
	mkdirSync(join(f, 'meta'), { recursive: true });
	const journal = JSON.parse(readText(join(SRC, 'meta/_journal.json'))) as { entries: { tag: string }[] };
	journal.entries = journal.entries.slice(0, 3);
	expect(journal.entries.map((e) => e.tag)).toEqual(['0000_init', '0001_fts', '0002_prefs']);
	writeFileSync(join(f, 'meta/_journal.json'), JSON.stringify(journal));
	for (const e of journal.entries) copyFileSync(join(SRC, `${e.tag}.sql`), join(f, `${e.tag}.sql`));
	return f;
}
const readText = (p: string) => readFileSync(p, 'utf8');

const V1 = `
INSERT INTO users (id, username, display_name, password_hash, role, color, timezone, overlap_on, created_at, theme) VALUES
 ('usr_j', 'jeremy', 'Jeremy', 'hash1', 'admin', '#1C1917', 'Asia/Kuala_Lumpur', 1, '2026-01-02T03:04:05Z', 'light'),
 ('usr_n', 'Neina', 'Neina', 'hash2', 'member', '#7C3AED', 'Europe/London', 0, '2026-02-03T04:05:06Z', 'dark');
INSERT INTO calendars (id, owner_id, name, is_default, created_at) VALUES
 ('cal_j', 'usr_j', 'Jeremy', 1, '2026-01-02T03:04:05Z'), ('cal_n', 'usr_n', 'Neina', 1, '2026-02-03T04:05:06Z');
INSERT INTO items (id, calendar_id, title, type, status, date, time, end_date, notes, private, created_at, updated_at, deleted_at, deleted_batch) VALUES
 ('itm_1', 'cal_j', 'DS final exam', 'Exam', 'todo', '2026-12-10', '09:30', NULL, 'bring calculator', 0, '2026-11-01T01:00:00Z', '2026-11-02T01:00:00Z', NULL, NULL),
 ('itm_2', 'cal_j', 'Penang trip', 'Event', 'doing', '2026-12-20', NULL, '2026-12-23', NULL, 0, '2026-11-01T01:00:00Z', '2026-11-01T01:00:00Z', NULL, NULL),
 ('itm_3', 'cal_j', 'Renew road tax', NULL, 'done', '2026-11-15', NULL, NULL, NULL, 1, '2026-11-01T01:00:00Z', '2026-11-01T01:00:00Z', NULL, NULL),
 ('itm_4', 'cal_j', 'Old thing', 'Work', 'todo', '2026-10-01', NULL, NULL, NULL, 0, '2026-10-01T01:00:00Z', '2026-10-01T01:00:00Z', '2026-11-10T01:00:00Z', 'bat_1'),
 ('itm_5', 'cal_n', 'Date night', 'Dating', 'todo', '2026-12-12', '19:00', NULL, NULL, 0, '2026-11-01T01:00:00Z', '2026-11-01T01:00:00Z', NULL, NULL);
INSERT INTO blocks (id, calendar_id, item_id, label, type, start_at, end_at, status, created_at, updated_at) VALUES
 ('blk_1', 'cal_j', 'itm_1', 'Revise DS', 'Exam', '2026-12-09T01:00:00Z', '2026-12-09T03:00:00Z', 'todo', '2026-11-01T01:00:00Z', '2026-11-01T01:00:00Z'),
 ('blk_2', 'cal_j', NULL, 'Gym', 'Hobby', '2026-12-09T10:00:00Z', '2026-12-09T11:00:00Z', 'done', '2026-11-01T01:00:00Z', '2026-11-01T01:00:00Z'),
 ('blk_3', 'cal_n', 'itm_5', 'Get ready', NULL, '2026-12-12T18:00:00Z', '2026-12-12T19:00:00Z', 'todo', '2026-11-01T01:00:00Z', '2026-11-01T01:00:00Z');
INSERT INTO grants (id, calendar_id, grantee_id, permission, visible_types, hidden_as, in_overlap, created_at) VALUES
 ('gr_1', 'cal_j', 'usr_n', 'view', '["Event","Dating","Blocks"]', 'busy', 1, '2026-11-01T01:00:00Z');
INSERT INTO share_keys (id, calendar_id, created_by, key_hash, permission, visible_types, hidden_as, expires_at, created_at) VALUES
 ('shk_1', 'cal_n', 'usr_n', 'khash', 'view', '["None"]', 'none', '2026-11-20T01:00:00Z', '2026-11-13T01:00:00Z');
INSERT INTO sessions (id, user_id, remember, expires_at, absolute_expires_at, created_at, last_seen_at) VALUES
 ('ses_1', 'usr_j', 1, '2026-12-13T01:00:00Z', '2027-01-13T01:00:00Z', '2026-11-13T01:00:00Z', '2026-11-13T01:00:00Z');
INSERT INTO lists (id, owner_id, name) VALUES ('lst_1', 'usr_j', 'Packing');
INSERT INTO list_items (id, list_id, text, done, created_at) VALUES ('li_1', 'lst_1', 'Passport', 1, '2026-01-01T00:00:00Z');
INSERT INTO ideas (id, owner_id, channel, stage, text, created_at) VALUES ('ide_1', 'usr_j', 'yt', 'idea', 'vlog', '2026-01-01T00:00:00Z');
`;
const V1_TABLES = ['users', 'calendars', 'items', 'blocks', 'grants', 'share_keys', 'sessions', 'lists', 'list_items', 'ideas', 'app_meta']; // prettier-ignore

it('v1.1.0 -> v2: every v1 row intact, v2 defaults right, new features work, backup restores', async () => {
	initEnv({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', ORIGIN: 'http://localhost:5173', APP_SECRET: TEST_SECRET, SETUP_TOKEN: 'setup-token-123-long-enough', UPLOAD_DIR: join(dir, 'up') }); // prettier-ignore
	const path = join(dir, 'app.db');
	const h = openDb(path);
	migrateDb(h, v1Folder());
	h.sqlite.exec(V1);

	// snapshot every v1 column of every v1 row
	const cols = (t: string) => (h.sqlite.pragma(`table_info(${t})`) as { name: string }[]).map((c) => c.name);
	const v1Cols = Object.fromEntries(V1_TABLES.map((t) => [t, cols(t)]));
	const dump = (t: string) => h.sqlite.prepare(`SELECT ${v1Cols[t]?.map((c) => `"${c}"`).join(', ')} FROM ${t} ORDER BY 1`).all(); // prettier-ignore
	const before = Object.fromEntries(V1_TABLES.map((t) => [t, dump(t)]));
	expect([before.users, before.items, before.blocks, before.grants].map((r) => r?.length)).toEqual([
		2, 5, 3, 1,
	]);

	migrateDb(h); // all migrations, exactly like boot
	expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
	expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
	for (const t of V1_TABLES) {
		expect(cols(t), `${t}: a v1 column went missing`).toEqual(expect.arrayContaining(v1Cols[t] as string[]));
		expect(dump(t), `${t}: rows changed`).toEqual(before[t]); // dates, instants, types, links byte-identical
	}

	// v2 defaults on old accounts (DESIGN §5): look kept, no tour, 5 built-in types mapped 1:1 to v1 values
	const u = h.sqlite.prepare(`SELECT username, theme, theme_mode, tour_state FROM users ORDER BY id`).all();
	expect(u).toEqual([
		{ username: 'jeremy', theme: 'light', theme_mode: 'light', tour_state: 'done' },
		{ username: 'Neina', theme: 'dark', theme_mode: 'dark', tour_state: 'done' },
	]);
	const keys = h.sqlite.prepare(`SELECT key FROM item_types WHERE owner_id = 'usr_j' ORDER BY key`).all() as { key: string }[]; // prettier-ignore
	expect(keys.map((k) => k.key)).toEqual(['Dating', 'Event', 'Exam', 'Hobby', 'Work']);

	// new features on old data
	setHandle(h);
	const p = pages.create('usr_j', { parentId: null, title: 'First page' });
	expect(pages.get('usr_j', p.id).title).toBe('First page');
	expect(keep.create('usr_n', { title: 'note' }).title).toBe('note');
	expect(importDormant('usr_j').notes).toBe(2); // D-22: Packing + Ideas · yt
	expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');

	// backup drill: online backup of the upgraded DB restores to identical v1 rows + new rows
	const bak = join(dir, 'backup.db');
	await h.sqlite.backup(bak);
	const r = openDb(bak);
	try {
		expect(r.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		for (const t of [...V1_TABLES, 'pages', 'keep_notes', 'item_types'])
			expect(r.sqlite.prepare(`SELECT * FROM ${t} ORDER BY 1`).all(), t).toEqual(h.sqlite.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()); // prettier-ignore
	} finally {
		r.sqlite.close();
		h.sqlite.close();
	}
});
