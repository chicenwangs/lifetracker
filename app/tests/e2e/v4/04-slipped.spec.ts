// Card 04 C1–C6, C10–C13 on desktop: the Slipped strip above the Home planner, its rows and the card 03
// action sheet, the one-request bulk move with one Undo, the 50-row cap, hidden types, an empty strip,
// a partner's items staying out, a refused move and the offline path.
import { expect, test, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];

async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		for (const pw of PASSWORDS) {
			await page.fill('#u', 'jeremy');
			await page.fill('#p', pw);
			await page.click('button[type=submit]');
			await page.waitForURL((u) => !/^\/(login|setup)/.test(u.pathname), { timeout: 5000 }).catch(() => {});
			if (!page.url().includes('/login')) break;
		}
	}
	await expect(page).not.toHaveURL(/\/(setup|login)/);
	const skip = page.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

/** JSON fetch as the page's user (same helper shape as flow.spec.ts) */
const api = (page: Page, m: string, p: string, b?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: await r.json().catch(() => null) };
		},
		[m, p, b] as const,
	);
const mkItem = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/items', body);
	expect(r.s).toBe(201);
	return r.j.item.id as string;
};
const drop = (page: Page, id: string) => api(page, 'DELETE', `/api/items/${id}`);
const plusDays = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);
/** the app's prettyDate (time.ts): "Mon 18 Nov 2026" (owner-local date, no Date string parsing) */
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = (d: string) => {
	const [y = 0, m = 1, day = 1] = d.split('-').map(Number);
	const wd = (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7;
	return `${WD[wd]} ${day} ${MONTHS[m - 1]} ${y}`;
};

const slip = (page: Page) => page.locator('aside.right section[aria-label="Slipped"]');
const rows = (page: Page) => slip(page).locator('li');
/** rows already slipped before this test (a full run shares one DB) */
async function baseTotal(page: Page) {
	await page.goto('/');
	const head = slip(page).locator('.cap');
	return (await head.count()) ? Number((await head.innerText()).split('·')[1]?.trim()) : 0;
}

test('C3 the strip sits above the planner, starts expanded and uses the real today, not ?d=', async ({
	page,
}) => {
	await signIn(page);
	const base = await baseTotal(page);
	const yesterday = await plusDays(page, -1);
	const today = await plusDays(page, 0);
	const old = await mkItem(page, { title: `C3 old ${Date.now().toString(36)}`, date: yesterday });
	// "today" (relative to the real clock): a view day of tomorrow must not make it slip
	const notOld = await mkItem(page, { title: `C3 today ${Date.now().toString(36)}`, date: today });
	try {
		await page.goto(`/?d=${await plusDays(page, 1)}`);
		await expect(slip(page)).toBeVisible();
		await expect(slip(page).locator('.cap')).toHaveText(`Slipped · ${base + 1}`);
		await expect(rows(page)).toHaveCount(base + 1);
		const row = rows(page).filter({ hasText: `C3 old` });
		await expect(row.locator('.date')).toHaveText(pretty(yesterday));
		await expect(rows(page).filter({ hasText: `C3 today` })).toHaveCount(0);
		// at the top of the planner column: above the DayPlanner card
		const s = await slip(page).boundingBox();
		const p = await page.locator('aside.right .planner').boundingBox();
		expect(s && p && s.y < p.y).toBe(true);
		expect((await api(page, 'GET', `/api/items/${notOld}`)).j.item.date).toBe(today);

		// C8 desktop: expanded; collapse keeps the header and changes no data
		await expect(slip(page).getByRole('button', { name: `Slipped · ${base + 1}` })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		const url = page.url();
		await slip(page)
			.getByRole('button', { name: `Slipped · ${base + 1}` })
			.click();
		await expect(rows(page)).toHaveCount(0);
		await expect(slip(page).locator('.cap')).toHaveText(`Slipped · ${base + 1}`);
		expect(page.url()).toBe(url);
		await slip(page)
			.getByRole('button', { name: `Slipped · ${base + 1}` })
			.click();
		await expect(rows(page).filter({ hasText: 'C3 old' })).toBeVisible();
		expect((await api(page, 'GET', `/api/items/${old}`)).j.item.date).toBe(yesterday);
	} finally {
		await drop(page, old);
		await drop(page, notOld);
	}
});

test('C4 a row opens the item sheet; ⋯ is the shared ActionSheet with the card 03 list, applied to that row', async ({
	page,
}) => {
	await signIn(page);
	const title = `C4 row ${Date.now().toString(36)}`;
	const id = await mkItem(page, { title, date: await plusDays(page, -2) });
	const tomorrow = await plusDays(page, 1);
	try {
		await page.goto('/');
		await rows(page).filter({ hasText: title }).getByRole('button', { name: title, exact: true }).click();
		await expect(page.getByRole('dialog', { name: 'Item' })).toBeVisible();
		await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: 'Item' })).toBeHidden();

		await rows(page)
			.filter({ hasText: title })
			.getByRole('button', { name: `Actions for ${title}` })
			.click();
		const sheet = page.getByRole('dialog', { name: `Actions for ${title}` });
		await expect(sheet).toBeVisible();
		// the card 03 list, no "Skip this one" (a slipped row never repeats)
		expect(await sheet.getByRole('button').allInnerTexts()).toEqual([
			'Today',
			'Tomorrow',
			'Next weekday',
			'+1 week',
			'Pick date…',
		]);
		await sheet.getByRole('button', { name: 'Tomorrow', exact: true }).click();
		await expect(page.locator('.toast')).toContainText(`Moved "${title}"`);
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.date).toBe(tomorrow);
		await expect(rows(page).filter({ hasText: title })).toHaveCount(0); // no longer slipped
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect(rows(page).filter({ hasText: title })).toBeVisible();
	} finally {
		await drop(page, id);
	}
});

