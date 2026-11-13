import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;

export interface Handle {
	sqlite: Database.Database;
	db: DB;
}

/** Open + pragmas. Creates parent dir. ':memory:' allowed (tests). */
export function openDb(path: string): Handle {
	if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
	const sqlite = new Database(path);
	if (path !== ':memory:') {
		try {
			chmodSync(path, 0o600); // hashes + private data: owner only (-wal/-shm copy this mode)
		} catch {
			/* read-only mount or not ours: leave as is */
		}
	}
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('synchronous = NORMAL');
	return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Forward-only. Folder = ./drizzle relative to process cwd (app/ in dev, /app in Docker). */
export function migrateDb(h: Handle, folder = resolve(process.cwd(), 'drizzle')): void {
	// Table rebuilds (DROP + RENAME) must run with FKs off, or dropping `items` fires ON DELETE SET NULL on
	// blocks.item_id. The pragma is ignored inside a transaction, and drizzle wraps migrations in one, so set it here.
	h.sqlite.pragma('foreign_keys = OFF');
	try {
		migrate(h.db, { migrationsFolder: folder });
		const bad = h.sqlite.pragma('foreign_key_check') as unknown[];
		if (bad.length) throw new Error(`migration left ${bad.length} foreign key violations`);
	} finally {
		h.sqlite.pragma('foreign_keys = ON');
	}
}

export function healthy(h: Handle): boolean {
	try {
		return h.sqlite.prepare('SELECT 1 AS ok').get() !== undefined;
	} catch {
		return false;
	}
}

// ---- app singleton (set in hooks init) ----
let current: Handle | null = null;

export function setHandle(h: Handle): void {
	current = h;
}

export function handle(): Handle {
	if (!current) throw new Error('DB not open. hooks init must run first.');
	return current;
}

export const db = (): DB => handle().db;

/** BEGIN IMMEDIATE transaction (setup, redeem, signup). */
export function txImmediate<T>(fn: () => T): T {
	return handle().sqlite.transaction(fn).immediate();
}
