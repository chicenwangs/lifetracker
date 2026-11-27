// Card 09 (O-9, O-11, D-V4-10, D-V4-27) on desktop: the "Next one counts from" radios (only for a
// qualifying daily/monthly rule), the summary line, the whole-row edit without a scope dialog, and the
// "water plants every 3 days" journey — done files a copy today, moves the series +3, one Undo restores it.
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
/** owner-local date n days from now (Asia/Kuala_Lumpur project timezone) */
const day = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);
const shift = (d: string, n: number) => {
	const [y = 0, m = 1, dayOfMonth = 1] = d.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, dayOfMonth + n));
	return t.toISOString().slice(0, 10);
};
/** calendar rows titled `title` in [from, to) */
const rowsOf = async (page: Page, title: string, from: string, to: string) =>
	(
		(await api(page, 'GET', `/api/calendar?from=${from}&to=${to}`)).j as {
			items: { id: string; title: string; date: string; status: string; rrule?: string | null }[];
		}
	).items.filter((i) => i.title === title);

test('C1 the radios show only for a qualifying daily/monthly rule; C3 the summary line', async ({ page }) => {
	await signIn(page);
	const stamp = Date.now().toString(36);
	const base = { title: `C1 ${stamp}`, date: '2032-06-07' };
	const daily = await mkItem(page, { ...base, rrule: 'FREQ=DAILY;INTERVAL=3' });
	const monthly = await mkItem(page, { ...base, title: `C1m ${stamp}`, rrule: 'FREQ=MONTHLY;BYMONTHDAY=7' });
	const weekly = await mkItem(page, { ...base, title: `C1w ${stamp}`, rrule: 'FREQ=WEEKLY;BYDAY=MO' });
	const yearly = await mkItem(page, { ...base, title: `C1y ${stamp}`, rrule: 'FREQ=YEARLY' });
	const until = await mkItem(page, { ...base, title: `C1u ${stamp}`, rrule: 'FREQ=DAILY;UNTIL=2032-12-31' });
	const count = await mkItem(page, { ...base, title: `C1c ${stamp}`, rrule: 'FREQ=DAILY;COUNT=5' });
	const once = await mkItem(page, { ...base, title: `C1o ${stamp}` });
	const group = () => page.getByRole('radiogroup', { name: 'Next one counts from' });
	try {
		for (const [id, shown] of [
			[daily, true],
			[monthly, true],
			[weekly, false], // the builder always sets BYDAY
			[yearly, false],
			[until, false], // O-9
			[count, false], // O-9
			[once, false], // no rule = the whole block is absent
		] as const) {
			await page.goto(`/item/${id}`);
			if (shown) await expect(group()).toBeVisible();
			else {
				await expect(group()).toHaveCount(0);
				await expect(page.getByText('Next one counts from')).toHaveCount(0);
			}
		}

		await page.goto(`/item/${daily}`);
		await expect(page.getByLabel('Scheduled date')).toBeChecked(); // the default
		await page.getByLabel('When I finish it').check();
		await expect(page.locator('.toast')).toContainText('Saved');
		await expect(page.locator('.rfc-sum')).toHaveText('Every 3 days, counted from when you finish');
		expect((await api(page, 'GET', `/api/items/${daily}`)).j.item.repeatFromCompletion).toBe(true);

		// C2: it survives a reload of the sheet
		await page.reload();
		await expect(page.getByLabel('When I finish it')).toBeChecked();
		await expect(page.locator('.rfc-sum')).toHaveText('Every 3 days, counted from when you finish');

		// C3: the existing Repeat ends control still works on the same rule — and COUNT stops it qualifying
		await page.getByLabel('Repeat ends').selectOption('count');
		await expect(page.locator('.toast')).toContainText('Saved');
		await expect(group()).toHaveCount(0);
		expect((await api(page, 'GET', `/api/items/${daily}`)).j.item.repeatFromCompletion).toBeFalsy();
	} finally {
		for (const id of [daily, monthly, weekly, yearly, until, count, once]) await drop(page, id);
	}
});