test('C5 Move all to today is one request, one undo batch — all N, time and span kept', async ({ page }) => {
	await signIn(page);
	const base = await baseTotal(page);
	const stamp = Date.now().toString(36);
	const a = await mkItem(page, { title: `C5 timed ${stamp}`, date: await plusDays(page, -2), time: '09:30' });
	const b = await mkItem(page, {
		title: `C5 span ${stamp}`,
		date: await plusDays(page, -4),
		endDate: await plusDays(page, -2),
	});
	const c = await mkItem(page, { title: `C5 plain ${stamp}`, date: await plusDays(page, -9) });
	const today = await plusDays(page, 0);
	let posts = 0;
	page.on('request', (r) => {
		if (r.method() === 'POST' && r.url().endsWith('/api/items/move-all')) posts++;
	});
	try {
		await page.goto('/');
		await expect(slip(page).locator('.cap')).toHaveText(`Slipped · ${base + 3}`);
		await slip(page).getByRole('button', { name: 'Move all to today' }).click();
		await expect(page.locator('.toast')).toContainText(`Moved ${base + 3} slipped items to today`);
		expect(posts).toBe(1); // one request for every row
		await expect(rows(page)).toHaveCount(0); // nothing left past today
		expect((await api(page, 'GET', `/api/items/${a}`)).j.item).toMatchObject({ date: today, time: '09:30' });
		const span = (await api(page, 'GET', `/api/items/${b}`)).j.item;
		expect(span.date).toBe(today);
		expect(span.endDate).toBe(await plusDays(page, 2)); // -4..-2 = two days, moved with the start
		expect((await api(page, 'GET', `/api/items/${c}`)).j.item.date).toBe(today);

		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click(); // one entry for all N
		await expect(rows(page).filter({ hasText: `C5 timed ${stamp}` })).toBeVisible();
		expect((await api(page, 'GET', `/api/items/${a}`)).j.item.date).toBe(await plusDays(page, -2));
		expect((await api(page, 'GET', `/api/items/${b}`)).j.item.date).toBe(await plusDays(page, -4));
		expect((await api(page, 'GET', `/api/items/${c}`)).j.item.date).toBe(await plusDays(page, -9));
	} finally {
		await drop(page, a);
		await drop(page, b);
		await drop(page, c);
	}
});

test('C12 more than 50: 50 rows plus an "N more" count label, the header keeps the real total', async ({
	page,
}) => {
	await signIn(page);
	const base = await baseTotal(page);
	const made: string[] = [];
	try {
		for (let i = 0; i < 51; i++)
			made.push(await mkItem(page, { title: `C12 ${i}`, date: await plusDays(page, -400 + i) }));
		await page.goto('/');
		await expect(slip(page).locator('.cap')).toHaveText(`Slipped · ${base + 51}`);
		await expect(rows(page)).toHaveCount(50);
		const rest = `${base + 51 - Math.min(50, base + 51)} more`;
		await expect(slip(page).locator('.rest')).toHaveText(rest);
		await expect(slip(page).getByRole('button', { name: rest })).toHaveCount(0); // a label, not a button
	} finally {
		for (const id of made) await drop(page, id);
	}
});

test('C2 a hidden type leaves the strip (hidden_types, untyped = None)', async ({ page }) => {
	await signIn(page);
	const stamp = Date.now().toString(36);
	const work = await mkItem(page, {
		title: `C2 work ${stamp}`,
		date: await plusDays(page, -3),
		type: 'Work',
	});
	const none = await mkItem(page, { title: `C2 none ${stamp}`, date: await plusDays(page, -2) });
	try {
		await page.goto('/');
		await expect(rows(page).filter({ hasText: `C2 work ${stamp}` })).toBeVisible();
		expect((await api(page, 'PATCH', '/api/me/prefs', { hiddenTypes: ['Work'] })).s).toBe(200);
		await page.goto('/');
		await expect(rows(page).filter({ hasText: `C2 none ${stamp}` })).toBeVisible();
		await expect(rows(page).filter({ hasText: `C2 work ${stamp}` })).toHaveCount(0);
	} finally {
		await api(page, 'PATCH', '/api/me/prefs', { hiddenTypes: [] });
		await drop(page, work);
		await drop(page, none);
	}
});

