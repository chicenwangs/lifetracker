// Working-site smoke: boot the PRODUCTION build (app/build) on a throwaway DB and use it over HTTP.
//   node smoke.mjs --app <checkout>\app --db <file.db> --port 4311 [--login <TEST-LOGIN.txt>] [--label empty]
// Without --login: fresh DB, expects the first-run /setup redirect. With --login: signs in with that seed user and
// opens every main screen. Exit 0 only when every check passes. Never point --db at data/app.db.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const app = resolve(arg('app'));
const db = resolve(arg('db'));
const port = Number(arg('port', '4311'));
const login = arg('login');
const label = arg('label', login ? 'seeded' : 'empty');
if (/data[\\/]app\.db$/i.test(db)) throw new Error('refusing: never the real data/app.db');
if (!existsSync(join(app, 'build', 'index.js'))) throw new Error(`no production build at ${join(app, 'build')} (run npm run build)`);

const base = `http://127.0.0.1:${port}`;
const origin = `http://localhost:${port}`;
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} [${label}] ${name}${detail ? ' - ' + detail : ''}`); };

const server = spawn(process.execPath, ['build'], {
	cwd: app,
	env: { ...process.env, DATABASE_PATH: db, PORT: String(port), HOST: '127.0.0.1', ORIGIN: origin, APP_SECRET: randomBytes(32).toString('hex'), SETUP_TOKEN: randomBytes(24).toString('hex') },
	stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
	// 1. boots and is healthy
	let health = null;
	for (let i = 0; i < 60 && !health; i++) {
		try { const r = await get('/healthz'); if (r.status === 200) health = await r.json(); } catch {}
		if (!health) await sleep(1000);
	}
	check('boots, /healthz 200', health && health.ok && health.db, health ? JSON.stringify(health) : 'no answer in 60 s');
	if (!health) return;

	// 2. public pages
	const root = await get('/');
	const loc = root.headers.get('location') ?? '';
	if (login) check('/ redirects to /login', root.status === 303 && loc.startsWith('/login'), `${root.status} ${loc}`);
	else check('/ redirects to first-run /setup', root.status === 303 && loc.startsWith('/setup'), `${root.status} ${loc}`);
	for (const p of [login ? '/login' : '/setup', '/manifest.webmanifest', '/sw.js']) {
		const r = await get(p);
		check(`GET ${p} 200`, r.status === 200, String(r.status));
	}
	if (!login) return;

	// 3. sign in as the seed user (form action, same as the browser)
	const txt = readFileSync(login, 'utf8');
	const username = /username:\s*(\S+)/.exec(txt)?.[1];
	const password = /password:\s*(\S+)/.exec(txt)?.[1];
	const r = await fetch(base + '/login', {
		method: 'POST', redirect: 'manual',
		// accept text/html like a browser form post; with */* SvelteKit answers the action as JSON (200)
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin, accept: 'text/html' },
		body: new URLSearchParams({ username, password }).toString(),
	});
	const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
	check('sign in (303 + session cookie)', r.status === 303 && cookie.length > 0, `${r.status}`);
	if (!cookie) return;

	// 4. every main screen renders for that user, with no server error page
	for (const p of ['/', '/today', '/week', '/month', '/keep', '/pages', '/settings', '/trash', '/more']) {
		let s = await get(p, cookie);
		// follow same-site redirects (e.g. /settings -> /settings/account), at most 3
		for (let hop = 0; hop < 3 && [301, 302, 303, 307, 308].includes(s.status); hop++) {
			const next = s.headers.get('location') ?? '';
			if (!next.startsWith('/') || next.startsWith('/login')) break;
			s = await get(next, cookie);
		}
		const body = s.status === 200 ? await s.text() : '';
		const bad = /Internal Error|500|ReferenceError|TypeError/.test(body.slice(0, 4000)) && !/<title>/.test(body);
		check(`GET ${p} 200 as signed-in user`, s.status === 200 && body.length > 500 && !bad, `${s.status}, ${body.length} bytes`);
	}
	const pages = await (await get('/pages', cookie)).text();
	check('/pages shows seeded content', /Projects|Reading list/.test(pages), 'looks for the seed pages "Projects" / "Reading list"');
	const errs = serverLog.split('\n').filter((l) => /error|unhandled/i.test(l) && !/no-error/i.test(l));
	check('server log has no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
}

main()
	.catch((e) => check('smoke crashed', false, String(e?.message ?? e)))
	.finally(async () => {
		server.kill();
		await sleep(500);
		const ok = checks.length > 0 && checks.every((c) => c.ok);
		console.log(ok ? `SMOKE PASS [${label}] ${checks.length} checks` : `SMOKE FAIL [${label}]`);
		process.exit(ok ? 0 : 1);
	});