test('C2/C5/C6/C9 water plants every 3 days: done files a copy today, moves the series +3, one Undo', async ({
	page,
}) => {
	await signIn(page);
	const title = `Water plants ${Date.now().toString(36)}`;
	const today = await day(page, 0);
	const id = await mkItem(page, { title, date: today, rrule: 'FREQ=DAILY;INTERVAL=3' });
	await api(page, 'PATCH', `/api/items/${id}`, { repeatFromCompletion: true });
	const sheet = page.getByRole('dialog', { name: 'Item' });
	try {
		await page.goto(`/?item=${encodeURIComponent(id)}`);
		await expect(sheet).toBeVisible();
		await expect(sheet.locator('.rfc-sum')).toHaveText('Every 3 days, counted from when you finish');

		// C5: a todo -> doing tick moves nothing
		await sheet.locator('button.sq').first().click();
		await expect(page.locator('.toast')).toContainText('Started');
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item).toMatchObject({
			date: today,
			status: 'doing',
		});
		expect(await rowsOf(page, title, today, shift(today, 1))).toHaveLength(1); // no copy yet

		// C5/C6: doing -> done files the copy today and moves the series to today + 3
		await sheet.locator('button.sq').first().click();
		await expect(page.locator('.toast')).toContainText('Done');
		const moved = (await api(page, 'GET', `/api/items/${id}`)).j.item;
		expect(moved).toMatchObject({ date: shift(today, 3), status: 'todo' });
		const todayRows = await rowsOf(page, title, today, shift(today, 1));
		expect(todayRows).toHaveLength(1); // the done copy, dated today
		expect(todayRows[0]).toMatchObject({ status: 'done', date: today });
		expect(todayRows[0]?.id).not.toBe(id);
		expect(todayRows[0]?.rrule ?? null).toBeNull();
		// C4: the series is one row, at its new date — no future ghosts (only the done copy + the series)
		const week = await rowsOf(page, title, today, shift(today, 10));
		expect(week.map((r) => r.date).sort()).toEqual([today, shift(today, 3)]);
		expect(week.filter((r) => r.id === id)).toHaveLength(1);
		expect(week.find((r) => r.id === id)?.date).toBe(shift(today, 3));
		// C9: the sheet stays on the series
		await expect(sheet).toBeVisible();
		await expect(page).not.toHaveURL(/@/);
		await expect(sheet.locator('h1')).toContainText(title);

		// C9: one Undo restores the old date and deletes the copy
		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => (await api(page, 'GET', `/api/items/${id}`)).j.item.date).toBe(today);
		// C9: Undo restores the series' old date and status (doing: the first tick of this test)
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item).toMatchObject({
			status: 'doing',
		});
		const after = await rowsOf(page, title, today, shift(today, 10));
		expect(after).toHaveLength(1);
		expect(after[0]).toMatchObject({ id, date: today, status: 'doing' });
	} finally {
		await drop(page, id);
	}
});

test('C2/C12 editing a from-completion series never asks this/following/all; a failed save reverts the radio', async ({
	page,
}) => {
	await signIn(page);
	const title = `C12 plants ${Date.now().toString(36)}`;
	const id = await mkItem(page, { title, date: '2032-06-07', rrule: 'FREQ=DAILY;INTERVAL=3' });
	await api(page, 'PATCH', `/api/items/${id}`, { repeatFromCompletion: true });
	try {
		await page.goto(`/item/${id}`);
		// C2: the whole row is edited — no scope dialog
		await page.getByLabel('Date', { exact: true }).fill('2032-06-08');
		await page.getByLabel('Date', { exact: true }).press('Tab');
		await expect(page.locator('.toast')).toContainText('Saved');
		expect(await page.getByText(/Edit repeating item/).count()).toBe(0);
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item).toMatchObject({
			date: '2032-06-08',
			repeatFromCompletion: true,
		});

		// C12: a failed PATCH keeps the stored value on the radio
		await page.route(`**/api/items/${id}`, (route) =>
			route.request().method() === 'PATCH'
				? route.fulfill({
						status: 400,
						contentType: 'application/json',
						body: JSON.stringify({ error: { code: 'bad_request', message: 'Nope, not saved' } }),
					})
				: route.continue(),
		);
		await page.getByLabel('Scheduled date').check();
		await expect(page.getByRole('alert')).toContainText('Nope, not saved');
		await expect(page.getByLabel('When I finish it')).toBeChecked();
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.repeatFromCompletion).toBe(true);
	} finally {
		await page.unroute(`**/api/items/${id}`);
		await drop(page, id);
	}
});

test('C9 a stale completion shows a refresh message, not a false Done', async ({ page }) => {
	await signIn(page);
	const title = `Stale tick ${Date.now().toString(36)}`;
	const today = await day(page, 0);
	const id = await mkItem(page, { title, date: today, rrule: 'FREQ=DAILY;INTERVAL=3' });
	await api(page, 'PATCH', `/api/items/${id}`, { repeatFromCompletion: true });
	try {
		await page.goto(`/?item=${encodeURIComponent(id)}`);
		const sheet = page.getByRole('dialog', { name: 'Item' });
		await expect(sheet).toBeVisible();
		// another device already completed the series: the server no-ops and flags the reply
		await page.route(`**/api/items/${id}/cycle`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ item: { id, date: today, status: 'todo' }, stale: true }),
			}),
		);
		await sheet.locator('button.sq').first().click();
		await expect(page.locator('.toast')).toContainText('changed elsewhere — refreshed.');
		await expect(page.locator('.toast')).not.toContainText('Done');
	} finally {
		await page.unroute(`**/api/items/${id}/cycle`);
		await drop(page, id);
	}
});
