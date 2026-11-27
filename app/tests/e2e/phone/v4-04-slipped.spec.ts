// Card 04 C5, C7–C9 on phone: the same strip at the top of /today (tap = item sheet, ⋯ = shared ActionSheet),
// swipe right = done / left = delete with Undo, 48 dp controls, Back closing the sheet first, the landscape
// collapse default, and O-10's toast sitting 8 px above an open sheet.
import { expect, test, type Page } from '@playwright/test';
import { expectTargets48, noDesktopHints, signIn, swipe } from './helpers';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const LIST = ['Today', 'Tomorrow', 'Next weekday', '+1 week', 'Pick date…'];

/** JSON fetch as the page's user */
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
/** owner-local date n days from now (Asia/Kuala_Lumpur project timezone) */
const day = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);

const slip = (page: Page) => page.locator('main section[aria-label="Slipped"]');
const rows = (page: Page) => slip(page).locator('li');
const row = (page: Page, title: string) => rows(page).filter({ hasText: title });
/** landscape starts collapsed (C8); anything that needs rows opens the strip first */
async function expand(page: Page) {
	const t = slip(page).locator('.toggle');
	// a tap before hydration does nothing (same retry as expiry.spec): retry until the strip is open
	await expect(async () => {
		if ((await t.getAttribute('aria-expanded')) === 'false') await t.click({ timeout: 5_000 });
		await expect(t).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
	}).toPass({ timeout: 20_000 });
}

test('C7 the strip sits at the top of /today: tap = item sheet, ⋯ = the shared ActionSheet, Back first', async ({
	page,
}) => {
	await signIn(page);
	const title = `C7 top ${RUN}`;
	const id = await mkItem(page, { title, date: await day(page, -3) });
	try {
		await page.goto('/today');
		await expect(slip(page)).toBeVisible();
		await expect(slip(page).locator('.cap')).toHaveText(/Slipped · \d+/);
		// at the top: above the day header
		const s = await slip(page).boundingBox();
		const h = await page.locator('main header.day').boundingBox();
		expect(s && h && s.y < h.y).toBe(true);

		await expand(page);
		await row(page, title).getByRole('button', { name: title, exact: true }).click();
		const sheet = page.getByRole('dialog', { name: 'Item' });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByRole('heading', { level: 1, name: title })).toBeVisible();
		await page.goBack(); // Back closes the sheet, not the page
		await expect(sheet).toBeHidden();
		await expect(page).toHaveURL(/\/today/);

		await expand(page);
		await row(page, title)
			.getByRole('button', { name: `Actions for ${title}` })
			.click();
		const acts = page.getByRole('dialog', { name: `Actions for ${title}` });
		await expect(acts).toBeVisible();
		expect(await acts.locator('.act').allInnerTexts()).toEqual(LIST);
		await expectTargets48(page);
		await noDesktopHints(page);
		await page.goBack();
		await expect(acts).toBeHidden();
		await expect(page).toHaveURL(/\/today/);
	} finally {
		await drop(page, id);
	}
});

test('C7 swipe right = done, swipe left = delete, each with Undo', async ({ page }) => {
	await signIn(page);
	const doneTitle = `C7 done ${RUN}`;
	const delTitle = `C7 del ${RUN}`;
	const doneId = await mkItem(page, { title: doneTitle, date: await day(page, -2) });
	const delId = await mkItem(page, { title: delTitle, date: await day(page, -4) });
	try {
		await page.goto('/today');
		await expand(page);

		await swipe(page, row(page, doneTitle), 'right');
		await expect(row(page, doneTitle)).toHaveCount(0);
		await expect(page.locator('.toast')).toContainText(`Done: "${doneTitle}"`);
		expect((await api(page, 'GET', `/api/items/${doneId}`)).j.item.status).toBe('done');
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect(row(page, doneTitle)).toBeVisible(); // Undo puts it back (todo)

		await swipe(page, row(page, delTitle), 'left');
		await expect(row(page, delTitle)).toHaveCount(0);
		await expect(page.locator('.toast')).toContainText(`Deleted "${delTitle}"`);
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect(row(page, delTitle)).toBeVisible();
	} finally {
		await drop(page, doneId);
		await drop(page, delId);
	}
});

