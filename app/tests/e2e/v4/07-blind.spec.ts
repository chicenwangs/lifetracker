// Blind tests for card 07, from its Done-when lines only (desktop): C1–C5, C12 (desktop), C13 (undo) and
// C14 (states). C5–C11 route logic also lives in tests/unit/v4-07-blind.test.ts; C12 phone is in
// tests/e2e/phone/v4-07-blind.spec.ts. No builder test was opened.
import { expect, test, type Browser, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const PW = 'good pass phrase';
const RESET_PW = 'reset pass phrase 1'; // flow.spec.ts resets jeremy's password earlier
const PREFIX = 'Blind07 ';
const EMPTY = 'No feed yet. Create a link to see your plan in another calendar.';
const LINK = 'Your calendar feed link';

let page: Page;
const created: string[] = [];

async function signIn(p: Page) {
	await p.goto('/');
	if (p.url().endsWith('/setup')) {
		await p.fill('#tk', 'e2e-setup-token-long-enough');
		await p.fill('#p', PW);
		await p.fill('#cp', PW);
		await p.click('button[type=submit]');
	} else if (p.url().includes('/login')) {
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

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
	// page.route() and the DB assertions work best without a controlling service worker (same as 04-blind)
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
	await signIn(page);
});
test.afterAll(() => page.context().close());

interface Reply {
	status: number;
	json: unknown;
}
async function api(p: Page, method: string, path: string, body?: unknown): Promise<Reply> {
	return p.evaluate(
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

interface Item {
	id: string;
	title: string;
	date: string | null;
}
async function make(fields: Record<string, unknown>): Promise<Item> {
	const r = await api(page, 'POST', '/api/items', fields);
	expect(r.status, JSON.stringify(r.json)).toBe(201);
	const item = (r.json as { item: Item }).item;
	created.push(item.id);
	return item;
}
const klToday = () =>
	page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())); // prettier-ignore

test.afterEach(async () => {
	for (const id of created.splice(0)) await api(page, 'DELETE', `/api/items/${id}`); // prettier-ignore
});

/** users.ics_token_hash straight from the e2e DB (behaviour the page cannot show) */
function dbHash(): string | null {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		const row = db.prepare('SELECT ics_token_hash AS h FROM users WHERE username = ?').get('jeremy') as
			{ h: string | null } | undefined;
		return row?.h ?? null;
	} finally {
		db.close();
	}
}
function undoCount(): number {
	const dir = process.env.E2E_DIR;
	if (!dir) throw new Error('E2E_DIR missing');
	const db = new Database(join(dir, 'app.db'), { readonly: true });
	try {
		return (db.prepare('SELECT count(*) AS n FROM undo_actions').get() as { n: number }).n;
	} finally {
		db.close();
	}
}
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const feedText = () => page.getByLabel(LINK);
async function feedUrl(): Promise<string> {
	await expect(feedText()).toBeVisible();
	return (await feedText().innerText()).trim();
}
/** create a feed or rotate an existing one, then return the one-time URL */
async function ensureUrl(): Promise<string> {
	await page.goto('/settings/calendar-feed');
	if (
		await page
			.getByRole('button', { name: 'Turn off' })
			.isVisible()
			.catch(() => false)
	) {
		await page.getByRole('button', { name: 'Rotate' }).click();
	} else {
		await page.getByRole('button', { name: 'Create feed link' }).click();
	}
	return feedUrl();
}
async function ensureOff() {
	await page.goto('/settings/calendar-feed');
	if (
		await page
			.getByRole('button', { name: 'Turn off' })
			.isVisible()
			.catch(() => false)
	) {
		await page.getByRole('button', { name: 'Turn off' }).click();
	}
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
}

