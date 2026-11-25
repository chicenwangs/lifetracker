// Read-only smoke check of the LIVE site. No login, no writes, a handful of GETs. Run at most once per hour.
//   node live-smoke.mjs [--url https://planner.jeremyjosh.org] [--out <file.json>]
// Fails only on: /healthz not ok, sign-in page not served, the calendar feed answering a made-up token.
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = arg('url', 'https://planner.jeremyjosh.org').replace(/\/$/, '');
const out = arg('out');
const checks = [];
const add = (name, ok, detail, fatal = true) => checks.push({ name, ok, fatal, detail });
const get = (path) => fetch(base + path, { redirect: 'manual', headers: { 'user-agent': 'lt-team-live-smoke' }, signal: AbortSignal.timeout(15000) });

let version = null;
try {
	const r = await get('/healthz');
	const j = await r.json();
	version = j.version ?? null;
	add('healthz', r.status === 200 && j.ok === true, { status: r.status, ok: j.ok, version: j.version, db: j.db, jobs: j.jobs });
} catch (e) { add('healthz', false, { error: String(e.message) }); }

let html = '';
let loginHeaders = null;
try {
	const r = await get('/login');
	html = await r.text();
	loginHeaders = r.headers;
	add('sign-in page', r.status === 200 && /<form/i.test(html), { status: r.status, bytes: html.length });
} catch (e) { add('sign-in page', false, { error: String(e.message) }); }

try {
	const rel = (h) => new URL(h, base + '/login').pathname;
	const m = html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/i) || html.match(/<link[^>]+href="([^"]+)"[^>]+rel="manifest"/i);
	if (m) { const r = await get(rel(m[1])); add('manifest', r.status === 200, { path: rel(m[1]), status: r.status }, false); }
	else add('manifest', false, { note: 'no manifest link on /login' }, false);
	const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"]*_app\/immutable\/[^"]+)"/g)].map((x) => rel(x[1])))].slice(0, 3);
	for (const a of assets) { const r = await get(a); add(`asset ${a.split('/').pop()}`, r.status === 200, { status: r.status }, false); }
	if (!assets.length) add('assets', false, { note: 'no _app/immutable links found on /login' }, false);
} catch (e) { add('static files', false, { error: String(e.message) }, false); }

try {
	const r = await get(`/cal/${randomBytes(16).toString('hex')}.ics`);
	const body = await r.text();
	// 404 on a version with the feed; a redirect to sign-in on older versions. Either way: no calendar served.
	add('calendar feed refuses a made-up token', r.status !== 200 && !/BEGIN:VCALENDAR/.test(body), { status: r.status });
} catch (e) { add('calendar feed refuses a made-up token', false, { error: String(e.message) }); }

if (loginHeaders) {
	const want = ['strict-transport-security', 'x-content-type-options', 'referrer-policy', 'content-security-policy', 'x-frame-options'];
	add('security headers (info)', true, Object.fromEntries(want.map((h) => [h, loginHeaders.get(h) ? 'present' : 'absent'])), false);
}

const ok = checks.every((c) => c.ok || !c.fatal);
const res = { ok, at: new Date().toISOString(), url: base, version, checks };
if (out) writeFileSync(out, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 2));
process.exit(ok ? 0 : 1);
