// Blind tests for card 12 (daily digest) on desktop, from its Done-when lines only:
// C1 (row, first On sends 07:30, server-rendered preview, Off), C2 (saves HH:MM / NULL), C11 (no undo),
// C12 (error reverts, empty day says "Nothing on today."). No builder test was opened.
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier
const PREFIX = 'Blind12 ';
const HELPER = "One notification a day with today's items and blocks. Nothing on → no notification.";

let page: Page;
const madeItems: string[] = [];
const madeBlocks: string[] = [];

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
		// flow.spec.ts ends by resetting jeremy's password; try both so this file also runs after that one
		for (const pw of [RESET_PW, PW]) {
			await p.fill('#u', 'jeremy');
			await p.fill('#p', pw);
			await p.click('button[type=submit]');
			await p.waitForFunction(
				() => !location.pathname.startsWith('/login') || !!document.querySelector('.alert'),
			);
			if (!p.url().includes('/login')) break;
		}
	}
	await expect(p).not.toHaveURL(/\/(setup|login)/);
	const skip = p.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

interface Reply {
	status: number;
	json: unknown;
}
async function api(method: string, path: string, body?: unknown): Promise<Reply> {
	return page.evaluate(
		async ([m, u, b]) => {
			const hasBody = b !== null && b !== undefined;
			const r = await fetch(u as string, {
				method: m as string,
				headers: hasBody ? { 'content-type': 'application/json' } : undefined,
				body: hasBody ? JSON.stringify(b) : undefined,
			});
			return { status: r.status, json: (await r.json().catch(() => null)) as unknown };
		},
		[method, path, body ?? null] as const,
	);
}

const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore
/** KL is UTC+8 and has no DST: a local wall time to the UTC instant the API stores */
const utcAt = (date: string, time: string) =>
	new Date(`${date}T${time}:00+08:00`).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function makeItem(fields: Record<string, unknown>): Promise<string> {
	const r = await api('POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const id = (r.json as { item: { id: string } }).item.id;
	madeItems.push(id);
	return id;
}
async function makeBlock(fields: Record<string, unknown>): Promise<string> {
	const r = await api('POST', '/api/blocks', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const id = (r.json as { block: { id: string } }).block.id;
	madeBlocks.push(id);
	return id;
}
async function cleanUp() {
	for (const id of madeBlocks.splice(0)) await api('DELETE', `/api/blocks/${id}`).catch(() => {});
	for (const id of madeItems.splice(0)) await api('DELETE', `/api/items/${id}`).catch(() => {});
}

function dbQ<T>(sql: string, ...args: unknown[]): T {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		return db.prepare(sql).get(...args) as T;
	} finally {
		db.close();
	}
}
const digestTimeOf = (username = 'jeremy') =>
	dbQ<{ digest_time: string | null }>('SELECT digest_time FROM users WHERE username = ?', username)
		.digest_time;
const undoCount = () => dbQ<{ n: number }>('SELECT count(*) AS n FROM undo_actions').n;

/** the server-rendered preview chip from the HTML (no JS runs here) */
function previewFrom(html: string): string | null {
	const m = /<p class="preview[^"]*">\s*([^<]*?)\s*<\/p>/.exec(html);
	return m ? m[1]!.replace(/\s+/g, ' ').trim() : null;
}
const itemsIn = (text: string) => Number(/^(\d+) item/.exec(text)?.[1] ?? NaN);
const toggle = (name: 'Off' | 'On') =>
	page.getByRole('group', { name: 'Daily agenda' }).getByRole('button', { name, exact: true });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	// page.route() and the DB assertions work best without a controlling service worker (same as 10/11-blind)
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
	await signIn(page);
});
test.afterAll(async () => {
	await cleanUp();
	await api('PATCH', '/api/me/prefs', { digestTime: null }).catch(() => {});
	await page.context().close();
});
test.afterEach(cleanUp);

