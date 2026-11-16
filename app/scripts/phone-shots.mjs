// Phone before/after shots (Mobile overhaul #106). Needs the mobile-dev preview running (port 5176, data/phone-dev.db).
//   node scripts/phone-shots.mjs [--out test-results/phone-baseline] [--base http://localhost:5176]
// Signs in with data/TEST-LOGIN.txt (npm run db:seed:phone). 412×915 + 915×412, light + dark.
import { chromium, devices } from '@playwright/test';
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (n, d) =>
	process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d;
const base = arg('base', 'http://localhost:5176');
const out = resolve(arg('out', 'test-results/phone-baseline'));
const login = Object.fromEntries(
	[...readFileSync(resolve('../data/TEST-LOGIN.txt'), 'utf-8').matchAll(/^(username|password): (.+)$/gm)].map((m) => [m[1], m[2].trim()]),
); // prettier-ignore
if (!login.username || !login.password)
	throw new Error('no login in data/TEST-LOGIN.txt: run npm run db:seed:phone');

// ids for the deep screens (read-only)
const db = new Database(resolve('../data/phone-dev.db'), { readonly: true });
const pageId = db.prepare(`SELECT id FROM pages WHERE title = 'Projects'`).get()?.id;
const itemId = db.prepare(`SELECT id FROM items WHERE title = 'DS quiz revision'`).get()?.id;
db.close();

const click = (sel) => async (p) => p.locator(sel).first().click();
const SCREENS = [
	['today', '/today'],
	['week', '/week'],
	['month', '/month'],
	['keep', '/keep'],
	['keep-note', '/keep', click('text=Groceries')],
	['pages', '/pages'],
	['page-editor', `/pages/${pageId}`],
	['item', `/item/${itemId}`],
	['search', '/today', click('[aria-label^="Search"]')],
	['add-sheet', '/today', click('nav[aria-label="Phone navigation"] [aria-label="Add"]')],
	['more', '/more'],
	['settings', '/settings/preferences'],
];
const SIZES = { portrait: { width: 412, height: 915 }, landscape: { width: 915, height: 412 } };

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const ctx = await browser.newContext({
	...devices['Pixel 7'],
	baseURL: base,
	timezoneId: 'Asia/Kuala_Lumpur',
});
const page = await ctx.newPage();
await page.goto('/login');
await page.fill('#u', login.username);
await page.fill('#p', login.password);
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
const prefs = (themeMode) =>
	page.evaluate(
		(t) => fetch('/api/me/prefs', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ themeMode: t }) }).then((r) => r.status), // prettier-ignore
		themeMode,
	);

const missed = [];
for (const theme of ['light', 'dark']) {
	if ((await prefs(theme)) >= 400) throw new Error('could not set theme');
	for (const [size, viewport] of Object.entries(SIZES)) {
		await page.setViewportSize(viewport);
		const dir = join(out, `${size}-${theme}`);
		mkdirSync(dir, { recursive: true });
		for (const [name, path, act] of SCREENS) {
			await page.goto(path);
			await page.waitForLoadState('networkidle');
			if (act)
				await act(page).catch(() => missed.push(`${size}-${theme}/${name}: control not found, shot shows the screen under it`)); // prettier-ignore
			await page.waitForTimeout(500); // let sheets and entrance animations settle
			await page.screenshot({ path: join(dir, `${name}.png`) });
			await page.keyboard.press('Escape');
		}
	}
}
await prefs('auto'); // back to the seeded default
await browser.close();
console.log(`Saved ${SCREENS.length * 4} shots to ${out}`);
for (const m of missed) console.log(' -', m);
