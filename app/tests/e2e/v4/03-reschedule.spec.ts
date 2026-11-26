// Card 03: one reschedule action set in ItemView + the Today row sheet, Skip one occurrence, undo and offline.
// C3–C9, C11, C13–C15 desktop.
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
const postpone = (page: Page) => page.getByRole('button', { name: /Postpone/ }).click();
const menu = (page: Page) => page.getByRole('group', { name: 'Postpone' });
/** the dates a series still shows on the calendar (the end-to-end view of its EXDATEs) */
const seriesDates = async (page: Page, id: string, from: string, to: string) =>
	(await api(page, 'GET', `/api/calendar?from=${from}&to=${to}`)).j.items
		.filter((i: { seriesId?: string }) => i.seriesId === id)
		.map((i: { date: string }) => i.date);
/** owner-local date n days from now (the app's "Today"/"+1 week" clock; project timezone KL) */
const plusDays = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);
const tomorrow = (page: Page) => plusDays(page, 1);

test('C3 the item sheet offers exactly the five reschedule items in order; C8 Skip only on an occurrence', async ({
	page,
}) => {
	await signIn(page);
	const series = await mkItem(page, { title: 'C3 series', date: '2032-04-05', rrule: 'FREQ=WEEKLY;COUNT=4' });
	const plain = await mkItem(page, { title: 'C3 plain', date: '2032-04-06' });
	try {
		await page.goto(`/item/${series}@2032-04-05`);
		await postpone(page);
		await expect(menu(page)).toBeVisible();
		expect(await menu(page).getByRole('button').allInnerTexts()).toEqual([
			'Today',
			'Tomorrow',
			'Next weekday',
			'+1 week',
			'Pick date…',
			'Skip this one',
		]);

		await page.goto(`/item/${plain}`);
		await postpone(page);
		expect(await menu(page).getByRole('button').allInnerTexts()).toEqual([
			'Today',
			'Tomorrow',
			'Next weekday',
			'+1 week',
			'Pick date…',
		]);
	} finally {
		await drop(page, series);
		await drop(page, plain);
	}
});

test('C4/C5 +1 week keeps the time, moves a multi-day end date, and Undo restores both', async ({ page }) => {
	await signIn(page);
	const id = await mkItem(page, {
		title: 'C4 span',
		date: '2027-03-01',
		time: '09:30',
		endDate: '2027-03-03',
	});
	const day = await plusDays(page, 7);
	const end = await plusDays(page, 9);
	try {
		await page.goto(`/item/${id}`);
		await postpone(page);
		const sent = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith(`/api/items/${id}`));
		await menu(page).getByRole('button', { name: '+1 week', exact: true }).click();
		// C3: one PATCH with the new date and the shifted end date (both counted from today)
		expect((await sent).postDataJSON()).toEqual({ date: day, endDate: end });
		await expect(page.locator('.toast')).toContainText('Moved "C4 span" to');
		await expect(page.getByLabel('Date', { exact: true })).toHaveValue(day);
		await expect(page.getByLabel('Until', { exact: true })).toHaveValue(end);
		const after = (await api(page, 'GET', `/api/items/${id}`)).j.item;
		expect(after).toMatchObject({ date: day, endDate: end, time: '09:30' });

		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2027-03-01');
		await expect(page.getByLabel('Until', { exact: true })).toHaveValue('2027-03-03');
		const back = (await api(page, 'GET', `/api/items/${id}`)).j.item;
		expect(back).toMatchObject({ date: '2027-03-01', endDate: '2027-03-03', time: '09:30' });
	} finally {
		await drop(page, id);
	}
});