test('C6/C11 a fresh account has no strip; a partner item never shows in mine', async ({ page, browser }) => {
	await signIn(page);
	const title = `C11 partner ${Date.now().toString(36)}`;
	const stamp = Date.now().toString(36);
	const mine = await mkItem(page, { title: `C11 mine ${stamp}`, date: await plusDays(page, -3) });
	// invite a second account: open sign-up has a per-IP cap a full run can use up
	await page.goto('/settings/users');
	await page.locator('input[name="open"][value="0"]').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.getByRole('button', { name: 'Make invite code' }).click();
	await expect(page.locator('[role="status"] code').first()).toBeVisible();
	const code = (await page.locator('[role="status"] code').first().innerText()).trim();
	expect(code).toMatch(/^INV-/);

	// left for the worker to reap: an explicit close hung once after a navigation (60 s timeout)
	const ctx = await browser.newContext();
	const other = await ctx.newPage();
	try {
		await other.goto('/signup');
		await other.fill('#code', code);
		await other.fill('#nu', `stranger${Date.now().toString(36)}`);
		await other.fill('#dn', 'Stranger');
		await other.fill('#np', `${PW} 2`);
		await other.fill('#cp', `${PW} 2`);
		await other.getByRole('button', { name: 'Create account' }).click();
		await other.waitForURL((u) => u.pathname === '/');
		await other.goto('/today');
		await expect(other.locator('main section[aria-label="Slipped"]')).toHaveCount(0); // C6: no rows, no header
		await expect(other).not.toHaveURL(/\/(setup|login)/);

		const theirs = await mkItem(other, { title, date: await plusDays(other, -3) });
		await page.goto('/');
		await expect(rows(page).filter({ hasText: title })).toHaveCount(0);
		// and the bulk move never carries it over (it is not in my own calendars)
		await expect(slip(page).getByRole('button', { name: 'Move all to today' })).toBeVisible();
		await slip(page).getByRole('button', { name: 'Move all to today' }).click();
		await expect(page.locator('.toast')).toContainText('to today');
		// the partner row is untouched (read as the partner: it is not mine)
		expect((await api(other, 'GET', `/api/items/${theirs}`)).j.item.date).toBe(await plusDays(other, -3));
	} finally {
		await drop(page, mine);
		// leave the shared e2e DB as found: later specs must not inherit open sign-up
		await page.goto('/settings/users');
		await page.locator('input[name="open"][value="0"]').check();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();
	}
});

test('C10 a refused bulk move shows the server message and leaves every date alone', async ({ page }) => {
	await signIn(page);
	const title = `C10 keep ${Date.now().toString(36)}`;
	const id = await mkItem(page, { title, date: await plusDays(page, -3) });
	try {
		await page.route('**/api/items/move-all', (route) =>
			route.fulfill({
				status: 400,
				contentType: 'application/json',
				body: JSON.stringify({ error: { code: 'bad_request', message: 'Move all refused' } }),
			}),
		);
		await page.goto('/');
		await slip(page).getByRole('button', { name: 'Move all to today' }).click();
		await expect(page.getByRole('alert')).toContainText('Move all refused');
		await expect(rows(page).filter({ hasText: title })).toBeVisible();
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.date).toBe(await plusDays(page, -3));
	} finally {
		await page.unroute('**/api/items/move-all');
		await drop(page, id);
	}
});

test('C13 offline: Move all shows the usual offline toast, changes nothing and is not queued', async ({
	page,
	context,
}) => {
	await signIn(page);
	const title = `C13 offline ${Date.now().toString(36)}`;
	const day = await plusDays(page, -3);
	const id = await mkItem(page, { title, date: day });
	try {
		await page.goto('/');
		const queued = await page.evaluate(() => localStorage.getItem('lt_action_queue'));
		await context.setOffline(true);
		await slip(page).getByRole('button', { name: 'Move all to today' }).click();
		await expect(page.getByRole('alert')).toContainText('offline');
		// not queued (D-V4-17): the action queue is exactly as it was
		expect(await page.evaluate(() => localStorage.getItem('lt_action_queue'))).toBe(queued);
		await context.setOffline(false);
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.date).toBe(day);
		await expect(rows(page).filter({ hasText: title })).toBeVisible();
	} finally {
		await context.setOffline(false);
		await drop(page, id);
	}
});
