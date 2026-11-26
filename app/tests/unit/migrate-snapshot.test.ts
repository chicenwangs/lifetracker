// Migrations on a copy of real (anonymised) data. Snapshot is gitignored: make it with
//   node scripts/anonymise-db.mjs ../data/app.db ../data/snapshot/anon.db
// No snapshot (CI, fresh clone) = skipped. Every phase with a migration must run this locally.
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { migrateDb, openDb } from '../../src/lib/server/db';

const SNAP = resolve(process.env.LT_SNAPSHOT ?? '../data/snapshot/anon.db');
/** tables that exist in v1.1.0: rows must survive every later migration */
const V1_TABLES = ['users', 'calendars', 'items', 'blocks', 'grants', 'share_keys', 'invites', 'app_meta'];

it.skipIf(!existsSync(SNAP))('migrations keep every v1 row and leave a sound DB', () => {
	const dir = mkdtempSync(join(tmpdir(), 'lt-snap-'));
	const path = join(dir, 'app.db');
	copyFileSync(SNAP, path);
	const h = openDb(path);
	try {
		const count = (t: string) =>
			(h.sqlite.prepare(`SELECT count(*) AS c FROM ${t}`).get() as { c: number }).c;
		const before = V1_TABLES.map(count);
		const linkedBefore = (
			h.sqlite.prepare('SELECT count(*) AS c FROM blocks WHERE item_id IS NOT NULL').get() as { c: number }
		).c;
		// v4.0 migration 0012: the reminders table is rebuilt (page_todo source); ids and statuses must survive
		const owner = (h.sqlite.prepare('SELECT id FROM users LIMIT 1').get() as { id: string }).id;
		const addRem = h.sqlite.prepare(
			`INSERT INTO reminders (id, owner_id, source_type, source_id, rule_kind, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 'absolute', ?, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
		);
		addRem.run('rem_snap_1', owner, 'planner_item', 'itm_x', 'scheduled');
		addRem.run('rem_snap_2', owner, 'keep_note', 'kn_x', 'sent');
		const remColumns = 'id, owner_id, source_type, source_id, status, attempts';
		const remBefore = h.sqlite.prepare(`SELECT ${remColumns} FROM reminders ORDER BY id`).all();
		migrateDb(h);
		expect(h.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(h.sqlite.pragma('foreign_key_check')).toEqual([]);
		expect(V1_TABLES.map(count)).toEqual(before);
		expect(h.sqlite.prepare(`SELECT ${remColumns} FROM reminders ORDER BY id`).all()).toEqual(remBefore);
		expect(
			(h.sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name IN ('reminders_due','reminders_source')`).all() as { name: string }[]).map((r) => r.name).sort(), // prettier-ignore
		).toEqual(['reminders_due', 'reminders_source']);
		// v2: block -> item links survive the items table rebuild; every user got the 5 built-in types
		const linked = h.sqlite.prepare('SELECT count(*) AS c FROM blocks WHERE item_id IS NOT NULL').get() as {
			c: number;
		};
		expect(linked.c).toBe(linkedBefore);
		const types = h.sqlite.prepare('SELECT count(*) AS c FROM item_types').get() as { c: number };
		expect(types.c).toBe(count('users') * 5);
	} finally {
		h.sqlite.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