test('C6 postponing an occurrence detaches that one date; the sheet follows it and the series keeps the rest', async ({
	page,
}) => {
	await signIn(page);
	const id = await mkItem(page, { title: 'C6 series', date: '2032-05-03', rrule: 'FREQ=WEEKLY;COUNT=4' });
	const day = await tomorrow(page);
	try {
		await page.goto(`/item/${id}@2032-05-10`);
		await postpone(page);
		await menu(page).getByRole('button', { name: 'Tomorrow', exact: true }).click();
		// no scope dialog: the sheet moves to the detached row, address included
		await expect(page).not.toHaveURL(/@|%40/);
		await expect(page.getByRole('heading', { level: 1, name: 'C6 series' })).toBeVisible();

		const left = decodeURIComponent(new URL(page.url()).pathname.split('/item/')[1] ?? '');
		expect(left).not.toBe(id);
		const detached = (await api(page, 'GET', `/api/items/${left}`)).j.item;
		expect(detached.date).toBe(day);
		expect(detached.rrule ?? null).toBeNull();
		const series = (await api(page, 'GET', `/api/items/${id}`)).j.item;
		expect(series.rrule).toBe('FREQ=WEEKLY;COUNT=4');
		// the series keeps its other dates; only the shown one is detached
		expect(await seriesDates(page, id, '2032-05-01', '2032-06-01')).toEqual([
			'2032-05-03',
			'2032-05-17',
			'2032-05-24',
		]);
	} finally {
		await drop(page, id);
	}
});

test('C7 one toast names the earliest linked planner block day; the blocks stay where they are', async ({
	page,
}) => {
	await signIn(page);
	const id = await mkItem(page, { title: 'C7 block', date: '2027-05-04', time: '10:00' });
	const early = await api(page, 'POST', '/api/blocks', {
		startAt: '2027-05-04T02:00:00Z',
		itemId: id,
	});
	const late = await api(page, 'POST', '/api/blocks', {
		startAt: '2027-05-06T02:00:00Z',
		itemId: id,
	});
	expect(early.s).toBe(201);
	expect(late.s).toBe(201);
	try {
		await page.goto(`/item/${id}`);
		await postpone(page);
		await menu(page).getByRole('button', { name: 'Today', exact: true }).click();
		const toast = page.locator('.toast');
		await expect(toast).toContainText('Planner block stays on Tue 4 May 2027');
		await expect(toast).not.toContainText('Thu 6 May 2027'); // several blocks: the earliest by start is named
		const blocks = (await api(page, 'GET', '/api/calendar?from=2027-05-04&to=2027-05-07')).j.blocks;
		expect(blocks.some((b: { id: string }) => b.id === early.j.block.id)).toBe(true);
		expect(blocks.some((b: { id: string }) => b.id === late.j.block.id)).toBe(true);
	} finally {
		await api(page, 'DELETE', `/api/blocks/${early.j.block.id}`);
		await api(page, 'DELETE', `/api/blocks/${late.j.block.id}`);
		await drop(page, id);
	}
});

test('C3 Pick date… moves the item to the chosen day', async ({ page }) => {
	await signIn(page);
	const id = await mkItem(page, { title: 'C3 pick', date: '2027-02-01' });
	try {
		await page.goto(`/item/${id}`);
		await postpone(page);
		await menu(page).getByRole('button', { name: 'Pick date…' }).click();
		const dlg = page.getByRole('alertdialog');
		await expect(dlg).toBeVisible();
		await dlg.locator('input[type="date"]').fill('2027-02-15');
		await dlg.getByRole('button', { name: 'Move' }).click();
		await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2027-02-15');
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.date).toBe('2027-02-15');
	} finally {
		await drop(page, id);
	}
});

test('C8/C9 Skip removes one occurrence, writes one EXDATE and Undo brings it back', async ({ page }) => {
	await signIn(page);
	const id = await mkItem(page, { title: 'C8 skip', date: '2032-05-03', rrule: 'FREQ=WEEKLY;COUNT=4' });
	try {
		await page.goto(`/item/${id}@2032-05-10`);
		await postpone(page);
		await menu(page).getByRole('button', { name: 'Skip this one' }).click();
		await expect(page.locator('.toast')).toContainText('Skipped this one');
		// the occurrence is gone: the item page shows the series
		await expect(page).toHaveURL(new RegExp(`/item/${id}$`));
		expect(await seriesDates(page, id, '2032-05-01', '2032-06-01')).toEqual([
			'2032-05-03',
			'2032-05-17',
			'2032-05-24',
		]);
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.rrule).toBe('FREQ=WEEKLY;COUNT=4');

		await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
		await expect
			.poll(async () => seriesDates(page, id, '2032-05-01', '2032-06-01'))
			.toEqual(['2032-05-03', '2032-05-10', '2032-05-17', '2032-05-24']);
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.rrule).toBe('FREQ=WEEKLY;COUNT=4');
	} finally {
		await drop(page, id);
	}
});