// ---- C1 ---------------------------------------------------------------------------------------------------
test('C1 Settings › Notifications: Daily agenda Off | On with the helper, the first On sends 07:30, the server-rendered chip shows today’s real text and is not live, Off clears it', async () => {
	await api('PATCH', '/api/me/prefs', { digestTime: null });
	const today = await klToday();
	await makeItem({ title: PREFIX + 'C1 all day', date: today });
	await makeItem({ title: PREFIX + 'C1 timed', date: today, time: '09:30' });
	await makeBlock({
		label: PREFIX + 'C1 block',
		startAt: utcAt(today, '09:00'),
		endAt: utcAt(today, '10:00'),
	});

	// the page is server-rendered with the real preview, no spinner and no client-only placeholder
	const html = await (await page.request.get('/settings/notifications')).text();
	expect(html).toContain('Daily agenda');
	expect(html).toContain('One notification a day with today');
	const ssrPreview = previewFrom(html);
	expect(ssrPreview).toMatch(/^\d+ items? · \d+ blocks? · first \d{2}:\d{2}$/);
	expect(html.toLowerCase()).not.toContain('spinner');
	expect(html.toLowerCase()).not.toContain('skeleton');

	await page.goto('/settings/notifications');
	await expect(page.getByRole('heading', { name: 'Daily agenda' })).toBeVisible();
	await expect(page.getByText(HELPER, { exact: true })).toBeVisible();
	const chip = page.locator('.preview');
	await expect(chip).toHaveText(ssrPreview!);
	await expect(toggle('Off')).toHaveAttribute('aria-pressed', 'true');
	await expect(toggle('On')).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByLabel('Daily agenda time')).toHaveCount(0);

	// the first switch to On sends 07:30 from the client; no server-side default write
	const [onReq, onRes] = await Promise.all([
		page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		toggle('On').click(),
	]);
	expect(onReq.postDataJSON()).toEqual({ digestTime: '07:30' });
	expect(onRes.status()).toBe(200);
	await expect(page.locator('.toast')).toContainText('Saved');
	await expect(toggle('On')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByLabel('Daily agenda time')).toHaveValue('07:30');
	expect(digestTimeOf()).toBe('07:30');

	// not live: a row added after the load does not change the chip until the next server render
	const before = (await chip.innerText()).trim();
	await makeItem({ title: PREFIX + 'C1 late row', date: today });
	await page.waitForTimeout(500);
	await expect(chip).toHaveText(before);
	await page.reload();
	const after = (await chip.innerText()).trim();
	expect(after).toMatch(/^\d+ items? · \d+ blocks? · first \d{2}:\d{2}$/);
	expect(itemsIn(after)).toBe(itemsIn(before) + 1);

	// Off saves NULL, removes the time field and keeps the preview
	const [offReq, offRes] = await Promise.all([
		page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		toggle('Off').click(),
	]);
	expect(offReq.postDataJSON()).toEqual({ digestTime: null });
	expect(offRes.status()).toBe(200);
	await expect(toggle('Off')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByLabel('Daily agenda time')).toHaveCount(0);
	await expect(chip).toHaveText(after);
	expect(digestTimeOf()).toBeNull();
});

// ---- C2 ---------------------------------------------------------------------------------------------------
test('C2 On saves users.digest_time = HH:MM, a later time change saves that HH:MM, Off saves NULL, and the PATCH refuses a non HH:MM value', async () => {
	await api('PATCH', '/api/me/prefs', { digestTime: null });
	await page.goto('/settings/notifications');

	const [onReq] = await Promise.all([
		page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		toggle('On').click(),
	]);
	expect(onReq.postDataJSON()).toEqual({ digestTime: '07:30' });
	expect(digestTimeOf()).toBe('07:30');
	await page.reload();
	await expect(toggle('On')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByLabel('Daily agenda time')).toHaveValue('07:30');

	// changing the time field saves the new HH:MM
	const time = page.getByLabel('Daily agenda time');
	const [timeReq] = await Promise.all([
		page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		(async () => {
			await time.fill('08:15');
			await time.press('Tab');
		})(),
	]);
	expect(timeReq.postDataJSON()).toEqual({ digestTime: '08:15' });
	await expect(time).toHaveValue('08:15');
	expect(digestTimeOf()).toBe('08:15');

	// Off stores NULL
	const [offReq] = await Promise.all([
		page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		toggle('Off').click(),
	]);
	expect(offReq.postDataJSON()).toEqual({ digestTime: null });
	expect(digestTimeOf()).toBeNull();

	// the API validates with the existing strict HH:MM rule and returns digestTime in the user
	const bad = await api('PATCH', '/api/me/prefs', { digestTime: '7:30' });
	expect(bad.status, JSON.stringify(bad.json)).toBe(400);
	const good = await api('PATCH', '/api/me/prefs', { digestTime: '08:15' });
	expect(good.status).toBe(200);
	expect((good.json as { user: { digestTime: string | null } }).user.digestTime).toBe('08:15');
	expect(digestTimeOf()).toBe('08:15');
	await api('PATCH', '/api/me/prefs', { digestTime: null });
});

