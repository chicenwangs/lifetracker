#!/usr/bin/env node
// Anonymised copy of a real DB, for migration tests (PHASES ground rules). Source is never changed.
//   cd app && node scripts/anonymise-db.mjs ../data/app.db ../data/snapshot/anon.db
// Keeps: row counts, ids, links, dates, enums, flags. Replaces: every other text cell. Drops: sessions, rate limits, search text.
// Unknown text columns are scrubbed by default, so a new table can't leak by being forgotten here.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

const [src, dest] = process.argv.slice(2);
if (!src || !dest || !existsSync(src)) {
	console.error('usage: node scripts/anonymise-db.mjs <source.db> <dest.db>');
	process.exit(1);
}

// columns whose text is structure, not content
const KEEP = new Set([
	...['id', 'key', 'value', 'kind', 'type', 'status', 'role', 'color', 'timezone', 'theme', 'plan_mode'],
	...['permission', 'hidden_as', 'visible_types', 'date', 'end_date', 'time', 'source', 'deleted_batch'],
	...[
		'rrule',
		'exdates',
		'stage',
		'category',
		'current_effort',
		'last_visited',
		'window_start',
		'period',
		'effort',
	],
]);
const keep = (c) => KEEP.has(c) || c.endsWith('_id') || c.endsWith('_at') || c.endsWith('_by');
const EMPTY = ['sessions', 'rate_limits'];

mkdirSync(dirname(dest), { recursive: true });
for (const f of [dest, `${dest}-wal`, `${dest}-shm`]) rmSync(f, { force: true });
const from = new Database(src, { readonly: true, fileMustExist: true });
await from.backup(dest);

const db = new Database(dest);
db.pragma('journal_mode = DELETE'); // one plain file, no -wal beside it
db.pragma('foreign_keys = OFF');
const tables = db
	.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
	.all()
	.map((r) => r.name)
	.filter(
		(t) => !t.startsWith('search_fts') && !t.startsWith('content_search') && t !== '__drizzle_migrations',
	);

const originals = new Set();
// any failure below must not leave a half-scrubbed copy of real data on disk
process.on('exit', (code) => {
	if (code === 0) return;
	try {
		db.close();
	} catch {
		/* already closed */
	}
	rmSync(dest, { force: true });
});
db.transaction(() => {
	for (const t of EMPTY) db.prepare(`DELETE FROM ${t}`).run();
	// search indexes hold copies of real text: empty them (the app rebuilds on use)
	for (const t of ['search_fts', 'content_search'])
		if (db.prepare(`SELECT 1 FROM sqlite_master WHERE name = ?`).get(t)) db.prepare(`DELETE FROM ${t}`).run();
	for (const t of tables) {
		for (const { name: c } of db.prepare(`PRAGMA table_info(${t})`).all()) {
			if (keep(c)) continue;
			const rows = db.prepare(`SELECT rowid AS r, "${c}" AS v FROM ${t} WHERE typeof("${c}") = 'text'`).all();
			const upd = db.prepare(`UPDATE ${t} SET "${c}" = ? WHERE rowid = ?`);
			for (const { r, v } of rows) {
				originals.add(v);
				// JSON stays JSON (arrays/objects emptied); the rest becomes "<column> <row>" (unique per row)
				upd.run(v.startsWith('[') ? '[]' : v.startsWith('{') ? '{}' : `${c} ${r}`, r);
			}
		}
	}
})();
db.pragma('foreign_keys = ON');
db.exec('VACUUM'); // old text must not survive in free pages
const bad = db.pragma('integrity_check', { simple: true });
const fk = db.pragma('foreign_key_check');
db.close();
from.close();
if (bad !== 'ok' || fk.length) {
	console.error(`snapshot broken: integrity=${bad}, fk violations=${fk.length}`);
	process.exit(1);
}

// self-check: no original text (8+ chars) may be left anywhere in the file
const bytes = readFileSync(dest);
const leaked = [...originals].filter((s) => s.length >= 8 && bytes.includes(Buffer.from(s, 'utf8')));
if (leaked.length) {
	console.error(`${leaked.length} original text values still in the file.`);
	process.exit(1);
}
console.log(`ok: ${dest} (${tables.length} tables, ${originals.size} text values replaced)`);