test('C11 a foreign id is 404 from the item view, the PATCH and the skip route', async ({
	page,
	browser,
}) => {
	await signIn(page);
	const id = await mkItem(page, { title: 'C11 mine', date: '2032-05-03', rrule: 'FREQ=WEEKLY;COUNT=4' });
	try {
		// the owner opens sign-up for the second account
		await page.goto('/settings/users');
		await page.locator('input[name="open"][value="1"]').check();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();

		// Playwright closes a context it created at test end: closing it here can hang after a navigation
		const ctx = await browser.newContext();
		const other = await ctx.newPage();
		await other.goto('/signup');
		await other.fill('#nu', `stranger${Date.now().toString(36)}`);
		await other.fill('#dn', 'Stranger');
		await other.fill('#np', `${PW} 2`);
		await other.fill('#cp', `${PW} 2`);
		await other.getByRole('button', { name: 'Create account' }).click();
		await other.waitForURL((u) => u.pathname === '/');

		expect((await api(other, 'GET', `/api/items/${id}/view`)).s).toBe(404);
		expect((await api(other, 'PATCH', `/api/items/${id}`, { date: '2027-01-01' })).s).toBe(404);
		expect((await api(other, 'POST', `/api/items/${id}@2032-05-10/skip`)).s).toBe(404);
		// still mine and unchanged
		expect((await api(page, 'GET', `/api/items/${id}`)).j.item.date).toBe('2032-05-03');
	} finally {
		await drop(page, id);
		// leave the shared e2e DB as found: later specs must not inherit open sign-up
		await page.goto('/settings/users');
		await page.locator('input[name="open"][value="0"]').check();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();
	}
});

test('C13 a refused postpone shows the server message and leaves the date unchanged', async ({ page }) => {
	await signIn(page);
	const id = await mkItem(page, { title: 'C13 gone', date: '2027-06-01' });
	await page.goto(`/item/${id}`);
	expect((await drop(page, id)).s).toBe(200); // deleted behind the open sheet
	await postpone(page);
	await menu(page).getByRole('button', { name: 'Today', exact: true }).click();
	const alert = page.getByRole('alert');
	await expect(alert).toContainText('Not found');
	await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2027-06-01');
});

test('C14 an undated item hides Postpone', async ({ page }) => {
	await signIn(page);
	const id = await mkItem(page, { title: 'C14 undated' });
	try {
		await page.goto(`/item/${id}`);
		await expect(page.getByLabel('Date', { exact: true })).toHaveValue('');
		await expect(page.getByRole('button', { name: /Postpone/ })).toHaveCount(0);
	} finally {
		await drop(page, id);
	}
});

test('C15 offline: a postpone queues with "Waiting to sync" and lands when online; Skip only toasts', async ({
	page,
	context,
}) => {
	await signIn(page);
	const id = await mkItem(page, { title: 'C15 offline', date: '2027-07-01' });
	const series = await mkItem(page, { title: 'C15 skip', date: '2032-05-03', rrule: 'FREQ=WEEKLY;COUNT=4' });
	const day = await tomorrow(page);
	try {
		await page.goto(`/item/${id}`);
		await context.setOffline(true);
		await postpone(page);
		await menu(page).getByRole('button', { name: 'Tomorrow', exact: true }).click();
		await expect(page.locator('.toast')).toContainText('Waiting to sync');
		await context.setOffline(false);
		await expect
			.poll(async () => (await api(page, 'GET', `/api/items/${id}`)).j.item.date, { timeout: 15_000 })
			.toBe(day);

		await page.goto(`/item/${series}@2032-05-10`);
		await context.setOffline(true);
		await postpone(page);
		await menu(page).getByRole('button', { name: 'Skip this one' }).click();
		await expect(page.getByRole('alert')).toContainText('offline');
		await context.setOffline(false);
		expect(await seriesDates(page, series, '2032-05-01', '2032-06-01')).toEqual([
			'2032-05-03',
			'2032-05-10',
			'2032-05-17',
			'2032-05-24',
		]);
	} finally {
		await drop(page, id);
		await drop(page, series);
	}
});
