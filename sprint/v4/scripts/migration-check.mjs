// Migration safety check. Throwaway DBs only (under --out). Never point it at data/app.db.
//   node migration-check.mjs --app <checkout>\app --old C:\Users\Public\lt-v4\v312\app --out <dir> [--sha <sha>] [--scale 200]
// 1. empty DB: migrate twice, integrity + FK clean.
// 2. upgrade: DB seeded by the OLD release (v3.1.2 code) -> scaled xN (synthetic large DB) -> new migrations ->
//    row counts and ids unchanged in every old table, integrity + FK clean, second run is a no-op.
// 3. new seed: DB seeded by the NEW code, migrate again (no-op), clean.
// Exit 0 + result.json ok=true only when all pass. Each seeded DB gets its own folder (its TEST-LOGIN.txt sits next to it).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const app = resolve(arg('app'));
const old = resolve(arg('old'));
const out = resolve(arg('out'));
const scale = Number(arg('scale', '200'));
const sha = arg('sha', '');
for (const p of [app, old]) if (!existsSync(join(p, 'drizzle'))) throw new Error(`no drizzle folder in ${p}`);
if (/data[\\/]app\.db/i.test(out)) throw new Error('refusing: --out must not be the real data folder');

const req = createRequire(join(app, 'package.json'));
const Database = req('better-sqlite3');
const { drizzle } = req('drizzle-orm/better-sqlite3');
const { migrate } = req('drizzle-orm/better-sqlite3/migrator');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const steps = [];
const step = (name, ok, detail = {}) => { steps.push({ name, ok, ...detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`); };

function open(path) {
	const s = new Database(path);
	s.pragma('journal_mode = WAL');
	s.pragma('busy_timeout = 5000');
	return s;
}
// Same as migrateDb() in app/src/lib/server/db.ts: FKs off around the migrator, FK check after.
function runMigrations(s, folder) {
	s.pragma('foreign_keys = OFF');
	try {
		migrate(drizzle(s), { migrationsFolder: folder });
	} finally {
		s.pragma('foreign_keys = ON');
	}
}
function health(s) {
	const integrity = s.pragma('integrity_check', { simple: true });
	const fk = s.pragma('foreign_key_check');
	return { integrity, fkViolations: fk.length };
}
const tables = (s) => s.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' AND name NOT LIKE '__drizzle%'`).all().map((r) => r.name);
const cols = (s, t) => s.prepare(`PRAGMA table_info("${t}")`).all();
function snapshot(s) {
	const snap = {};
	for (const t of tables(s)) {
		const hasId = cols(s, t).some((c) => c.name === 'id');
		const count = s.prepare(`SELECT count(*) AS n FROM "${t}"`).get().n;
		let ids = null;
		if (hasId) ids = createHash('sha256').update(s.prepare(`SELECT id FROM "${t}" ORDER BY id`).all().map((r) => String(r.id)).join('\n')).digest('hex').slice(0, 16);
		snap[t] = { count, ids };
	}
	return snap;
}
function seed(appDir, dbPath) {
	const env = { ...process.env, DATABASE_PATH: dbPath, APP_SECRET: randomBytes(24).toString('hex'), SETUP_TOKEN: randomBytes(24).toString('hex'), ORIGIN: 'http://localhost:4199' };
	// $lib alias comes from .svelte-kit/tsconfig.json, which a fresh worktree doesn't have yet
	if (!existsSync(join(appDir, '.svelte-kit', 'tsconfig.json'))) execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['svelte-kit', 'sync'], { cwd: appDir, env, stdio: 'pipe', shell: process.platform === 'win32' });
	execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', 'scripts/seed.ts', '--phone', '--db', dbPath], { cwd: appDir, env, stdio: 'pipe', shell: process.platform === 'win32' });
}
// Synthetic large DB: copy rows of tables with a text/int `id` column N times with new ids. Tables whose other unique
// constraints refuse copies are skipped and listed (reported, not hidden).
function scaleUp(s, n) {
	const scaled = {}, skipped = {};
	const want = ['items', 'blocks', 'pages', 'page_blocks', 'reminders', 'keep_notes', 'notes', 'database_records', 'attachments'];
	for (const t of tables(s).filter((x) => want.includes(x))) {
		const c = cols(s, t);
		if (!c.some((x) => x.name === 'id')) continue;
		const names = c.map((x) => `"${x.name}"`).join(', ');
		const sel = c.map((x) => (x.name === 'id' ? `id || '_s' || ?` : `"${x.name}"`)).join(', ');
		const max = s.prepare(`SELECT max(rowid) AS m FROM "${t}"`).get().m ?? 0;
		try {
			s.transaction(() => { for (let k = 1; k <= n; k++) s.prepare(`INSERT INTO "${t}" (${names}) SELECT ${sel} FROM "${t}" WHERE rowid <= ?`).run(String(k), max); })();
			scaled[t] = s.prepare(`SELECT count(*) AS n FROM "${t}"`).get().n;
		} catch (e) { skipped[t] = String(e.message).slice(0, 160); }
	}
	return { scaled, skipped };
}

let allOk = true;
const check = (name, cond, detail) => { step(name, !!cond, detail); if (!cond) allOk = false; };

// 1. empty
try {
	const p = join(out, 'empty.db'); const s = open(p);
	runMigrations(s, join(app, 'drizzle')); runMigrations(s, join(app, 'drizzle'));
	const h = health(s); s.close();
	check('empty: migrate twice', h.integrity === 'ok' && h.fkViolations === 0, h);
} catch (e) { check('empty: migrate twice', false, { error: String(e.message) }); }

// 2. upgrade from the old release, scaled
try {
	mkdirSync(join(out, 'upgrade'), { recursive: true });
	const p = join(out, 'upgrade', 'upgrade.db');
	seed(old, p);
	const s = open(p);
	const sc = scaleUp(s, scale);
	const before = snapshot(s);
	copyFileSync(p, join(out, 'upgrade', 'upgrade-before.db.bak'));
	const t0 = Date.now();
	runMigrations(s, join(app, 'drizzle'));
	const ms = Date.now() - t0;
	const after = snapshot(s);
	const changed = Object.keys(before).filter((t) => !after[t] || after[t].count !== before[t].count || after[t].ids !== before[t].ids);
	const h = health(s);
	runMigrations(s, join(app, 'drizzle'));
	const again = snapshot(s);
	const changedAgain = Object.keys(after).filter((t) => again[t].count !== after[t].count || again[t].ids !== after[t].ids);
	s.close();
	check('upgrade: old-release seed x' + scale + ' -> new migrations', changed.length === 0 && h.integrity === 'ok' && h.fkViolations === 0 && changedAgain.length === 0,
		{ migrateMs: ms, scaled: sc.scaled, skipped: sc.skipped, changedTables: changed, changedOnSecondRun: changedAgain, ...h });
} catch (e) { check('upgrade: old-release seed -> new migrations', false, { error: String(e.message).slice(0, 400) }); }

// 3. new seed
try {
	mkdirSync(join(out, 'new'), { recursive: true });
	const p = join(out, 'new', 'new.db');
	seed(app, p);
	const s = open(p);
	runMigrations(s, join(app, 'drizzle'));
	const h = health(s); s.close();
	check('new seed: migrate again (no-op)', h.integrity === 'ok' && h.fkViolations === 0, h);
} catch (e) { check('new seed', false, { error: String(e.message).slice(0, 400) }); }

const result = { ok: allOk, sha, at: new Date().toISOString(), scale, steps };
writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
console.log(allOk ? 'MIGRATION CHECK PASSED' : 'MIGRATION CHECK FAILED');
process.exit(allOk ? 0 : 1);
