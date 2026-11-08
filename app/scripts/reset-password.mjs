#!/usr/bin/env node
// Locked-out recovery (FR-A12). Plain JS so it runs in the prod container.
//   prod: docker compose exec app node scripts/reset-password.mjs <username>
//   dev:  cd app && npm run reset-password -- <username>     (reads app/.env)
// Password is read from stdin (hidden on a TTY), never argv.
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import Database from 'better-sqlite3';
import { hash } from '@node-rs/argon2';

function loadDotEnv() {
	if (!existsSync('.env')) return;
	for (const line of readFileSync('.env', 'utf-8').split(/\r?\n/)) {
		const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
}

function ask(question, hidden) {
	return new Promise((resolve) => {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: process.stdin.isTTY,
		});
		if (hidden && process.stdin.isTTY) {
			const write = rl._writeToOutput?.bind(rl);
			rl._writeToOutput = (s) => {
				if (s.includes(question)) write?.(s);
				else write?.('');
			};
		}
		rl.question(question, (a) => {
			rl.close();
			if (hidden && process.stdin.isTTY) process.stdout.write('\n');
			resolve(a);
		});
	});
}

const username = (process.argv[2] ?? '').trim().toLowerCase();
if (!username) {
	console.error('usage: node scripts/reset-password.mjs <username>');
	process.exit(1);
}
loadDotEnv();
const path = process.env.DATABASE_PATH;
if (!path || !existsSync(path)) {
	console.error(`DATABASE_PATH not set or file missing: ${path ?? '(unset)'}`);
	process.exit(1);
}

const db = new Database(path);
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
const user = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(username);
if (!user) {
	console.error(`no such user: ${username}`);
	process.exit(1);
}

let pw;
if (process.stdin.isTTY) {
	pw = await ask('New password: ', true);
	const again = await ask('Again: ', true);
	if (pw !== again) {
		console.error('Passwords do not match.');
		process.exit(1);
	}
} else {
	pw = (await ask('', false)).replace(/\r?\n$/, '');
}
if (pw.length < 10 || pw.length > 128) {
	console.error('Password must be 10-128 characters.');
	process.exit(1);
}

const h = await hash(pw, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
db.transaction(() => {
	db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(h, user.id);
	db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
	// exact prefix match (LIKE would treat _ in usernames as a wildcard)
	const pre = `login:u:${user.username}|`;
	db.prepare('DELETE FROM rate_limits WHERE substr(key, 1, ?) = ? OR key = ?').run(
		pre.length,
		pre,
		`login:u:${user.username}`,
	);
})();
db.close();
console.log(`Password reset for ${user.username}. All their sessions signed out.`);