// ---- C11 --------------------------------------------------------------------------------------------------
test('C11 changing the digest time adds no undo journal row and shows no Undo toast; Off is the reversal', async () => {
	await api('PATCH', '/api/me/prefs', { digestTime: null });
	await page.goto('/settings/notifications');
	const before = undoCount();

	await Promise.all([
		page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		toggle('On').click(),
	]);
	await expect(page.locator('.toast')).toContainText('Saved');
	await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	expect(await page.locator('.toast').innerText()).not.toContain('Undo');
	expect(undoCount()).toBe(before);

	await Promise.all([
		page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith('/api/me/prefs')),
		toggle('Off').click(),
	]);
	await expect(toggle('Off')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	expect(undoCount()).toBe(before); // no entry either way
	expect(digestTimeOf()).toBeNull();
});

// ---- C12 --------------------------------------------------------------------------------------------------
test('C12 states: a failed save alerts and returns the control to the stored value, and an empty day previews "Nothing on today."', async ({
	browser,
}) => {
	// error: the existing showError toast path, and the stored value stays in place
	await api('PATCH', '/api/me/prefs', { digestTime: '07:30' });
	await page.goto('/settings/notifications');
	await expect(toggle('On')).toHaveAttribute('aria-pressed', 'true');

	const fail = (url: URL) => /\/api\/me\/prefs$/.test(url.pathname);
	await page.route(fail, (route) =>
		route.request().method() === 'PATCH'
			? route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'boom', message: 'Blind12 failed PATCH.' } }),
				})
			: route.fallback(),
	);
	try {
		await toggle('Off').click();
		const alert = page.locator('.toast.error');
		await expect(alert).toBeVisible();
		await expect(alert).toHaveAttribute('role', 'alert');
		await expect(alert).toContainText('Blind12 failed PATCH.');
		await expect(toggle('On')).toHaveAttribute('aria-pressed', 'true'); // still the stored On
		await expect(page.getByLabel('Daily agenda time')).toHaveValue('07:30');

		// a failed time change puts the field back to the stored value (C12)
		const time = page.getByLabel('Daily agenda time');
		await time.fill('06:15');
		await time.press('Tab');
		await expect(alert).toContainText('Blind12 failed PATCH.');
		await expect(time).toHaveValue('07:30');
	} finally {
		await page.unroute(fail);
	}
	expect(digestTimeOf()).toBe('07:30');

	// empty: a brand-new account's today has nothing on
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="1"]').check();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

	const username = 'blind12' + Date.now().toString(36);
	const ctx = await browser.newContext();
	try {
		const np = await ctx.newPage();
		await np.goto('/signup');
		await np.fill('input[name="username"]', username);
		await np.fill('input[name="displayName"]', 'Blind Twelve');
		await np.fill('input[name="password"]', 'blind twelve pass');
		await np.fill('input[name="confirm"]', 'blind twelve pass');
		await np.click('button[type=submit]');
		await expect(np).not.toHaveURL(/\/(signup|login)/);
		const skip = np.getByRole('button', { name: 'Skip tour' });
		await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
		if (await skip.isVisible().catch(() => false)) await skip.click();

		await np.goto('/settings/notifications');
		await expect(np.locator('.preview')).toHaveText('Nothing on today.');
		await expect(np.getByLabel('Daily agenda time')).toHaveCount(0);
		const html = await (await np.request.get('/settings/notifications')).text();
		expect(previewFrom(html)).toBe('Nothing on today.');
	} finally {
		await ctx.close();
	}
});