/** a second account: invite code made by the admin, then signup */
async function inviteCode() {
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="0"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Make invite code' }).click();
	await expect(page.locator('[role="status"] code').first()).toBeVisible();
	const code = (await page.locator('[role="status"] code').first().innerText()).trim();
	expect(code).toMatch(/^INV-/);
	return code;
}
async function memberPage(browser: Browser) {
	const code = await inviteCode();
	const ctx = await browser.newContext({ baseURL: new URL(page.url()).origin });
	const n = await ctx.newPage();
	await n.goto('/signup');
	await n.fill('#code', code);
	await n.fill('#nu', `blind07m${Date.now().toString(36)}`);
	await n.fill('#dn', 'Blind 07 Member');
	await n.fill('#np', 'blind member phrase');
	await n.fill('#cp', 'blind member phrase');
	await n.getByRole('button', { name: 'Create account' }).click();
	await n.waitForURL((u) => u.pathname === '/');
	const skip = n.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	return { ctx, n };
}

test('C1 settings: the empty state is one line + Create, and the Planner section is in the desktop nav for a member too', async ({
	browser,
}) => {
	await ensureOff();
	await expect(page.getByRole('button', { name: 'Create feed link' })).toBeVisible();
	await expect(feedText()).toHaveCount(0);

	// the desktop side nav has it, marked as the current section
	const nav = page.getByRole('navigation', { name: 'Settings' });
	await expect(nav.getByRole('link', { name: 'Calendar feed' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Calendar feed' })).toHaveAttribute('aria-current', 'page');

	// a member (no admin flag on the row) still sees it, while admin-only rows stay hidden
	const { ctx, n } = await memberPage(browser);
	try {
		await n.goto('/settings/account');
		const mnav = n.getByRole('navigation', { name: 'Settings' });
		await expect(mnav.getByRole('link', { name: 'Calendar feed' })).toBeVisible();
		await expect(mnav.getByRole('link', { name: 'Users' })).toHaveCount(0);
	} finally {
		await ctx.close();
	}
});

test('C2 create: the URL comes back in the form action once, only its SHA-256 is stored, and a reload only says the feed exists', async () => {
	await ensureOff();
	const [resp] = await Promise.all([
		page.waitForResponse(
			(r) => r.request().method() === 'POST' && /\/settings\/calendar-feed\?\/create$/.test(r.url()),
		),
		page.getByRole('button', { name: 'Create feed link' }).click(),
	]);
	const url = await feedUrl();
	const body = await resp.text();
	expect(body).toContain('"type":"success"');
	expect(body).toContain(url); // the one form-action response carried form.url

	const token = /\/cal\/([^/]+)\.ics$/.exec(url)![1]!;
	expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
	expect(new URL(url).origin).toBe(new URL(page.url()).origin);
	expect(url).toMatch(/\/cal\/[A-Za-z0-9_-]{43}\.ics$/);

	const hash = dbHash();
	expect(hash).toBe(sha256(token)); // only the hash is stored
	expect(hash).not.toBe(token);

	await page.reload();
	await expect(page.getByText('Feed is on. Anyone with the link can read your items.', { exact: true })).toBeVisible(); // prettier-ignore
	await expect(feedText()).toHaveCount(0);
	expect(await page.content()).not.toContain(token);
});

test('C3 one-time panel: the URL is inline with Copy (writes the clipboard and flips to Copied), Rotate and Turn off', async () => {
	const url = await ensureUrl();
	await expect(feedText()).toHaveText(url);
	await expect(page.getByRole('button', { name: 'Rotate' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Turn off' })).toBeVisible();
	await expect(
		page.getByText('Shown once. Copy it now; a reload only says that a feed exists.'),
	).toBeVisible();

	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: 'Copy', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
});

test('C4 rotate and turn off: a new URL kills the old one, off clears the hash, and both survive a reload', async ({
	request,
}) => {
	const old = await ensureUrl();
	expect((await request.get(old)).status()).toBe(200); // survives a reload

	await page.getByRole('button', { name: 'Rotate' }).click();
	// the old one-time panel stays visible until the action returns: wait for it to change
	await expect.poll(async () => (await feedText().innerText()).trim()).not.toBe(old);
	const fresh = await feedUrl();
	const token = /\/cal\/([^/]+)\.ics$/.exec(fresh)![1]!;
	expect(dbHash()).toBe(sha256(token));

	expect((await request.get(old)).status()).toBe(404); // the old URL is dead
	expect((await request.get(fresh)).status()).toBe(200);

	await page.reload();
	await expect(page.getByText('Feed is on. Anyone with the link can read your items.', { exact: true })).toBeVisible(); // prettier-ignore
	await expect(feedText()).toHaveCount(0);
	expect((await request.get(fresh)).status()).toBe(200);

	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
	expect(dbHash()).toBeNull();
	expect((await request.get(fresh)).status()).toBe(404);

	await page.reload();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
});

test('C5 public fetch: the feed works with no session cookie, and bad tokens are a bare 404', async ({
	request,
}) => {
	const today = await klToday();
	const title = `${PREFIX}C5 item ${Date.now()}`;
	await make({ title, date: today, time: '09:00' });
	const url = await ensureUrl();

	expect((await request.storageState()).cookies).toEqual([]); // no session cookie
	const res = await request.get(url);
	expect(res.status()).toBe(200);
	const headers = res.headers();
	expect(headers['content-type']).toBe('text/calendar; charset=utf-8');
	expect(headers['cache-control']).toBe('private, max-age=300');
	expect(headers['cross-origin-resource-policy'] ?? 'none').not.toBe('same-origin'); // /cal/ is exempt
	const body = await res.text();
	expect(body).toContain('BEGIN:VCALENDAR');
	expect(body).toContain(`SUMMARY:${title}`);

	const origin = new URL(url).origin;
	for (const path of ['/cal/blind07-unknown.ics', '/cal/blind07-malformed']) {
		const bad = await request.get(origin + path);
		expect(bad.status(), path).toBe(404);
		expect(bad.headers()['content-type']).toBe('application/json');
		expect(await bad.text()).toBe('{}');
	}
});

test('C12 desktop: the section is reachable from the settings nav and Copy/Rotate/Turn off meet the 24 px desktop target', async () => {
	await page.goto('/settings/calendar-feed');
	await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Calendar feed' }).click(); // prettier-ignore
	await expect(page).toHaveURL(/\/settings\/calendar-feed$/);
	await ensureUrl();
	for (const name of ['Copy', 'Rotate', 'Turn off']) {
		const box = await page.getByRole('button', { name, exact: true }).boundingBox();
		expect(box, name).not.toBeNull();
		expect(Math.round(box!.width), name).toBeGreaterThanOrEqual(24);
		expect(Math.round(box!.height), name).toBeGreaterThanOrEqual(24);
	}
});

test('C13 undo: Create, Rotate and Turn off never add an undo entry and show no undo toast', async () => {
	await ensureOff();
	const before = undoCount();

	await page.getByRole('button', { name: 'Create feed link' }).click();
	await expect(feedText()).toBeVisible();
	await expect(page.locator('.toast')).toHaveCount(0);
	expect(undoCount()).toBe(before);

	await page.getByRole('button', { name: 'Rotate' }).click();
	await expect(feedText()).toBeVisible();
	await expect(page.locator('.toast')).toHaveCount(0);
	expect(undoCount()).toBe(before);

	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
	await expect(page.locator('.toast')).toHaveCount(0);
	expect(undoCount()).toBe(before);
});

test('C14 states: loading is the server-rendered section and a failed action is an inline alert + Retry, never a toast', async () => {
	await ensureOff();
	const html = await (await page.request.get('/settings/calendar-feed')).text();
	expect(html).toContain(EMPTY);
	expect(html.toLowerCase()).not.toContain('skeleton');
	expect(html.toLowerCase()).not.toContain('spinner');

	const action = /\/settings\/calendar-feed\?\/create$/;
	await page.route(action, (route) =>
		route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ type: 'error', status: 500, error: { message: 'Blind feed failure.' } }),
		}),
	);
	try {
		await page.getByRole('button', { name: 'Create feed link' }).click();
		const alert = page.locator('.alert');
		await expect(alert).toBeVisible();
		await expect(alert).toHaveAttribute('role', 'alert');
		await expect(alert).toContainText('Blind feed failure.');
		await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
		await expect(page.locator('.toast')).toHaveCount(0);
		await expect(feedText()).toHaveCount(0); // nothing was minted
	} finally {
		await page.unroute(action);
	}
});