test('C8 phone landscape starts collapsed on /today and Home; portrait expanded; no reload on toggle', async ({
	page,
}) => {
	await signIn(page);
	const title = `C8 fold ${RUN}`;
	const id = await mkItem(page, { title, date: await day(page, -3) });
	const vp = page.viewportSize();
	const landscape = !!vp && vp.width > vp.height;
	try {
		for (const url of ['/today', `/?d=${await day(page, 0)}`]) {
			await page.goto(url);
			await expect(slip(page)).toBeVisible();
			const t = slip(page).locator('.toggle');
			await expect(t).toHaveAttribute('aria-expanded', landscape ? 'false' : 'true');
			if (landscape) {
				await expect(rows(page)).toHaveCount(0); // header + chevron only
				await expect(slip(page).locator('.cap')).toHaveText(/Slipped · \d+/);
				const before = page.url();
				await t.click(); // expand: no reload, no data change
				await expect(t).toHaveAttribute('aria-expanded', 'true');
				expect(page.url()).toBe(before);
			}
			await expand(page);
			await expect(row(page, title)).toBeVisible();
		}
	} finally {
		await drop(page, id);
	}
});

test('C5 Move all to today on phone: one batch, every date moves and one Undo brings them back', async ({
	page,
}) => {
	await signIn(page);
	const a = await mkItem(page, { title: `C5a ${RUN}`, date: await day(page, -2), time: '09:30' });
	const b = await mkItem(page, { title: `C5b ${RUN}`, date: await day(page, -6) });
	let posts = 0;
	page.on('request', (r) => {
		if (r.method() === 'POST' && r.url().endsWith('/api/items/move-all')) posts++;
	});
	try {
		await page.goto('/today');
		await expand(page);
		await slip(page).getByRole('button', { name: 'Move all to today' }).click();
		await expect(page.locator('.toast')).toContainText('to today');
		expect(posts).toBe(1);
		await expect(rows(page)).toHaveCount(0);
		const today = await day(page, 0);
		expect((await api(page, 'GET', `/api/items/${a}`)).j.item).toMatchObject({ date: today, time: '09:30' });
		expect((await api(page, 'GET', `/api/items/${b}`)).j.item.date).toBe(today);
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expand(page);
		await expect(row(page, `C5a ${RUN}`)).toBeVisible();
		expect((await api(page, 'GET', `/api/items/${b}`)).j.item.date).toBe(await day(page, -6));
	} finally {
		await drop(page, a);
		await drop(page, b);
	}
});

test('C9 a toast with a sheet open sits 8 px above the sheet, never over its button row', async ({
	page,
}) => {
	await signIn(page);
	const title = `C9 toast ${RUN}`;
	const id = await mkItem(page, { title, date: await day(page, 0), time: '10:00' });
	try {
		await page.goto('/today');
		await page.locator('.ent .t', { hasText: title }).click();
		const sheet = page.getByRole('dialog', { name: 'Item' });
		await expect(sheet).toBeVisible();
		// a write inside the open sheet: the toast lands while the sheet stays
		await sheet.getByRole('button', { name: /^Not started/ }).click();
		await expect(page.locator('.toast')).toContainText(`Started: "${title}"`);
		// bottom = 100dvh - sheet top + 8, i.e. the toast's bottom edge is 8 px above the sheet's top edge
		await expect
			.poll(async () => {
				const t = await page.locator('.toast').boundingBox();
				const p = await sheet.boundingBox();
				return t && p ? Math.round(p.y - (t.y + t.height)) : -1;
			})
			.toBe(8);
	} finally {
		await drop(page, id);
	}
});
