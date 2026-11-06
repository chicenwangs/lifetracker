// Dev CLI: npm run db:seed -- --owner jeremy [--dir ../data/seed]
// Reads app/.env (DATABASE_PATH, SEED_DIR, APP_SECRET...).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initEnv } from '../src/lib/server/env';
import { migrateDb, openDb, setHandle } from '../src/lib/server/db';
import { importSeed } from '../src/lib/server/seed';

function loadDotEnv(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	const out: Record<string, string> = {};
	for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
		const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
		if (m && m[1]) out[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '');
	}
	return out;
}

const args = process.argv.slice(2);
const arg = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

const owner = arg('owner');
if (!owner) {
	console.error('usage: npm run db:seed -- --owner <username> [--dir <seed dir>]');
	process.exit(1);
}

try {
	const e = initEnv({ ...loadDotEnv(resolve('.env')), ...process.env });
	const dir = resolve(arg('dir') ?? e.SEED_DIR);
	const h = openDb(e.DATABASE_PATH);
	migrateDb(h);
	setHandle(h);
	const r = importSeed(dir, owner);
	console.log(`Imported from ${dir} for ${owner}\n`);
	console.log('table'.padEnd(16), 'present', 'new', 'updated');
	for (const t of Object.keys(r.counts))
		console.log(
			t.padEnd(16),
			String(r.counts[t]).padStart(7),
			String(r.inserted[t]).padStart(3),
			String(r.updated[t]).padStart(7),
		);
	if (r.warnings.length) {
		console.log(`\n${r.warnings.length} warnings (fix by hand in app):`);
		for (const w of r.warnings) console.log(' -', w);
	}
	h.sqlite.close();
} catch (err) {
	console.error('Import failed:', err instanceof Error ? err.message : err);
	process.exit(1);
}
